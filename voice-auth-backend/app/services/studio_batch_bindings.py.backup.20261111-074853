"""Server-only full-source binding. Never persist source secrets inside pipeline definitions."""
import copy
import uuid
from app.connectors.sqlserver import validate_target
from app.connectors.registry import get
from app.connectors.sqlserver_adapter import install as install_sqlserver_adapter

install_sqlserver_adapter()
from app.services.studio_graph_preview import validate_graph_request

NATIVE_BATCH_STEPS=frozenset(('filter','select','combine','replace','split','string','format','calculate','date','formula','query','constant','duplicate','alter','schema','json','limit','series','meta_select','order','mapper','deduplicate','expression_filter','group','window','pivot','unpivot','append','join','split_join','split_filter'))


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
        approved[identifier]=metadata
    sources=[]
    for source in graph['sources']:
        if source['kind']=='fixed':sources.append(copy.deepcopy(source));continue
        metadata=approved[str(uuid.UUID(source['dataset_id']))]
        target=target_resolver(owner,metadata['connection_id'])
        # Existing metadata has no connector type; treat it as SQL Server.
        # Future connector types must be explicitly stored and allowlisted.
        kind=metadata.get('connector_type') or 'sqlserver'
        sources.append(get(kind).bind_source(source,metadata,target,validate_target))
    return {'run_id':run_id,'sources':sources,'nodes':copy.deepcopy(graph['nodes']),'outputs':copy.deepcopy(graph['outputs'])}
