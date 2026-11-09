"""Owner-scoped pipeline metadata; no source credentials enter saved documents."""
import copy
import json
import math
import uuid
from app.clients.core_api_client import core_api
from app.services.studio_connections import _rows
from app.services.studio_graph_preview import validate_graph_request
from app.services.studio_batch_bindings import validate_batch_graph


class PipelineError(ValueError):
    def __init__(self, code, status=400):
        super().__init__(code); self.http_status=status


def identifier(value):
    try:
        if not isinstance(value,str) or str(uuid.UUID(value))!=value.lower():raise ValueError()
    except (ValueError,AttributeError):raise PipelineError('PIPELINE_ID_INVALID') from None
    return str(uuid.UUID(value))


def validate_document(value):
    if not isinstance(value,dict) or set(value)!={'nodes','edges','graph'}:raise PipelineError('PIPELINE_DOCUMENT_INVALID')
    if len(json.dumps(value,ensure_ascii=False,allow_nan=False).encode())>512000:raise PipelineError('PIPELINE_DOCUMENT_TOO_LARGE')
    nodes,edges=value['nodes'],value['edges']
    if not isinstance(nodes,list) or not 1<=len(nodes)<=30 or not isinstance(edges,list) or len(edges)>60:raise PipelineError('PIPELINE_DOCUMENT_INVALID')
    ids=set()
    allowed={'label','datasetId','fixedColumns','fixedRows','columns','renames','rules','filterExpression','outputName','utilityConfig','calculations','textRules','textColumns','textOutput','textDelimiter','textRemove','textKeepExtra','splitNames','formulas','filterOp','filterColumn','filterValue'}
    for n in nodes:
        if not isinstance(n,dict) or set(n)!={'id','position','data','type'} or n['type']!='pipeline' or not isinstance(n['id'],str) or not n['id'] or len(n['id'])>80 or n['id'] in ids:raise PipelineError('PIPELINE_DOCUMENT_INVALID')
        ids.add(n['id'])
        if not isinstance(n['position'],dict) or set(n['position'])!={'x','y'} or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>10**7 for x in n['position'].values()):raise PipelineError('PIPELINE_POSITION_INVALID')
        if not isinstance(n['data'],dict) or set(n['data'])-allowed or not isinstance(n['data'].get('label'),str):raise PipelineError('PIPELINE_DOCUMENT_INVALID')
    edge_ids=set()
    for e in edges:
        if not isinstance(e,dict) or set(e)-{'id','source','target','sourceHandle','targetHandle'} or not {'id','source','target'}<=set(e) or not isinstance(e['id'],str) or e['id'] in edge_ids or not 1<=len(e['id'])<=180 or e['source'] not in ids or e['target'] not in ids:raise PipelineError('PIPELINE_EDGE_INVALID')
        edge_ids.add(e['id'])
        if any(e.get(k) is not None and (not isinstance(e[k],str) or len(e[k])>128) for k in ('sourceHandle','targetHandle')):raise PipelineError('PIPELINE_EDGE_INVALID')
    if value['graph'] is not None:
        validate_graph_request(value['graph'])
        graph_ids={s['id'] for s in value['graph']['sources']}|{n['id'] for n in value['graph']['nodes']}|{o['id'] for o in value['graph']['outputs']}
        if graph_ids!=ids:raise PipelineError('PIPELINE_GRAPH_MISMATCH')
        for n in value['graph']['nodes']:
            if any(set(s)&{'artifact','_trusted_model','password','jdbc_url','credentials'} for s in n['steps']):raise PipelineError('PIPELINE_SECRET_FORBIDDEN')
    return copy.deepcopy(value)


