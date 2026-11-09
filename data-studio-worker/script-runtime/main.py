"""Trusted container entrypoint; user code runs in a bounded child process."""
import json
import os
import signal
import subprocess
import sys


def main():
    try:
        request = json.loads(sys.stdin.buffer.read(512001))
        if not isinstance(request, dict) or set(request) != {'language', 'columns', 'rows', 'code'} or request['language'] not in ('python', 'r'):
            raise ValueError('SCRIPT_REQUEST_INVALID')
        command = [sys.executable, '-I', '-B', '/opt/studio-runner/python_driver.py'] if request['language'] == 'python' else ['Rscript', '--vanilla', '/opt/studio-runner/r_driver.R']
        child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            stdout, stderr = child.communicate(json.dumps(request, ensure_ascii=False).encode('utf-8'), timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.communicate()
            return {'success': False, 'code': 'SCRIPT_TIMEOUT'}
        finally:
            # Also reap processes forked by a script after its main child exited.
            try: os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        if len(stdout) > 1000000 or len(stderr) > 1000000:
            return {'success': False, 'code': 'SCRIPT_OUTPUT_TOO_LARGE'}
        if child.returncode != 0:
            return {'success': False, 'code': 'SCRIPT_EXECUTION_FAILED', 'detail': stderr.decode('utf-8', errors='replace')[-1000:]}
        result = json.loads(stdout)
        if not isinstance(result, dict): raise ValueError('SCRIPT_RESULT_INVALID')
        return result
    except Exception:
        return {'success': False, 'code': 'SCRIPT_RESULT_INVALID'}


if __name__ == '__main__':
    sys.stdout.write(json.dumps(main(), ensure_ascii=False, allow_nan=False))
