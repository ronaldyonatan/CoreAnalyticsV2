"""Opt-in local Spark preview subprocess for bounded, authenticated samples."""
import json
import os
import re
import shutil
import uuid
import subprocess
import threading
from pathlib import Path

_LOCK = threading.BoundedSemaphore(1)
_ROOT = Path(__file__).resolve().parents[3]
_RUNNER = _ROOT / 'data-studio-worker' / 'run_preview.py'


def spark_preview(sample, steps):
    if not isinstance(steps, list) or len(steps) > 30:
        raise ValueError('INVALID_STEPS')
    return _run_worker({'columns': [column['name'] for column in sample['preview_columns']], 'rows': sample['rows'], 'steps': steps})


def spark_graph_preview(sources, nodes, outputs):
    return _run_worker({'sources': sources, 'nodes': nodes, 'outputs': outputs})


class ScriptPreviewError(ValueError):
    def __init__(self, code, detail=''):
        super().__init__(code)
        self.detail = str(detail)[:1000]


def scripting_status():
    return _run_worker({'script_status': True})


def _cleanup_scripts(request_id):
    binary = os.getenv('STUDIO_SCRIPT_DOCKER') or shutil.which('docker')
    if not binary: return
    try:
        result = subprocess.run([binary, 'ps', '--all', '--quiet', '--filter', 'label=coreanalytics.preview-request=' + request_id], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3, check=False)
        ids = [value for value in result.stdout.decode('ascii', errors='ignore').splitlines() if re.fullmatch('[a-f0-9]{12,64}', value)]
        if ids: subprocess.run([binary, 'rm', '--force', *ids], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, check=False)
    except (OSError, subprocess.TimeoutExpired): pass


def _run_worker(request):
    python = os.environ.get('STUDIO_SPARK_PREVIEW_PYTHON') or str(_RUNNER.parent / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python'))
    if not os.path.isabs(python) or not os.path.isfile(python) or not _RUNNER.is_file():
        raise ValueError('SPARK_PREVIEW_NOT_CONFIGURED')
    payload = json.dumps(request, ensure_ascii=False)
    if len(payload.encode('utf-8')) > 512_000:
        raise ValueError('SPARK_PREVIEW_TOO_LARGE')
    steps = request.get('steps', []) + [step for node in request.get('nodes', []) for step in node.get('steps', [])]
    script_count = sum(isinstance(step, dict) and step.get('type') == 'script' for step in steps)
    if script_count > 4: raise ScriptPreviewError('SCRIPT_TOO_MANY_STEPS')
    ai_count = sum(isinstance(step, dict) and step.get('type') == 'ai_llm' for step in steps)
    if ai_count > 4: raise ScriptPreviewError('AI_TOO_MANY_STEPS', 'Preview maksimal empat tile generatif AI.')
    locked = 'script_status' not in request and 'ai_status' not in request
    if locked and not _LOCK.acquire(blocking=False): raise ValueError('SPARK_PREVIEW_BUSY')
    request_id = uuid.uuid4().hex
    try:
        env = {key: os.environ[key] for key in ('PATH', 'JAVA_HOME', 'TMPDIR', 'SYSTEMROOT', 'WINDIR', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'STUDIO_SCRIPT_DOCKER', 'STUDIO_SCRIPT_IMAGE', 'STUDIO_AI_OLLAMA_URL') if key in os.environ}
        java_home = os.environ.get('STUDIO_SPARK_PREVIEW_JAVA_HOME') or env.get('JAVA_HOME')
        if not java_home:
            # Spark 3.5 uses Java 17; macOS may otherwise default to Java 21.
            java_home = next((str(path) for path in (
                Path('/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'),
                Path('/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'),
            ) if (path / 'bin/java').is_file()), None)
        if java_home:
            env['JAVA_HOME'] = java_home
        for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS'):
            env[key] = '1'
        env['LOKY_MAX_CPU_COUNT'] = '2'
        env['STUDIO_SCRIPT_REQUEST_ID'] = request_id
        env['SPARK_LOCAL_IP'] = '127.0.0.1'
        env['PYSPARK_PYTHON'] = python
        result = subprocess.run([python, str(_RUNNER)], input=payload, text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=str(_RUNNER.parent), env=env, timeout=120 if ai_count else 60, check=False)
        if result.returncode != 0 or len(result.stdout) > (3_000_000 if 'sources' in request else 1_000_000):
            raise ValueError('SPARK_PREVIEW_FAILED')
        try:
            data = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise ValueError('SPARK_PREVIEW_FAILED') from None
        if not isinstance(data, dict) or not data.get('success'):
            code = data.get('code', '') if isinstance(data, dict) else ''
            if isinstance(code, str) and re.fullmatch(r'(?:SCRIPT|DATA_SCIENCE|PERFORMANCE|AI)_[A-Z_]{1,64}', code): raise ScriptPreviewError(code, data.get('detail', ''))
            raise ValueError('SPARK_PREVIEW_INVALID_STEP')
        return data['data']
    except (OSError, subprocess.TimeoutExpired):
        raise ValueError('SPARK_PREVIEW_FAILED') from None
    finally:
        if script_count: _cleanup_scripts(request_id)
        if locked: _LOCK.release()
