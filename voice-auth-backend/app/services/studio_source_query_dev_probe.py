"""Fixed-query DEV probe; never a general-purpose query execution endpoint."""
import os
import uuid

from app.connectors.sqlserver import SqlServerTarget
from app.services.studio_source_query_preview import run_isolated_preview

_FIXED_QUERY = 'SELECT TOP (1) CAST(1 AS int) AS has_row FROM [BI].[dbo].[BI_DailyTracking]'
_LOGIN = 'CoreAnalytics_QueryReader_Dev'


def validate_probe_request(connection_id):
    if os.getenv('STUDIO_QUERY_DEV_PROBE_ENABLED', '').strip().lower() != 'true':
        raise ValueError('QUERY_DEV_PROBE_DISABLED')
    try:
        requested = str(uuid.UUID(str(connection_id)))
        allowed = str(uuid.UUID(os.getenv('STUDIO_QUERY_DEV_CONNECTION_ID', '')))
    except (ValueError, TypeError, AttributeError):
        raise ValueError('QUERY_DEV_PROBE_CONFIGURATION_INVALID') from None
    if requested != allowed:
        raise ValueError('QUERY_DEV_CONNECTION_NOT_ALLOWED')
    return requested


def run_fixed_probe(target):
    if not isinstance(target, SqlServerTarget) or target.database.casefold() != 'bi':
        raise ValueError('QUERY_DEV_SOURCE_NOT_ALLOWED')
    result = run_isolated_preview(target, _FIXED_QUERY, _LOGIN)
    rows = result['rows']
    if (result['columns'] != ['has_row'] or result['has_more'] or len(rows) > 1
            or any(len(row) != 1 or type(row[0]) is not int or row[0] != 1 for row in rows)):
        raise ValueError('QUERY_DEV_PROBE_RESULT_INVALID')
    return {'status': 'QUERY_DEV_PROBE_PASSED', 'has_at_least_one_row': bool(rows)}
