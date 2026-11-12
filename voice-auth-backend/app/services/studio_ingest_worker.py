"""Local-only Stored Dataset ingest worker. Separate SQL control plane; no BI or pipeline mutations.

Launch explicitly; NEVER register in Flask startup. No automatic retries of claimed runs.
"""
import json
import os
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from app.services.studio_dispatcher import driver_launch, terminate

MAX_RESPONSE = 3 * 1024 * 1024
MAX_REQUEST = 1024 * 1024
ALLOWED_FAILURES = {'INGEST_BIND_FAILED', 'INGEST_DRIVER_FAILED', 'INGEST_TIMEOUT',
                    'INGEST_MANIFEST_INVALID', 'INGEST_PUBLISH_FAILED', 'INGEST_WORKER_STOPPED'}


def sql_connection():
    import pyodbc
    connection_string = os.environ.get('STUDIO_INGEST_SQL_CONNECTION_STRING', '')
    if not connection_string or len(connection_string) > 4096:
        raise RuntimeError('INGEST_SQL_CONNECTION_NOT_CONFIGURED')
    return pyodbc.connect(connection_string, autocommit=True, timeout=15)


def rpc(connection, action, worker, run_id=None, **values):
    if action not in {'Claim', 'Heartbeat', 'Complete', 'Fail'}:
        raise ValueError('INGEST_WORKER_ACTION_INVALID')
    args = [action, worker, run_id, values.get('row_count'), values.get('schema_json'),
            values.get('storage_relative_path'), values.get('error_code')]
    cursor = connection.cursor()
    try:
        cursor.execute('EXEC studio.spDatasetIngestWorker @Action=?,@WorkerID=?,@RunID=?,@RowCount=?,@SchemaJson=?,@StorageRelativePath=?,@ErrorCode=?', args)
        row = cursor.fetchone()
        if row is None:
            return None
        return dict(zip([column[0] for column in cursor.description], row))
    finally:
        cursor.close()


def bind_source(owner, run_id, dataset_id):
    from app.clients.core_api_client import core_api
    from app.services.studio_connections import _rows
    from app.routes.studio_datasets_api import _target
    from app.services.studio_batch_bindings import bind_stored_ingest
    rows = _rows(core_api._post_mode('CoreStudioDatasetList', {'UserID': owner}))
    metadata = next((r for r in rows if str(r.get('dataset_id', '')).lower() == dataset_id), None)
    if metadata is None or metadata.get('access_mode') != 'STORED':
        raise ValueError('INGEST_BIND_FAILED')
    graph = {'sources': [{'id': 'source', 'kind': 'dataset', 'dataset_id': dataset_id}],
             'nodes': [],
             'outputs': [{'id': 'output', 'name': 'Dataset', 'input': {'node': 'source', 'port': 'main'}}]}
    definitions = {dataset_id: metadata}
    return bind_stored_ingest(owner, run_id, graph, definitions, _target)


def verify_output(root, run_id):
    # Reuse the existing strict manifest validation, plus an explicit parquet artifact check.
    from app.services.studio_dispatcher import committed_outputs
    graph = {'outputs': [{'id': 'output', 'name': 'Dataset'}]}
    outputs = committed_outputs(root, run_id, graph)
    if not outputs or len(outputs) != 1:
        raise ValueError('INGEST_MANIFEST_INVALID')
    item = outputs[0]
    if item['path'] != run_id + '/output-0' or not isinstance(item['schema'], dict):
        raise ValueError('INGEST_MANIFEST_INVALID')
    directory = Path(root).resolve() / item['path']
    if not any(p.is_file() and not p.is_symlink() and p.name.endswith('.parquet') for p in directory.iterdir()):
        raise ValueError('INGEST_MANIFEST_INVALID')
    return item


