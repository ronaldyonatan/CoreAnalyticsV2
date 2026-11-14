"""Private launcher for isolated query preview; not exposed by any route."""
from dataclasses import asdict
import json
import math
import re
from pathlib import Path
import subprocess
import sys

from app.connectors.sqlserver import SqlServerTarget
from app.services.studio_source_query_sqlserver import validate_guarded_query

MAX_INPUT = 128 * 1024
MAX_OUTPUT = 2 * 1024 * 1024


class QueryPreviewFailure(ValueError):
    def __init__(self, diagnostic=None):
        super().__init__('QUERY_PREVIEW_UNAVAILABLE')
        self.diagnostic = diagnostic or {}


def _safe_diagnostic(value):
    if not isinstance(value, dict):
        return {}
    stage = value.get('stage')
    error_type = value.get('error_type')
    state = value.get('sqlstate')
    native = value.get('native_error')
    return {
        'stage': stage if stage in {'INPUT', 'DEPENDENCIES', 'TARGET', 'CONNECT_OR_QUERY', 'OUTPUT'} else 'UNKNOWN',
        'error_type': error_type if error_type in {'OperationalError', 'ProgrammingError', 'InterfaceError', 'DataError', 'DatabaseError', 'Error', 'ValueError', 'TypeError', 'ImportError', 'OTHER'} else 'OTHER',
        'sqlstate': state if isinstance(state, str) and re.fullmatch(r'[A-Z0-9]{5}', state) else None,
        'native_error': native if type(native) is int and native in (15196, 15517, 15589, 15590, 15591, 53110) else None,
    }


def run_isolated_preview(target, query, execution_login):
    """Use a fresh interpreter so pyodbc pooling is disabled before connect.

    Authorization, source identity configuration and source permission audit
    remain the caller's responsibility. Not ready for untrusted requests.
    """
    if not isinstance(target, SqlServerTarget):
        raise ValueError('QUERY_SOURCE_UNSUPPORTED')
    validate_guarded_query(query, execution_login, preview_limit=51)
    payload = json.dumps({'target': asdict(target), 'query': query, 'execution_login': execution_login},
                         ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(payload) > MAX_INPUT:
        raise ValueError('QUERY_INPUT_TOO_LARGE')
    try:
        result = subprocess.run([sys.executable, '-m', 'app.services.studio_source_query_preview_runner'],
                                input=payload, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                cwd=str(Path(__file__).resolve().parents[2]), timeout=40, check=False)
        if result.returncode != 0 or len(result.stdout) > MAX_OUTPUT:
            raise ValueError('QUERY_PREVIEW_UNAVAILABLE')
        response = json.loads(result.stdout)
        if not isinstance(response, dict) or response.get('success') is not True or not isinstance(response.get('data'), dict):
            raise QueryPreviewFailure(_safe_diagnostic(response.get('diagnostic')) if isinstance(response, dict) else {})
        data = response['data']
        columns, rows = data.get('columns'), data.get('rows')
        if (set(data) != {'columns', 'rows', 'has_more'} or not isinstance(columns, list)
                or not 1 <= len(columns) <= 128
                or any(not isinstance(column, str) or not column or len(column) > 128 for column in columns)
                or len(set(columns)) != len(columns) or not isinstance(rows, list) or len(rows) > 50
                or type(data.get('has_more')) is not bool):
            raise ValueError('QUERY_PREVIEW_UNAVAILABLE')
        for row in rows:
            if (not isinstance(row, list) or len(row) != len(columns)
                    or any(value is not None and type(value) not in (str, int, float, bool) for value in row)
                    or any(type(value) is float and not math.isfinite(value) for value in row)
                    or any(isinstance(value, str) and len(value) > 256 for value in row)):
                raise ValueError('QUERY_PREVIEW_UNAVAILABLE')
        return data
    except (OSError, subprocess.TimeoutExpired, UnicodeError, json.JSONDecodeError):
        raise ValueError('QUERY_PREVIEW_UNAVAILABLE') from None
