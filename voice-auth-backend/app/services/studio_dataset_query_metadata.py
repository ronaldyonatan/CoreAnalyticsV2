"""Signed metadata transport for SQL-backed dataset definitions.

The DEV route and worker require explicit opt-in and a manually installed SQL
RPC. Query text is sensitive metadata and must never be sent to debug logging.
"""
import json
import os
import uuid

from app.clients.core_api_client import CoreApiClient
from app.services.studio_object_access import _envelope
from app.services.studio_source_query_validation import validate_stored_sqlserver_query
from app.services.studio_source_sql_script import validate_sql_script


class DatasetQueryMetadataError(ValueError):
    pass


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise DatasetQueryMetadataError('DATASET_QUERY_ID_INVALID') from None


def _call(body):
    if os.getenv('STUDIO_DATASET_QUERY_METADATA_ENABLED', '').strip().lower() != 'true':
        raise DatasetQueryMetadataError('DATASET_QUERY_METADATA_DISABLED')
    # Reuse the established UTF-16LE HMAC/nonce protocol and bind a distinct
    # purpose inside the signed request. Do not call the debug-printing client.
    if not isinstance(body, dict) or 'Purpose' in body:
        raise DatasetQueryMetadataError('DATASET_QUERY_REQUEST_INVALID')
    envelope = _envelope({**body, 'Purpose': 'DATASET_QUERY_V1'})
    client = CoreApiClient()
    try:
        response = client.session.post(client.url, json={'Mode': 'CoreStudioDatasetQuery',
            'Payload': json.dumps(envelope, ensure_ascii=True, separators=(',', ':'))}, timeout=client.timeout)
        response.raise_for_status()
        parsed = response.json()
    except Exception:
        raise DatasetQueryMetadataError('DATASET_QUERY_METADATA_UNAVAILABLE') from None
    rows = parsed.get('data') if isinstance(parsed, dict) else None
    row = rows[0] if isinstance(rows, list) and rows else rows if isinstance(rows, dict) else None
    if not isinstance(row, dict) or row.get('success') not in (True, 1):
        raise DatasetQueryMetadataError('DATASET_QUERY_OPERATION_DENIED')
    return row


def create_definition(actor, connection_id, name, description, query):
    """Request a STORED query dataset; SQL RPC must enforce source access."""
    actor, connection_id = _uuid(actor), _uuid(connection_id)
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 150:
        raise DatasetQueryMetadataError('DATASET_QUERY_NAME_INVALID')
    if not isinstance(description, str) or len(description) > 1000:
        raise DatasetQueryMetadataError('DATASET_QUERY_DESCRIPTION_INVALID')
    validate_stored_sqlserver_query(query)
    row = _call({'Action': 'CREATE', 'ActorUserID': actor, 'ConnectionID': connection_id,
                 'Name': name.strip(), 'Description': description, 'Query': query})
    if row.get('code') != 'DATASET_QUERY_CREATED':
        raise DatasetQueryMetadataError('DATASET_QUERY_RESPONSE_INVALID')
    return {'dataset_id': _uuid(row.get('dataset_id'))}


def read_definition(actor, dataset_id):
    """Read query text for an authorized worker; SQL RPC must recheck access."""
    dataset_id = _uuid(dataset_id)
    row = _call({'Action': 'GET', 'ActorUserID': _uuid(actor), 'DatasetID': dataset_id})
    if row.get('code') != 'DATASET_QUERY_INFO' or row.get('dialect') != 'sqlserver':
        raise DatasetQueryMetadataError('DATASET_QUERY_RESPONSE_INVALID')
    query = row.get('source_query')
    validate_stored_sqlserver_query(query)
    if _uuid(row.get('dataset_id')) != dataset_id:
        raise DatasetQueryMetadataError('DATASET_QUERY_RESPONSE_INVALID')
    return {'dataset_id': dataset_id, 'connection_id': _uuid(row.get('connection_id')),
            'dialect': 'sqlserver', 'query': query}


def create_script_definition(actor, connection_id, name, description, script):
    """Draft SQL-script metadata path; does not execute or enqueue the script.

    The caller must enforce the opt-in trust model and connection permissions.
    Unlike the older SELECT-only candidate, scripts can mutate data using the
    source credential, so this function alone is never a security boundary.
    """
    actor, connection_id = _uuid(actor), _uuid(connection_id)
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 150:
        raise DatasetQueryMetadataError('DATASET_QUERY_NAME_INVALID')
    if not isinstance(description, str) or len(description) > 1000:
        raise DatasetQueryMetadataError('DATASET_QUERY_DESCRIPTION_INVALID')
    validate_sql_script(script)
    row = _call({'Action':'CREATE', 'ActorUserID':actor, 'ConnectionID':connection_id,
                 'Name':name.strip(), 'Description':description, 'Query':script})
    if row.get('code') != 'DATASET_QUERY_CREATED':
        raise DatasetQueryMetadataError('DATASET_QUERY_RESPONSE_INVALID')
    return {'dataset_id': _uuid(row.get('dataset_id'))}


def read_script_definition(actor, dataset_id):
    """Retrieve a signed, authorized script for the future ingest worker."""
    dataset_id = _uuid(dataset_id)
    row = _call({'Action':'GET', 'ActorUserID':_uuid(actor), 'DatasetID':dataset_id})
    if row.get('code') != 'DATASET_QUERY_INFO' or row.get('dialect') != 'sqlserver':
        raise DatasetQueryMetadataError('DATASET_QUERY_RESPONSE_INVALID')
    script = validate_sql_script(row.get('source_query'))
    if _uuid(row.get('dataset_id')) != dataset_id:
        raise DatasetQueryMetadataError('DATASET_QUERY_RESPONSE_INVALID')
    return {'dataset_id':dataset_id, 'connection_id':_uuid(row.get('connection_id')),
            'dialect':'sqlserver', 'query':script}


def script_metadata_ready(actor):
    row = _call({'Action':'STATUS', 'ActorUserID':_uuid(actor)})
    return row.get('code') == 'DATASET_QUERY_READY'
