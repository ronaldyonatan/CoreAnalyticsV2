"""Isolated SQL Server preview process; currently not exposed as an API.

Disabling pyodbc pooling before the first connection ensures a cancelled
impersonated session is never returned to a shared application pool. Input
may contain credentials and query text; never print it or log exceptions.
"""
import json
import re
import sys

MAX_INPUT = 128 * 1024
MAX_OUTPUT = 2 * 1024 * 1024


def main():
    stage = 'INPUT'
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT + 1)
        if len(raw) > MAX_INPUT:
            raise ValueError('QUERY_INPUT_TOO_LARGE')
        payload = json.loads(raw)
        if not isinstance(payload, dict) or set(payload) != {'target', 'query', 'execution_login'}:
            raise ValueError('QUERY_INPUT_INVALID')
        stage = 'DEPENDENCIES'
        # Must be set before this process opens any pyodbc connection.
        import pyodbc
        pyodbc.pooling = False
        from app.connectors.sqlserver import SqlServerTarget, open_readonly_connection
        from app.services.studio_source_query_sqlserver import preview_guarded_query
        if not isinstance(payload['target'], dict):
            raise ValueError('QUERY_INPUT_INVALID')
        stage = 'TARGET'
        target = SqlServerTarget(**payload['target'])
        stage = 'CONNECT_OR_QUERY'
        data = preview_guarded_query(target, payload['query'], payload['execution_login'], connect=open_readonly_connection)
        result = {'success': True, 'data': data}
        stage = 'OUTPUT'
        encoded = json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')
        if len(encoded) > MAX_OUTPUT:
            raise ValueError('QUERY_PREVIEW_TOO_LARGE')
    except Exception as exc:
        # Never return driver messages: they can contain hostnames or SQL text.
        known_types = {'OperationalError', 'ProgrammingError', 'InterfaceError', 'DataError',
                       'DatabaseError', 'Error', 'ValueError', 'TypeError', 'ImportError'}
        error_type = type(exc).__name__ if type(exc).__name__ in known_types else 'OTHER'
        state = exc.args[0] if exc.args and isinstance(exc.args[0], str) else ''
        sqlstate = state if re.fullmatch(r'[A-Z0-9]{5}', state) else None
        native = None
        for arg in exc.args:
            if isinstance(arg, str):
                for match in re.findall(r'\((\d{4,5})\)', arg):
                    if int(match) in (15196, 15517, 15589, 15590, 15591, 53110):
                        native = int(match)
                        break
        encoded = json.dumps({'success': False, 'code': 'QUERY_PREVIEW_UNAVAILABLE',
                              'diagnostic': {'stage': stage, 'error_type': error_type,
                                             'sqlstate': sqlstate, 'native_error': native}},
                             separators=(',', ':')).encode('utf-8')
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
