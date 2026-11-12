"""Read-only STORED snapshot resolution and preview.

A snapshot can only be selected from owner-scoped CoreStudioIngest jobs. The
browser supplies a dataset UUID and page number, never a run ID or file path.
The private Parquet reader validates the immutable manifest and file layout.
"""
import json
import os
import re
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import requests

from app.services.studio_dataset_ingest import job as ingest_job, jobs as ingest_jobs

MAX_PAGE = 2**31 - 1
PAGE_SIZE = 50  # Existing private reader contract.


class StoredPreviewError(ValueError):
    def __init__(self, code, status=409):
        super().__init__(code)
        self.http_status = status


def _uuid(value):
    if not isinstance(value, str):
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def _status(value):
    return str(value or '').strip().upper()


def _count(value):
    if type(value) is int and value >= 0:
        return value
    if isinstance(value, str) and value.isascii() and value.isdecimal() and len(value) <= 15:
        return int(value)
    return None


def _valid_jobs(user):
    # CoreStudioIngest Jobs is owner-scoped, but don't make assumptions about
    # the order of jobs returned by the BEAM implementation.
    result = ingest_jobs(user)
    if not isinstance(result, list):
        raise StoredPreviewError('INGEST_METADATA_UNAVAILABLE', 503)
    return [item for item in result if isinstance(item, dict)]


def _snapshot(user, dataset_id, entries=None):
    dataset_id = _uuid(dataset_id)
    if not dataset_id:
        raise StoredPreviewError('DATASET_NOT_FOUND', 404)
    entries = _valid_jobs(user) if entries is None else entries
    candidates = [item for item in entries
                  if _uuid(item.get('dataset_id')) == dataset_id
                  and _status(item.get('status') or item.get('job_status')) == 'SUCCEEDED'
                  and _uuid(item.get('run_id'))]
    if not candidates:
        raise StoredPreviewError('STORED_SNAPSHOT_NOT_READY', 409)
    # Completed timestamps, if present, make selection independent of API sort;
    # otherwise the BEAM list's first successful job wins.
    def date_key(item):
        return str(item.get('completed_at') or item.get('finished_at') or
                   item.get('updated_at') or item.get('created_at') or '')
    if any(date_key(item) for item in candidates):
        candidates.sort(key=date_key, reverse=True)
    summary = candidates[0]
    run_id = _uuid(summary['run_id'])
    # A separate owner-scoped lookup fences the selected run and can provide
    # its published row_count/schema without exposing connection credentials.
    detail = ingest_job(user, run_id)
    if not isinstance(detail, dict):
        raise StoredPreviewError('INGEST_METADATA_UNAVAILABLE', 503)
    detailed_id = detail.get('dataset_id')
    if detailed_id is not None and _uuid(detailed_id) != dataset_id:
        raise StoredPreviewError('STORED_SNAPSHOT_INVALID', 409)
    detailed_status = detail.get('status') or detail.get('job_status')
    if detailed_status is not None and _status(detailed_status) != 'SUCCEEDED':
        raise StoredPreviewError('STORED_SNAPSHOT_NOT_READY', 409)
    return {**summary, **detail, 'dataset_id': dataset_id, 'run_id': run_id, 'status': 'SUCCEEDED'}


def _manifest_count(run_id):
    """Optional local metadata fallback; no arbitrary path supplied by client."""
    configured = os.getenv('STUDIO_BATCH_STORAGE_ROOT', '')
    if not configured or not Path(configured).is_absolute():
        return None
    root = Path(configured).resolve()
    folder = root / run_id
    manifest = folder / 'manifest.json'
    try:
        if folder.is_symlink() or not folder.resolve().is_relative_to(root):
            return None
        if manifest.is_symlink() or not manifest.is_file() or manifest.stat().st_size > 1024 * 1024:
            return None
        value = json.loads(manifest.read_text(encoding='utf-8'))
        if value.get('version') != 1 or value.get('run_id') != run_id:
            return None
        outputs = value.get('outputs')
        if not isinstance(outputs, list) or len(outputs) != 1:
            return None
        output = outputs[0]
        if not isinstance(output, dict) or output.get('id') != 'output' or output.get('path') != 'output-0':
            return None
        target = folder / 'output-0'
        if target.is_symlink() or not target.is_dir() or not target.resolve().is_relative_to(root):
            return None
        if not (target / '_SUCCESS').is_file() or (target / '_SUCCESS').is_symlink():
            return None
        if not any(p.is_file() and not p.is_symlink() and p.name.startswith('part-') and p.suffix == '.parquet'
                   for p in target.iterdir()):
            return None
        return _count(output.get('row_count'))
    except (OSError, ValueError, TypeError, KeyError):
        return None


def enrich_catalog(user, rows):
    """Overlay latest successful STORED ingest; leave DIRECT/ETL untouched.

    Deliberately non-fatal if metadata service is temporarily unreachable.
    Database-side synchronization can be implemented later from migration 019.
    """
    stored = [r for r in rows if str(r.get('access_mode', '')).upper() == 'STORED']
    if not stored:
        return rows
    try:
        entries = _valid_jobs(user)
    except (ValueError, KeyError, TypeError):
        return rows
    result = []
    for row in rows:
        if row not in stored:
            result.append(row)
            continue
        item = dict(row)
        try:
            snapshot = _snapshot(user, row.get('dataset_id'), entries)
            item['storage_status'] = 'READY'
            item['run_id'] = snapshot['run_id']
            n = _count(snapshot.get('row_count'))
            if n is None:
                n = _count(row.get('row_count'))
            if n is None:
                n = _manifest_count(snapshot['run_id'])
            if n is not None:
                item['row_count'] = n
            # A newer failed/queued refresh cannot invalidate the last-good snapshot.
            # Only advertise a refresh status when timestamps establish it is newer.
            last_success = str(snapshot.get('completed_at') or snapshot.get('finished_at') or
                               snapshot.get('updated_at') or snapshot.get('created_at') or '')
            newer = [e for e in entries if _uuid(e.get('dataset_id')) == _uuid(row.get('dataset_id'))
                     and _uuid(e.get('run_id')) != snapshot['run_id']
                     and str(e.get('completed_at') or e.get('finished_at') or
                             e.get('updated_at') or e.get('created_at') or '') > last_success]
            if last_success and newer:
                latest = max(newer, key=lambda e: str(e.get('completed_at') or e.get('finished_at') or
                                                     e.get('updated_at') or e.get('created_at') or ''))
                item['refresh_status'] = _status(latest.get('status') or latest.get('job_status'))
        except (ValueError, KeyError, TypeError):
            pass
        result.append(item)
    return result


