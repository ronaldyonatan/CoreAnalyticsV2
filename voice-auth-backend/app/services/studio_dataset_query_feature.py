"""Configuration gate for the experimental, explicitly enabled query path."""
import os
import uuid
from pathlib import Path

from app.services.studio_source_query_sqlserver import validate_guarded_query

# Do not make this an environment flag. Source-server isolation and linked
# server mappings have not been proven safe, and the current executor uses an
# impersonated LOGIN rather than the database-user context being investigated.
QUERY_SECURITY_REVIEW_COMPLETE = False


def require_query_security_review():
    if not QUERY_SECURITY_REVIEW_COMPLETE:
        raise ValueError('DATASET_QUERY_SECURITY_REVIEW_REQUIRED')


def check_configuration(connection_id):
    if any(os.getenv(key, '').strip().lower() != 'true' for key in (
            'STUDIO_DATASET_QUERY_SQLSERVER_ENABLED', 'STUDIO_DATASET_QUERY_METADATA_ENABLED')):
        raise ValueError('DATASET_QUERY_DISABLED')
    require_query_security_review()
    try:
        requested = str(uuid.UUID(str(connection_id)))
        allowed = str(uuid.UUID(os.getenv('STUDIO_DATASET_QUERY_CONNECTION_ID', '')))
    except (ValueError, TypeError, AttributeError):
        raise ValueError('DATASET_QUERY_CONFIGURATION_INVALID') from None
    if requested != allowed:
        raise ValueError('DATASET_QUERY_CONNECTION_NOT_ALLOWED')
    for key in ('STUDIO_SQLSERVER_JDBC_JAR', 'STUDIO_SQLSERVER_QUERY_GUARD_JAR'):
        path = Path(os.getenv(key, ''))
        if not path.is_absolute() or not path.is_file():
            raise ValueError('DATASET_QUERY_CONFIGURATION_INVALID')
    login = os.getenv('STUDIO_DATASET_QUERY_EXECUTION_LOGIN', '')
    validate_guarded_query('SELECT 1', login)
    return requested, login
