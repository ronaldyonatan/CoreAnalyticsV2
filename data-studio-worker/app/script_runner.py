"""Disposable Python/R containers. No host mounts, credentials or network."""
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import subprocess
import time
import uuid

IMAGE = 'coreanalytics-studio-scripts:local'


class ScriptError(ValueError):
    def __init__(self, code, detail=''):
        super().__init__(code)
        self.detail = str(detail)[:1000]


def docker_binary():
    binary = os.environ.get('STUDIO_SCRIPT_DOCKER') or shutil.which('docker')
    if not binary or not os.path.isabs(binary) or not os.path.isfile(binary):
        raise ScriptError('SCRIPT_RUNTIME_NOT_READY')
    return binary


def image_name():
    image = os.environ.get('STUDIO_SCRIPT_IMAGE', IMAGE)
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/:@-]{0,200}', image):
        raise ScriptError('SCRIPT_RUNTIME_NOT_READY')
    return image


def runtime_status():
    ready = False
    try:
        result = subprocess.run([docker_binary(), 'image', 'inspect', '--format', '{{json .Config.Labels}}', image_name()], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=4, check=False)
        labels = json.loads(result.stdout) if result.returncode == 0 and len(result.stdout) < 16000 else {}
        ready = os.name == 'posix' and isinstance(labels, dict) and labels.get('coreanalytics.script-runtime') == '1'
    except (OSError, ValueError, subprocess.TimeoutExpired):
        pass
    return {'python': ready, 'r': ready, 'code': 'SCRIPT_RUNTIME_READY' if ready else 'SCRIPT_RUNTIME_NOT_READY'}


def _communicate(process, payload, timeout=15, limit=1000000):
    """Bound both time and received bytes, without blocking on a full stdin pipe."""
    deadline = time.monotonic() + timeout
    output, offset = bytearray(), 0
    os.set_blocking(process.stdin.fileno(), False)
    os.set_blocking(process.stdout.fileno(), False)
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdin, selectors.EVENT_WRITE)
        selector.register(process.stdout, selectors.EVENT_READ)
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0: raise ScriptError('SCRIPT_TIMEOUT')
            for key, events in selector.select(min(remaining, 0.2)):
                if key.fileobj is process.stdin:
                    try: offset += os.write(process.stdin.fileno(), payload[offset:offset + 16384])
                    except BrokenPipeError: offset = len(payload)
                    if offset == len(payload):
                        selector.unregister(process.stdin); process.stdin.close()
                else:
                    chunk = os.read(process.stdout.fileno(), 16384)
                    if not chunk:
                        selector.unregister(process.stdout); process.stdout.close()
                    else:
                        output.extend(chunk)
                        if len(output) > limit: raise ScriptError('SCRIPT_OUTPUT_TOO_LARGE')
        try: process.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired: raise ScriptError('SCRIPT_TIMEOUT') from None
    return bytes(output)


def run_script(language, columns, rows, code):
    if language not in ('python', 'r') or not isinstance(code, str) or not code.strip() or len(code) > 8000:
        raise ScriptError('SCRIPT_CODE_INVALID')
    validate_table({'columns': columns, 'rows': rows})
    if os.name != 'posix' or not runtime_status()['python']:
        raise ScriptError('SCRIPT_RUNTIME_NOT_READY')
    binary, image = docker_binary(), image_name()
    name = 'core-studio-script-' + uuid.uuid4().hex
    request_id = os.environ.get('STUDIO_SCRIPT_REQUEST_ID', uuid.uuid4().hex)
    if not re.fullmatch('[a-f0-9]{32}', request_id): raise ScriptError('SCRIPT_REQUEST_INVALID')
    command = [binary, 'run', '--rm', '--pull=never', '--name', name,
               '--label', 'coreanalytics.preview-request=' + request_id,
               '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
               '--pids-limit=64', '--memory=384m', '--memory-swap=384m', '--cpus=1',
               '--user=65532:65532', '--init', '--log-driver=none', '--workdir=/work',
               '--tmpfs=/work:rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532',
               '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532',
               *[part for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy') for part in ('--env', key + '=')],
               '--interactive', image]
    payload = json.dumps({'language': language, 'columns': columns, 'rows': rows, 'code': code}, ensure_ascii=False).encode('utf-8')
    if len(payload) > 512000: raise ScriptError('SCRIPT_INPUT_TOO_LARGE')
    process = None
    try:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
        stdout = _communicate(process, payload)
        if process.returncode != 0:
            raise ScriptError('SCRIPT_RESOURCE_LIMIT' if process.returncode in (137, 139) else 'SCRIPT_EXECUTION_FAILED')
        try: result = json.loads(stdout)
        except ValueError: raise ScriptError('SCRIPT_RESULT_INVALID') from None
        if not isinstance(result, dict) or not result.get('success'):
            code = result.get('code', '') if isinstance(result, dict) else ''
            allowed = {'SCRIPT_TIMEOUT', 'SCRIPT_EXECUTION_FAILED', 'SCRIPT_OUTPUT_REQUIRED', 'SCRIPT_OUTPUT_DATAFRAME_REQUIRED', 'SCRIPT_COLUMNS_INVALID', 'SCRIPT_TOO_MANY_ROWS', 'SCRIPT_CELL_INVALID', 'SCRIPT_CELL_TOO_LARGE', 'SCRIPT_OUTPUT_TOO_LARGE', 'SCRIPT_RESULT_INVALID'}
            detail = result.get('detail', '') if isinstance(result, dict) else ''
            raise ScriptError(code if code in allowed else 'SCRIPT_RESULT_INVALID', detail)
        table = result.get('data')
        validate_table(table, logs=True)
        return table
    except OSError:
        raise ScriptError('SCRIPT_RUNTIME_NOT_READY') from None
    finally:
        if process:
            if process.poll() is None:
                try: os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError: pass
                process.wait()
            for pipe in (process.stdin, process.stdout):
                if pipe and not pipe.closed: pipe.close()
        try: subprocess.run([binary, 'rm', '--force', name], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, check=False)
        except (OSError, subprocess.TimeoutExpired): pass


def validate_table(table, logs=False):
    if not isinstance(table, dict) or set(table) != ({'columns', 'rows', 'logs'} if logs else {'columns', 'rows'}): raise ScriptError('SCRIPT_RESULT_INVALID')
    columns, rows = table['columns'], table['rows']
    if not isinstance(columns, list) or not 1 <= len(columns) <= 30 or any(not isinstance(name, str) or not name.strip() or len(name) > 128 for name in columns) or len(set(name.lower() for name in columns)) != len(columns): raise ScriptError('SCRIPT_COLUMNS_INVALID')
    if not isinstance(rows, list) or len(rows) > 50: raise ScriptError('SCRIPT_TOO_MANY_ROWS')
    if any(not isinstance(row, list) or len(row) != len(columns) or any(value is not None and (not isinstance(value, str) or len(value) > 256) for value in row) for row in rows): raise ScriptError('SCRIPT_CELL_INVALID')
    if logs and (not isinstance(table['logs'], str) or len(table['logs']) > 8192): raise ScriptError('SCRIPT_RESULT_INVALID')
