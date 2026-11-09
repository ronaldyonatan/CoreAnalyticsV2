"""Synthetic control-store fixture; Spark execution and persisted Parquet are real."""
import json,os,uuid
from pathlib import Path
from unittest.mock import Mock
os.environ['_SPARK_AUTH_SECRET']=Path('/run/secrets/spark_auth_secret').read_text().strip()
os.environ['STUDIO_BATCH_STORAGE_ROOT']='/var/lib/coreanalytics/parquet'
os.setgroups([]);os.setgid(185);os.setuid(185)
# Metadata is deliberately synthetic. This fixture never connects to BEAM/SQL Server.
os.environ.setdefault('CORE_API_URL','http://metadata-fixture.invalid')
os.environ.setdefault('BEAM_X_CONNECTION','synthetic')
os.environ.setdefault('BEAM_X_TOKEN','synthetic')
from app.services.studio_dispatcher import Dispatcher
run_id=str(uuid.uuid4());source_id=str(uuid.uuid4())
graph={'sources':[{'id':'input','kind':'dataset','dataset_id':source_id}],'nodes':[], 'outputs':[{'id':'out','name':'Dispatcher cluster output','input':{'node':'input','port':'main'}}]}
document={'nodes':[{'id':'input','type':'pipeline','position':{'x':0,'y':0},'data':{'label':'Input Dataset','datasetId':source_id}},{'id':'out','type':'pipeline','position':{'x':300,'y':0},'data':{'label':'Output Dataset','outputName':'Dispatcher cluster output'}}],'edges':[{'id':'e','source':'input','target':'out'}],'graph':graph}
store=Mock();store.claim.return_value={'has_job':True,'run_id':run_id,'requested_by':'synthetic-owner','graph_json':json.dumps(document)};store.heartbeat.return_value={'cancel_requested':False}
def binding(owner,identifier,saved_graph):
    return {'run_id':identifier,'sources':[{'id':'input','kind':'parquet','path':os.getenv('STUDIO_TEST_PARQUET_PATH','verification-input')}],'nodes':saved_graph['nodes'],'outputs':saved_graph['outputs']}
worker=Dispatcher(store,authorize_owner=lambda _:None,binder=binding,timeout=240)
assert worker.once()
args=store.complete.call_args.args
assert args[2]=='SUCCEEDED',str(store.complete.call_args)
assert args[3][0]['row_count']==5000
fields=args[3][0]['schema']['fields'];types={f['name']:f['type'] for f in fields}
assert types['ID']=='integer' and types['Day']=='date' and types['Amount']=='decimal(12,2)',types
assert store.heartbeat.call_count>=2
print(json.dumps({'success':True,'run_id':run_id,'rows':5000,'heartbeat_count':store.heartbeat.call_count,'schema':types,'control_store':'synthetic fixture; no SQL migration applied','execution':'real separate Spark master/workers'}))