class PipelineStore:
    def call(self,action,owner=None,**values):
        payload={'Action':action,**({'UserID':owner} if owner else {}),**values}
        # Quiet RPC: the generic debug helper would print fixed input rows and scripts.
        try:
            response=core_api.session.post(core_api.url,json={'Mode':'CoreStudioPipelines','Payload':json.dumps(payload,ensure_ascii=False,allow_nan=False)},timeout=core_api.timeout)
            response.raise_for_status();rows=_rows(response.json())
        except Exception:raise PipelineError('PIPELINE_METADATA_UNAVAILABLE',503) from None
        if not rows or rows[0].get('success') not in (True,1):
            code=rows[0].get('code') if rows else None
            if not isinstance(code,str) or not code.startswith('PIPELINE_'):code='PIPELINE_SCHEMA_REQUIRED'
            raise PipelineError(code,404 if code.endswith('NOT_FOUND') else 409 if code in ('PIPELINE_VERSION_CONFLICT','PIPELINE_REQUEST_REUSED','PIPELINE_LEASE_LOST') else 503 if code in ('PIPELINE_SCHEMA_REQUIRED','PIPELINE_METADATA_UNAVAILABLE') else 400)
        row=dict(rows[0])
        for field in ('pipeline_id','run_id','requested_by','output_version_id'):
            if field in row:
                try:row[field]=identifier(row[field])
                except ValueError:raise PipelineError('PIPELINE_UUID_TRANSPORT_REQUIRED',503) from None
        return row

    def status(self,owner):
        row=self.call('Status',owner)
        if row.get('metadata_ready') and row.get('uuid_transport_version')!=1:
            raise PipelineError('PIPELINE_UUID_TRANSPORT_REQUIRED',503)
        return row
    def list(self,owner):return json.loads(self.call('List',owner).get('items_json') or '[]')
    def get(self,owner,pipeline_id,version=None):
        row=self.call('Get',owner,PipelineID=identifier(pipeline_id),Version=version)
        return {**{k:v for k,v in row.items() if k not in ('success','code','graph_json')},'document':validate_document(json.loads(row['graph_json']))}
    def save(self,owner,name,document,pipeline_id=None,expected_version=0):
        if not isinstance(name,str) or not name.strip() or len(name)>150 or type(expected_version)is not int or not 0<=expected_version<=2**31-2:raise PipelineError('PIPELINE_INPUT_INVALID')
        document=validate_document(document)
        # Check the deployed transport contract before committing any new version.
        self.status(owner)
        return self.call('Save',owner,PipelineID=identifier(pipeline_id) if pipeline_id else None,PipelineName=name.strip(),ExpectedVersion=expected_version,GraphJSON=json.dumps(document,ensure_ascii=False,allow_nan=False))
    def submit(self,owner,pipeline_id,version,request_id):
        if type(version)is not int or not 1<=version<=2**31-1:raise PipelineError('PIPELINE_VERSION_INVALID')
        saved=self.get(owner,pipeline_id,version)
        if saved['document']['graph'] is None:raise PipelineError('PIPELINE_NOT_READY',409)
        validate_batch_graph(saved['document']['graph'])
        return self.call('Submit',owner,PipelineID=pipeline_id,Version=version,RequestID=identifier(request_id))
    def outputs(self,owner):return json.loads(self.call('Outputs',owner).get('items_json') or '[]')
    def output(self,owner,output_id):return self.call('Output',owner,OutputVersionID=identifier(output_id))
    def jobs(self,owner):return json.loads(self.call('Jobs',owner).get('items_json') or '[]')
    def job(self,owner,run_id):return self.call('Job',owner,RunID=identifier(run_id))
    def cancel(self,owner,run_id):return self.call('Cancel',owner,RunID=identifier(run_id))
    def claim(self,worker_id):return self.call('Claim',WorkerID=identifier(worker_id))
    def heartbeat(self,worker_id,run_id):return self.call('Heartbeat',WorkerID=identifier(worker_id),RunID=identifier(run_id))
    def complete(self,worker_id,run_id,status,outputs=None,error_code=None):
        if status not in ('SUCCEEDED','FAILED','CANCELLED'):raise PipelineError('PIPELINE_STATUS_INVALID')
        return self.call('Complete',WorkerID=identifier(worker_id),RunID=identifier(run_id),Status=status,OutputsJSON=json.dumps(outputs or [],allow_nan=False),ErrorCode=error_code)


pipeline_store=PipelineStore()