def run_driver(request, heartbeat, timeout):
    payload = (json.dumps(request, ensure_ascii=False, allow_nan=False) + '\n').encode()
    if len(payload) > MAX_REQUEST:
        raise ValueError('INGEST_BIND_FAILED')
    command, env = driver_launch(os.environ)
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, cwd='/tmp', env=env, start_new_session=True)
    output = bytearray()
    overflow = threading.Event()
    def read_output():
        while True:
            chunk = process.stdout.read(65536)
            if not chunk:
                break
            if len(output) + len(chunk) > MAX_RESPONSE:
                overflow.set()
            elif not overflow.is_set():
                output.extend(chunk)
    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()
    def write_input():
        try:
            process.stdin.write(payload)
        except (BrokenPipeError, OSError):
            pass
        finally:
            try: process.stdin.close()
            except OSError: pass
    writer = threading.Thread(target=write_input, daemon=True)
    writer.start()
    started = time.monotonic()
    try:
        while process.poll() is None:
            if overflow.is_set():
                raise ValueError('INGEST_DRIVER_FAILED')
            if time.monotonic() - started > timeout:
                raise ValueError('INGEST_TIMEOUT')
            heartbeat()
            time.sleep(5)
        reader.join(timeout=5)
        if overflow.is_set() or reader.is_alive():
            raise ValueError('INGEST_DRIVER_FAILED')
        try:
            result = json.loads(output)
        except (ValueError, UnicodeError):
            raise ValueError('INGEST_DRIVER_FAILED') from None
        if process.returncode != 0 or not isinstance(result, dict) or result.get('success') is not True:
            raise ValueError('INGEST_DRIVER_FAILED')
    finally:
        if process.poll() is None:
            terminate(process)
        writer.join(timeout=2)


def once(connection, worker_id, root, timeout):
    claimed = rpc(connection, 'Claim', worker_id)
    if not claimed:
        return False
    run_id = str(uuid.UUID(claimed['run_id']))
    dataset_id = str(uuid.UUID(claimed['dataset_id']))
    owner = str(uuid.UUID(claimed['requested_by']))
    stage = 'INGEST_BIND_FAILED'
    def heartbeat():
        if (rpc(connection, 'Heartbeat', worker_id, run_id) or {}).get('affected') != 1:
            raise ValueError('INGEST_WORKER_STOPPED')
    try:
        # An immutable output may already exist after a crash; never overwrite it.
        if (Path(root) / run_id).exists():
            raise ValueError('INGEST_PUBLISH_FAILED')
        request = bind_source(owner, run_id, dataset_id)
        heartbeat()
        stage = 'INGEST_DRIVER_FAILED'
        run_driver(request, heartbeat, timeout)
        stage = 'INGEST_MANIFEST_INVALID'
        item = verify_output(root, run_id)
        stage = 'INGEST_PUBLISH_FAILED'
        result = rpc(connection, 'Complete', worker_id, run_id, row_count=item['row_count'],
                     schema_json=json.dumps(item['schema'], ensure_ascii=False),
                     storage_relative_path=item['path'])
        if not result or result.get('affected') != 1:
            raise ValueError('INGEST_PUBLISH_FAILED')
        print('INGEST_SUCCEEDED ' + run_id, flush=True)
    except Exception as exc:
        code = str(exc) if str(exc) in ALLOWED_FAILURES else stage
        print('INGEST_FAILED ' + json.dumps({'run_id': run_id, 'code': code}), flush=True)
        try:
            rpc(connection, 'Fail', worker_id, run_id, error_code=code)
        except Exception:
            print('INGEST_STATUS_UPDATE_FAILED ' + run_id, flush=True)
    return True


def main():
    if os.environ.get('STUDIO_BATCH_DRIVER_MODE') != 'local':
        raise SystemExit('STUDIO_BATCH_DRIVER_MODE must be local')
    root_value = os.environ.get('STUDIO_BATCH_STORAGE_ROOT', '')
    if not root_value or not Path(root_value).is_absolute():
        raise SystemExit('STUDIO_BATCH_STORAGE_ROOT must be an absolute path')
    root = Path(root_value).resolve()
    root.mkdir(parents=True, exist_ok=True)
    worker_id = str(uuid.uuid4())
    single = '--once' in sys.argv
    timeout = min(86400, max(30, int(os.environ.get('STUDIO_INGEST_TIMEOUT', '3600'))))
    with sql_connection() as connection:
        while True:
            processed = once(connection, worker_id, root, timeout)
            if single:
                break
            if not processed:
                time.sleep(3)


if __name__ == '__main__':
    main()
