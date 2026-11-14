"""Server-only full-source binding. Never persist source secrets inside pipeline definitions."""
import copy
import uuid
from app.connectors.sqlserver import validate_target
from app.connectors.registry import resolve
from app.connectors.postgresql_adapter import PostgreSQLTarget
from app.connectors.sqlserver_adapter import install as install_sqlserver_adapter

install_sqlserver_adapter()
from app.services.studio_graph_preview import validate_graph_request

NATIVE_BATCH_STEPS=frozenset(('filter','select','combine','replace','split','string','format','calculate','date','formula','query','constant','duplicate','alter','schema','json','limit','series','meta_select','order','mapper','deduplicate','expression_filter','group','window','pivot','unpivot','append','join','split_join','split_filter'))


def _reject_query_source(metadata, code):
    """Fail closed until query-source JDBC schema discovery is sandboxed.

    Spark opens a separate JDBC connection while resolving schema. A session
    initializer on a later data-reading connection is not enough to ensure
    query text cannot run as the original privileged connection login.
    """
    if (str(metadata.get('source_type') or '').upper() == 'QUERY'
            or str(metadata.get('source_kind') or '').upper() == 'QUERY'
            or str(metadata.get('source_schema') or '').casefold() == '__coreanalytics_query__'
            or any(metadata.get(key) is not None for key in ('source_query', 'query_sql', 'query_text'))):
        raise ValueError(code)


def validate_batch_graph(graph):
    validate_graph_request(graph)
    for node in graph['nodes']:
        for step in node['steps']:
            if not isinstance(step.get('type'),str) or step['type'] not in NATIVE_BATCH_STEPS:raise ValueError('BATCH_UNSUPPORTED_COMPONENT')


def bind_run(owner,run_id,graph,definitions,target_resolver):
    """Called at dispatch after current-session/current-user authorization; result is private stdin only."""
    validate_batch_graph(graph)
    if not isinstance(run_id,str) or str(uuid.UUID(run_id))!=run_id:raise ValueError('BATCH_INVALID_RUN_ID')
    # Authorize every dataset before resolving ANY source credentials/network destination.
    approved={}
    for source in graph['sources']:
        if source['kind']!='dataset':continue
        identifier=str(uuid.UUID(source['dataset_id']))
        metadata=definitions.get(identifier)
        if not metadata:raise PermissionError('DATASET_NOT_FOUND')
        if metadata.get('access_mode')!='DIRECT':raise ValueError('BATCH_SOURCE_NOT_AVAILABLE')
        _reject_query_source(metadata, 'BATCH_QUERY_SOURCE_NOT_READY')
        approved[identifier]=metadata
    sources=[]
    for source in graph['sources']:
        if source['kind']=='fixed':sources.append(copy.deepcopy(source));continue
        metadata=approved[str(uuid.UUID(source['dataset_id']))]
        target=target_resolver(owner,metadata['connection_id'])
        # Existing metadata has no connector type; treat it as SQL Server.
        # Future connector types must be explicitly stored and allowlisted.
        kind=str(metadata.get('connector_type') or metadata.get('connection_type') or ('postgresql' if isinstance(target, PostgreSQLTarget) else 'sqlserver')).strip().lower()
        spec=resolve(kind)
        if spec.validate_target is None:raise ValueError('CONNECTOR_UNSUPPORTED')
        sources.append(spec.bind_source(source,metadata,target,spec.validate_target))
    return {'run_id':run_id,'sources':sources,'nodes':copy.deepcopy(graph['nodes']),'outputs':copy.deepcopy(graph['outputs'])}


def bind_stored_ingest(owner, run_id, graph, definitions, target_resolver):
    """Isolated STORED ingestion binding. Pipeline bind_run remains DIRECT-only."""
    validate_batch_graph(graph)
    if len(graph['sources']) != 1 or graph['sources'][0].get('kind') != 'dataset' or graph['nodes'] or len(graph['outputs']) != 1:
        raise ValueError('INGEST_BIND_FAILED')
    identifier = str(uuid.UUID(graph['sources'][0]['dataset_id']))
    metadata = definitions.get(identifier)
    if not metadata or metadata.get('access_mode') != 'STORED':
        raise ValueError('INGEST_BIND_FAILED')
    _reject_query_source(metadata, 'INGEST_QUERY_SOURCE_NOT_READY')
    target = target_resolver(owner, metadata['connection_id'])
    kind = 'postgresql' if isinstance(target, PostgreSQLTarget) else 'sqlserver'
    spec = resolve(kind)
    if spec.validate_target is None:
        raise ValueError('INGEST_BIND_FAILED')
    source = spec.bind_source(graph['sources'][0], metadata, target, spec.validate_target)
    return {'run_id': run_id, 'sources': [source], 'nodes': [], 'outputs': copy.deepcopy(graph['outputs'])}