def _private_page(run_id, page):
    url = os.getenv('STUDIO_PARQUET_READER_URL', '').rstrip('/')
    parsed = urlsplit(url)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or
        parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
        raise StoredPreviewError('PARQUET_READER_NOT_CONFIGURED', 503)
    if (parsed.scheme == 'http' and parsed.hostname not in ('127.0.0.1', 'localhost', '::1')
        and os.getenv('STUDIO_PARQUET_ALLOW_HTTP', '').lower() != 'true'):
        raise StoredPreviewError('PARQUET_READER_TLS_REQUIRED', 503)
    try:
        path = Path(os.environ['STUDIO_PARQUET_READER_TOKEN_FILE'])
        if path.stat().st_size > 257:
            raise ValueError()
        token = path.read_text().strip()
        if not re.fullmatch(r'[A-Za-z0-9]{32,256}', token):
            raise ValueError()
    except (OSError, KeyError, ValueError):
        raise StoredPreviewError('PARQUET_READER_NOT_CONFIGURED', 503) from None
    try:
        with requests.Session() as session:
            session.trust_env = False
            session.verify = os.getenv('STUDIO_PARQUET_READER_CA_FILE') or True
            with session.post(url + '/internal/output-page',
                              json={'run_id': run_id, 'node_id': 'output', 'page': page},
                              headers={'X-Studio-Reader-Token': token},
                              timeout=(3, 20), allow_redirects=False, stream=True) as response:
                raw = bytearray()
                for chunk in response.iter_content(65536):
                    if len(raw) + len(chunk) > 4 * 1024 * 1024:
                        raise StoredPreviewError('PARQUET_READER_RESPONSE_INVALID', 503)
                    raw.extend(chunk)
                value = json.loads(raw)
                if response.status_code != 200 or value.get('success') is not True:
                    if value.get('code') in ('PARQUET_OUTPUT_NOT_FOUND', 'PARQUET_ARTIFACT_INVALID'):
                        raise StoredPreviewError(value['code'], 409)
                    raise StoredPreviewError('PARQUET_READER_UNAVAILABLE', 503)
                return value['data']
    except StoredPreviewError:
        raise
    except Exception:
        raise StoredPreviewError('PARQUET_READER_UNAVAILABLE', 503) from None


def stored_page(user, dataset, page):
    if type(page) is not int or not 1 <= page <= MAX_PAGE:
        raise StoredPreviewError('DATASET_PAGE_INVALID', 400)
    snapshot = _snapshot(user, dataset['dataset_id'])
    raw = _private_page(snapshot['run_id'], page)
    expected_count = _count(snapshot.get('row_count'))
    expected_schema = snapshot.get('schema_json')
    if expected_schema is not None:
        try:
            if raw.get('schema') != json.loads(expected_schema):
                raise StoredPreviewError('STORED_SNAPSHOT_INVALID', 409)
        except (ValueError, TypeError) as exc:
            if isinstance(exc, StoredPreviewError):
                raise
            raise StoredPreviewError('STORED_SNAPSHOT_INVALID', 409) from None
    fields = raw.get('schema', {}).get('fields') if isinstance(raw.get('schema'), dict) else None
    rows = raw.get('rows')
    if (type(raw.get('total_rows')) is not int or raw['total_rows'] < 0 or
        (expected_count is not None and raw['total_rows'] != expected_count) or
        raw.get('page') != page or raw.get('page_size') != PAGE_SIZE or
        not isinstance(fields, list) or not isinstance(rows, list) or
        len(rows) != min(PAGE_SIZE, max(0, raw['total_rows'] - (page - 1) * PAGE_SIZE)) or
        not isinstance(raw.get('preview_columns'), list) or
        not isinstance(raw.get('columns'), list) or
        len(raw['preview_columns']) != min(30, len(fields)) or
        raw.get('omitted_columns') != max(0, len(fields) - 30) or
        type(raw.get('truncated_cells')) is not bool or
        any(not isinstance(c, dict) or not isinstance(c.get('name'), str) for c in raw['preview_columns']) or
        raw.get('has_more') is not (page * PAGE_SIZE < raw['total_rows']) or
        raw.get('stable_order') is not True or
        any(not isinstance(row, list) or len(row) != len(raw['preview_columns']) or
            any(v is not None and (not isinstance(v, str) or len(v) > 256) for v in row)
            for row in rows)):
        raise StoredPreviewError('PARQUET_READER_RESPONSE_INVALID', 503)
    # Return only the same bounded fields as the existing pipeline preview.
    public = {key: raw[key] for key in ('columns', 'preview_columns', 'rows', 'page', 'page_size',
                                       'has_more', 'total_rows', 'omitted_columns', 'stable_order',
                                       'truncated_cells')}
    return {**public, 'dataset_name': dataset['dataset_name'], 'run_id': snapshot['run_id']}
