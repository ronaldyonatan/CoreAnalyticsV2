"""Full DataFrame DAG execution. Never samples, collects rows, or stringifies outputs."""
from pyspark.sql import functions as F
from app.execution_policy import batch_execution
from app.graph_preview import combine
from app.operation_common import schema, fields, text
from app.expressions import expression
from app.preview import transform

NATIVE_STEPS = frozenset(('filter','select','combine','replace','split','string','format','calculate','date','formula','query','constant','duplicate','alter','schema','json','limit','series','meta_select','order','mapper','deduplicate','expression_filter','group','window','pivot','unpivot','append','join','split_join','split_filter'))


class BatchError(ValueError):
    def __init__(self, code, detail=''):
        super().__init__('BATCH_' + code)
        self.detail = detail[:1000]


def validate_plan(source_ids, nodes, outputs):
    if not isinstance(source_ids,list) or not 1 <= len(source_ids) <= 4 or not isinstance(nodes,list) or not isinstance(outputs,list) or not 1 <= len(outputs) <= 6 or len(source_ids)+len(nodes)+len(outputs)>30: raise BatchError('INVALID_GRAPH')
    known=set();dependencies={};identifiers=set();count=0
    def register(identifier):
        text(identifier,80,True)
        if identifier in identifiers: raise BatchError('DUPLICATE_ID')
        identifiers.add(identifier)
    def reference(ref):
        fields(ref,'node port');text(ref['port'],128,True)
        if not isinstance(ref['node'],str) or ref['node'] not in known: raise BatchError('INVALID_REFERENCE')
        return ref['node']
    for identifier in source_ids:
        register(identifier);known.add(identifier);dependencies[identifier]=[]
    for node in nodes:
        fields(node,'id inputs steps');register(node['id'])
        if not isinstance(node['inputs'],list) or not 1 <= len(node['inputs']) <= 2 or not isinstance(node['steps'],list) or not node['steps']: raise BatchError('INVALID_NODE')
        dependencies[node['id']]=[reference(ref) for ref in node['inputs']]
        for step in node['steps']:
            if not isinstance(step,dict) or not isinstance(step.get('type'),str) or step['type'] not in NATIVE_STEPS:
                raise BatchError('UNSUPPORTED_COMPONENT',f"Node {node['id']}: komponen ini belum memiliki adapter batch; tidak ada sampel yang akan disimpan sebagai hasil penuh.")
        count+=len(node['steps'])
        if count>30: raise BatchError('TOO_MANY_STEPS')
        first=node['steps'][0]['type'];multi=first in ('append','join','split_join')
        if len(node['inputs']) != (2 if multi else 1) or ((multi or first=='split_filter') and len(node['steps'])!=1): raise BatchError('INVALID_INPUTS')
        if any(s['type'] in ('append','join','split_join','split_filter') for s in node['steps'][1:]): raise BatchError('INVALID_NODE')
        known.add(node['id'])
    roots=[]
    for output in outputs:
        fields(output,'id name input');register(output['id']);text(output['name'],150,True);roots.append(reference(output['input']))
    used=set()
    def mark(identifier):
        if identifier in used:return
        used.add(identifier)
        for parent in dependencies[identifier]:mark(parent)
    for root in roots:mark(root)
    if used!=known:raise BatchError('UNUSED_NODES')


def execute_graph(sources,nodes,outputs,progress=None):
    validate_plan(list(sources),nodes,outputs)
    frames={identifier:{'main':frame} for identifier,frame in sources.items()}
    with batch_execution():
        for frame in sources.values():schema(frame.columns)
    def read(ref):
        if ref['node'] not in frames or ref['port'] not in frames[ref['node']]:raise BatchError('INVALID_PORT')
        return frames[ref['node']][ref['port']]
    with batch_execution():
        for node in nodes:
            if progress:progress(node['id'],'PLANNING')
            incoming=[read(ref) for ref in node['inputs']];steps=node['steps'];first=steps[0]
            if first['type'] in ('append','join','split_join'):result=combine(incoming,first)
            elif first['type']=='split_filter':
                fields(first,'type branches')
                if not isinstance(first['branches'],list) or not 1 <= len(first['branches']) <= 5:raise BatchError('INVALID_BRANCHES')
                remaining=F.lit(True);result={};frame=incoming[0]
                for branch in first['branches']:
                    fields(branch,'port predicate');port=text(branch['port'],128,True)
                    if port=='else' or port in result:raise BatchError('INVALID_BRANCHES')
                    predicate=F.coalesce(expression(branch['predicate'],frame.columns).cast('boolean'),F.lit(False))
                    result[port]=frame.filter(remaining & predicate);remaining=remaining & ~predicate
                result['else']=frame.filter(remaining)
            else:
                frame,_=transform(incoming[0],incoming[0].columns,steps);result={'main':frame}
            for frame in result.values():schema(frame.columns)
            frames[node['id']]=result
    return [{'id':output['id'],'name':output['name'],'frame':read(output['input'])} for output in outputs]
