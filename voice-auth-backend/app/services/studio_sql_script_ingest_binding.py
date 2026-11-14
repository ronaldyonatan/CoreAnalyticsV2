"""Bind one authorized DEV query dataset for single-session ingestion.

Uses the saved Connection credential. The script is not read-only; an operator
must explicitly enable this DEV path and understand the Connection privileges.
"""
import copy
import os
import uuid

from app.connectors.registry import resolve
from app.connectors.sqlserver import SqlServerTarget
from app.services.studio_batch_bindings import validate_batch_graph
from app.services.studio_dataset_query_metadata import read_script_definition
from app.services.studio_object_access import require_access


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError('QUERY_INGEST_ID_INVALID') from None


def bind_script_ingest(owner, run_id, graph, definitions, target_resolver):
    if os.getenv('STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED', '').strip().lower() != 'true':
        raise ValueError('QUERY_INGEST_DISABLED')
    validate_batch_graph(graph)
    run_id = _uuid(run_id)
    if len(graph['sources']) != 1 or graph['sources'][0].get('kind') != 'dataset' or graph['nodes'] or len(graph['outputs']) != 1:
        raise ValueError('QUERY_INGEST_GRAPH_INVALID')
    source = graph['sources'][0]
    dataset_id = _uuid(source['dataset_id'])
    row = definitions.get(dataset_id)
    if (not isinstance(row, dict) or row.get('access_mode') != 'STORED'
            or str(row.get('source_schema') or '').casefold() != '__coreanalytics_query__'
            or _uuid(row.get('source_name')) != dataset_id):
        raise ValueError('QUERY_INGEST_DATASET_INVALID')
    connection_id = _uuid(row.get('connection_id'))
    if connection_id != _uuid(os.getenv('STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID', '')):
        raise ValueError('QUERY_INGEST_CONNECTION_NOT_ALLOWED')
    require_access(owner, 'DATASET', dataset_id, 'execute')
    definition = read_script_definition(owner, dataset_id)
    if _uuid(definition.get('dataset_id')) != dataset_id or _uuid(definition.get('connection_id')) != connection_id or definition.get('dialect') != 'sqlserver':
        raise ValueError('QUERY_INGEST_DEFINITION_MISMATCH')
    target = target_resolver(owner, connection_id)
    if not isinstance(target, SqlServerTarget):
        raise ValueError('QUERY_INGEST_SOURCE_UNSUPPORTED')
    connector = resolve('sqlserver')
    if connector.validate_target is None:
        raise ValueError('QUERY_INGEST_SOURCE_UNSUPPORTED')
    bound = connector.bind_source(source, row, target, connector.validate_target)
    bound.pop('schema'); bound.pop('table')
    bound.update(kind='sqlserver_script', connection_id=connection_id, script=definition['query'])
    return {'run_id':run_id, 'sources':[bound], 'nodes':[], 'outputs':copy.deepcopy(graph['outputs'])}
