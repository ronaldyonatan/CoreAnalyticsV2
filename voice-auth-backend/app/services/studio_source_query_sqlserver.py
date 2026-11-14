"""Preparation for SQL Server query datasets; not wired to application routes.

The configured execution login must be provisioned and independently audited
as read-only on every accessible database, including object-level grants and
executable functions. The SQL checks below are defense in depth and do not
establish that property. Never expose the execution login to a query author.
"""
import re
import math
from datetime import date, datetime, time
from decimal import Decimal
from contextlib import closing

from app.services.studio_source_query_validation import validate_source_query

_LOGIN_NAME = re.compile(r'^[A-Za-z_][A-Za-z0-9_.@\\-]{0,127}$')


def validate_guarded_query(query, execution_login, *, preview_limit=None):
    """Validate the shape and trusted server-configured execution identity."""
    validate_source_query(query, 'sqlserver')
    if not isinstance(execution_login, str) or not _LOGIN_NAME.fullmatch(execution_login):
        raise ValueError('QUERY_EXECUTION_LOGIN_INVALID')
    if execution_login.casefold() in ('sa', 'dbo'):
        raise ValueError('QUERY_EXECUTION_LOGIN_INVALID')
    if preview_limit is not None and (type(preview_limit) is not int or not 1 <= preview_limit <= 51):
        raise ValueError('QUERY_PREVIEW_LIMIT_INVALID')

_IDENTITY_CHECK = """SELECT SUSER_SNAME(), IS_SRVROLEMEMBER('sysadmin'),
 IS_ROLEMEMBER('db_owner'), HAS_PERMS_BY_NAME(NULL,'DATABASE','CONTROL'),
 HAS_PERMS_BY_NAME(NULL,'DATABASE','ALTER'), HAS_PERMS_BY_NAME(NULL,'DATABASE','INSERT'),
 HAS_PERMS_BY_NAME(NULL,'DATABASE','UPDATE'), HAS_PERMS_BY_NAME(NULL,'DATABASE','DELETE'),
 HAS_PERMS_BY_NAME(NULL,'DATABASE','EXECUTE')"""


def preview_guarded_query(target, query, execution_login, *, connect):
    """Run bounded preview on a *dedicated*, non-pooled SQL Server connection.

    Not wired to routes. The caller must supply a connection factory whose
    sessions are not pooled, and a reviewed restricted identity. Row count is
    bounded, but query cost and the size received from the driver are not yet
    bounded; this helper must not be enabled for untrusted requests until those
    and database/object-level permissions have been validated in DEV.
    """
    import pyodbc
    if pyodbc.pooling is not False:
        raise ValueError('QUERY_NONPOOLED_CONNECTION_REQUIRED')
    validate_guarded_query(query, execution_login, preview_limit=51)
    with closing(connect(target)) as connection:
        connection.timeout = min(target.timeout, 30)
        cursor = connection.cursor()
        try:
            # SQL Server's NO REVERT context must be set by an ad-hoc command,
            # not an ODBC prepared/RPC batch (which produces error 15590).
            # The login is server-configured and strictly validated above; it
            # cannot contain a quote or SQL delimiter. User SQL remains bound.
            cursor.execute(f"EXECUTE AS LOGIN = N'{execution_login}' WITH NO REVERT;")
            cursor.execute(_IDENTITY_CHECK)
            identity = cursor.fetchone()
            if (identity is None or len(identity) != 9 or not isinstance(identity[0], str)
                    or identity[0].casefold() != execution_login.casefold()
                    or any(permission != 0 for permission in identity[1:])):
                raise ValueError('QUERY_EXECUTION_IDENTITY_UNSAFE')
            cursor.execute('SET ROWCOUNT 51;')
            cursor.execute('EXEC sys.sp_executesql ?', query)
            if cursor.description is None:
                raise ValueError('QUERY_PREVIEW_RESULT_REQUIRED')
            columns = [str(column[0]) for column in cursor.description]
            if not columns or len(columns) > 128 or len(set(columns)) != len(columns):
                raise ValueError('QUERY_PREVIEW_COLUMNS_INVALID')
            rows = cursor.fetchmany(51)
            # An extra result set is not supported. NO REVERT holds until the
            # non-pooled connection closes, including on errors or cancellation.
            if cursor.nextset():
                raise ValueError('QUERY_PREVIEW_MULTIPLE_RESULTS')
            return {'columns': columns, 'rows': [[_preview_cell(cell) for cell in row] for row in rows[:50]],
                    'has_more': len(rows) > 50}
        finally:
            cursor.close()


def _preview_cell(value):
    """Use bounded JSON-safe representations, preserving exact decimal text."""
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)[:256]
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value[:128]).hex()
    return str(value)[:256]
