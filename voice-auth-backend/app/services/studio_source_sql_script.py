"""SQL Server script preview using an explicitly enabled DEV API.

Runs with the Connection credential and its actual permissions. SQL is not
restricted to read-only: even preview can modify source or remote data. Only
activate only when the caller has deliberately selected this trust model and
the UI clearly communicates it. This helper does not perform ingestion.
"""
from contextlib import closing

from app.services.studio_source_query_sqlserver import _preview_cell

MAX_SQL_CHARS = 32000
MAX_RESULTSETS = 16


def validate_sql_script(sql):
    if not isinstance(sql, str) or not sql.strip() or len(sql) > MAX_SQL_CHARS or '\x00' in sql:
        raise ValueError('QUERY_INPUT_INVALID')
    try:
        if len(sql.encode('utf-16le')) > 64000:
            raise ValueError('QUERY_INPUT_INVALID')
    except UnicodeEncodeError:
        raise ValueError('QUERY_INPUT_INVALID') from None
    return sql


def preview_sql_script(target, sql, *, connect):
    """Execute one batch in one non-pooled session; return the last rowset.

    Fetching is bounded, but source-side query cost and individual cell size
    are not. A final rowset is required; intermediate operations may already
    have taken effect even if the query later fails. The caller must run this
    in an isolated process and enforce a deadline and authorization.
    """
    import pyodbc
    if pyodbc.pooling is not False:
        raise ValueError('QUERY_NONPOOLED_CONNECTION_REQUIRED')
    validate_sql_script(sql)
    with closing(connect(target)) as connection:
        connection.timeout = min(target.timeout, 30)
        cursor = connection.cursor()
        try:
            cursor.execute(sql)
            last = None
            resultsets = 0
            while True:
                if cursor.description is not None:
                    resultsets += 1
                    if resultsets > MAX_RESULTSETS:
                        raise ValueError('QUERY_TOO_MANY_RESULTS')
                    columns = [str(column[0]) for column in cursor.description]
                    if not columns or len(columns) > 128 or len(set(columns)) != len(columns):
                        raise ValueError('QUERY_PREVIEW_COLUMNS_INVALID')
                    rows = cursor.fetchmany(51)
                    last = {'columns': columns,
                            'rows': [[_preview_cell(value) for value in row] for row in rows[:50]],
                            'has_more': len(rows) > 50}
                if not cursor.nextset():
                    break
            if last is None:
                raise ValueError('QUERY_PREVIEW_RESULT_REQUIRED')
            return last
        finally:
            cursor.close()
