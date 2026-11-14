"""Explicit opt-in DEV SQL preview using the Connection's actual privileges."""
from dataclasses import asdict
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

from app.connectors.sqlserver import SqlServerTarget
from app.services.studio_source_sql_script import validate_sql_script


def allowed_connection(value):
    if os.getenv('STUDIO_SQL_SCRIPT_PREVIEW_DEV_ENABLED', '').strip().lower() != 'true':
        raise ValueError('QUERY_SCRIPT_DEV_DISABLED')
    try:
        requested = str(uuid.UUID(str(value)))
        allowed = str(uuid.UUID(os.getenv('STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID', '')))
    except (ValueError, TypeError, AttributeError):
        raise ValueError('QUERY_SCRIPT_DEV_CONFIGURATION_INVALID') from None
    if requested != allowed:
        raise ValueError('QUERY_SCRIPT_DEV_CONNECTION_DENIED')
    return requested


def preview(target, sql):
    if not isinstance(target, SqlServerTarget):
        raise ValueError('QUERY_SCRIPT_SOURCE_UNSUPPORTED')
    validate_sql_script(sql)
    payload = json.dumps({'target': asdict(target), 'query': sql}, ensure_ascii=False).encode('utf-8')
    if len(payload) > 128 * 1024:
        raise ValueError('QUERY_INPUT_INVALID')
    try:
        proc = subprocess.run([sys.executable, '-m', 'app.services.studio_source_sql_script_runner'],
                              input=payload, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              cwd=str(Path(__file__).resolve().parents[2]), timeout=40, check=False)
        if proc.returncode != 0 or len(proc.stdout) > 2 * 1024 * 1024:
            raise ValueError('QUERY_SCRIPT_PREVIEW_FAILED')
        result = json.loads(proc.stdout)
        if isinstance(result, dict) and result.get('success') is False:
            codes = {'QUERY_SQL_OBJECT_NOT_FOUND', 'QUERY_SQL_COLUMN_NOT_FOUND',
                     'QUERY_SQL_SYNTAX_ERROR', 'QUERY_SQL_PERMISSION_DENIED'}
            raise ValueError(result.get('code') if result.get('code') in codes else 'QUERY_SCRIPT_PREVIEW_FAILED')
        data = result.get('data') if isinstance(result, dict) and result.get('success') is True else None
        if not isinstance(data, dict) or set(data) != {'columns', 'rows', 'has_more'}:
            raise ValueError('QUERY_SCRIPT_PREVIEW_FAILED')
        return data
    except (OSError, subprocess.TimeoutExpired, UnicodeError, json.JSONDecodeError):
        raise ValueError('QUERY_SCRIPT_PREVIEW_FAILED') from None
