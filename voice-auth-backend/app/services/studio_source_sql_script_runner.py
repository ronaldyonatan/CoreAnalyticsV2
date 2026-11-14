"""Run DEV SQL script preview in a fresh, non-pooled process."""
import json
import re
import sys

MAX_INPUT = 128 * 1024
MAX_OUTPUT = 2 * 1024 * 1024


def safe_failure(exc):
    """Map a few SQL Server error numbers; never return the driver message."""
    import pyodbc
    if isinstance(exc, pyodbc.Error):
        mapping = {'208': 'QUERY_SQL_OBJECT_NOT_FOUND', '207': 'QUERY_SQL_COLUMN_NOT_FOUND',
                   '102': 'QUERY_SQL_SYNTAX_ERROR', '156': 'QUERY_SQL_SYNTAX_ERROR',
                   '229': 'QUERY_SQL_PERMISSION_DENIED'}
        for arg in exc.args:
            if isinstance(arg, str):
                for number in re.findall(r'\((\d{2,5})\)', arg):
                    if number in mapping:
                        return mapping[number]
    return 'QUERY_SCRIPT_PREVIEW_FAILED'


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT + 1)
        if len(raw) > MAX_INPUT:
            raise ValueError('QUERY_INPUT_INVALID')
        payload = json.loads(raw)
        if not isinstance(payload, dict) or set(payload) != {'target', 'query'}:
            raise ValueError('QUERY_INPUT_INVALID')
        import pyodbc
        pyodbc.pooling = False
        from app.connectors.sqlserver import SqlServerTarget, open_readonly_connection
        from app.services.studio_source_sql_script import preview_sql_script
        target = SqlServerTarget(**payload['target'])
        data = preview_sql_script(target, payload['query'], connect=open_readonly_connection)
        result = json.dumps({'success': True, 'data': data}, ensure_ascii=False,
                            allow_nan=False, separators=(',', ':')).encode('utf-8')
        if len(result) > MAX_OUTPUT:
            raise ValueError('QUERY_PREVIEW_TOO_LARGE')
    except Exception as exc:
        # Exceptions can contain SQL, server names, or credentials.
        try:
            code = safe_failure(exc)
        except Exception:
            code = 'QUERY_SCRIPT_PREVIEW_FAILED'
        result = json.dumps({'success':False,'code':code}, separators=(',', ':')).encode('utf-8')
    sys.stdout.buffer.write(result)
    sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
