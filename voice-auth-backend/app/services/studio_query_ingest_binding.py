"""Experimental STORED query ingest binding; not wired to the worker.

This binding only prepares a private worker request. The worker feature is
disabled by default, and must remain disabled until the SQL RPC, audited source
identity, Spark driver, log redaction and DEV integration have been reviewed.
"""
import copy
import os
import uuid

from app.connectors.registry import resolve
from app.connectors.sqlserver import SqlServerTarget
from app.services.studio_batch_bindings import validate_batch_graph
from app.services.studio_dataset_query_metadata import read_definition
from app.services.studio_object_access import require_access
from app.services.studio_source_query_sqlserver import validate_guarded_query
from app.services.studio_source_query_validation import sqlserver_derived_table_query
from app.services.studio_dataset_query_feature import require_query_security_review


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError('QUERY_INGEST_ID_INVALID') from None


def bind_query_ingest(owner, run_id, graph, definitions, target_resolver):
    """Authorize and bind a single query dataset without logging its secrets."""
    if os.getenv('STUDIO_DATASET_QUERY_SQLSERVER_ENABLED', '').strip().lower() != 'true':
        raise ValueError('QUERY_INGEST_DISABLED')
    require_query_security_review()
    validate_batch_graph(graph)
    run_id = _uuid(run_id)
    if len(graph['sources']) != 1 or graph['sources'][0].get('kind') != 'dataset' or graph['nodes'] or len(graph['outputs']) != 1:
        raise ValueError('QUERY_INGEST_GRAPH_INVALID')
    source = graph['sources'][0]
    dataset_id = _uuid(source['dataset_id'])
    metadata = definitions.get(dataset_id)
    if (not isinstance(metadata, dict) or metadata.get('access_mode') != 'STORED'
            or str(metadata.get('source_schema') or '').casefold() != '__coreanalytics_query__'
            or _uuid(metadata.get('source_name')) != dataset_id):
        raise ValueError('QUERY_INGEST_DATASET_INVALID')
    connection_id = _uuid(metadata.get('connection_id'))
    allowed_connection = _uuid(os.getenv('STUDIO_DATASET_QUERY_CONNECTION_ID', ''))
    if connection_id != allowed_connection:
        raise ValueError('QUERY_INGEST_CONNECTION_NOT_ALLOWED')
    login = os.getenv('STUDIO_DATASET_QUERY_EXECUTION_LOGIN', '')
    if not os.getenv('STUDIO_SQLSERVER_QUERY_GUARD_JAR') or not os.getenv('STUDIO_SQLSERVER_JDBC_JAR'):
        raise ValueError('QUERY_INGEST_GUARD_NOT_CONFIGURED')

    # Signed authorization and RPC before resolving source credentials.
    require_access(owner, 'DATASET', dataset_id, 'execute')
    definition = read_definition(owner, dataset_id)
    if _uuid(definition.get('dataset_id')) != dataset_id or _uuid(definition.get('connection_id')) != connection_id or definition.get('dialect') != 'sqlserver':
        raise ValueError('QUERY_INGEST_DEFINITION_MISMATCH')
    query = definition.get('query')
    validate_guarded_query(query, login)
    query = sqlserver_derived_table_query(query)

    target = target_resolver(owner, connection_id)
    if not isinstance(target, SqlServerTarget):
        raise ValueError('QUERY_INGEST_SOURCE_UNSUPPORTED')
    connector = resolve('sqlserver')
    if connector.validate_target is None:
        raise ValueError('QUERY_INGEST_SOURCE_UNSUPPORTED')
    bound = connector.bind_source(source, metadata, target, connector.validate_target)
    bound.pop('schema'); bound.pop('table')
    bound.update(kind='sqlserver_query', connection_id=connection_id, execution_login=login, query=query)
    return {'run_id': run_id, 'sources': [bound], 'nodes': [], 'outputs': copy.deepcopy(graph['outputs'])}
