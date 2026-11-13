"""Security contracts; no live SQL/BEAM/storage."""
import unittest
from unittest.mock import patch
from flask import Flask
from app.services import studio_object_access as a
from app.services import studio_connections as c, studio_pipelines as p, studio_charts as charts
from app.routes import studio_connections_api as api, studio_charts_api as capi
U='11111111-1111-4111-8111-111111111111'
O='22222222-2222-4222-8222-222222222222'
X='33333333-3333-4333-8333-333333333333'

class SecurityTests(unittest.TestCase):
 def test_matrix(self):
  for role in ('OWNER','EDITOR','VIEWER','ADMIN','NONE',None):
   for op in ('read','edit','execute','delete','share'):
    allowed=role in ({'OWNER','EDITOR','VIEWER','ADMIN'} if op=='read' else {'OWNER','EDITOR','VIEWER'} if op in ('edit','execute') else {'OWNER'})
    with self.subTest(role=role,op=op),patch.object(a,'execute',side_effect=lambda *args,**kw:{'effective_role':role} if args[1]=='CHECK' else {'owner_user_id':X}):
     if allowed:a.require_access(U,'DATASET',O,op)
     else:
      with self.assertRaises(a.AccessError):a.require_access(U,'DATASET',O,op)
 def test_admin_owner(self):
  with patch.object(a,'execute',side_effect=[{'effective_role':'ADMIN'},{'owner_user_id':U}]):
   self.assertEqual(a.require_access(U,'CHART',O,'delete'),'OWNER')
 def test_revocation(self):
  with patch.object(a,'execute',side_effect=[{'effective_role':'VIEWER'},a.AccessError('OBJECT_ACCESS_DENIED',403)]):
   a.require_access(U,'DATASET',O)
   with self.assertRaises(a.AccessError):a.require_access(U,'DATASET',O)
 def test_catalog(self):
  rows=[{'dataset_id':O},{'dataset_id':X}]
  with patch.object(a,'execute',side_effect=[{'effective_role':'OWNER'},a.AccessError('OBJECT_ACCESS_DENIED',403)]):
   self.assertEqual(a.visible_rows(U,'DATASET',rows,'dataset_id'),rows[:1])
  with patch.object(a,'execute',side_effect=a.AccessError('UNAVAILABLE',503)):
   with self.assertRaises(a.AccessError):a.visible_rows(U,'DATASET',rows,'dataset_id')
 def test_malformed(self):
  for rows in (None,{},[{}],[{'dataset_id':'invalid'}]):
   with self.subTest(rows=rows),self.assertRaises(a.AccessError):a.visible_rows(U,'DATASET',rows,'dataset_id')
  with patch.object(a,'execute') as rpc,self.assertRaises(a.AccessError):a.require_access(None,'DATASET',O)
  rpc.assert_not_called()
 def test_denial_code(self):
  with self.assertRaises(a.AccessError) as ctx:a._row({'data':[{'success':False,'code':'OBJECT_ACCESS_DENIED'}]})
  self.assertEqual(ctx.exception.status,403)
 def test_connection_api(self):
  app=Flask(__name__);app.register_blueprint(api.studio_connections_bp)
  with patch.object(api,'_principal',return_value=U),patch.object(api,'_mutating'),patch.object(a,'execute',return_value={'effective_role':'NONE'}),patch.object(c.core_api,'set_studio_connection_active') as mutation:
   response=app.test_client().patch('/api/studio/connections/'+O+'/active',json={'is_active':False})
  self.assertEqual(response.status_code,403);mutation.assert_not_called()
 def test_chart_api_forged_actor(self):
  app=Flask(__name__);app.register_blueprint(capi.studio_charts_bp)
  for role in ('VIEWER','EDITOR','ADMIN'):
   with self.subTest(role=role),patch.object(capi,'_principal',return_value=U),patch.object(capi,'_mutating'),patch.object(a,'execute',side_effect=lambda *args,**kw:{'effective_role':role} if args[1]=='CHECK' else {'owner_user_id':X}) as check,patch.object(charts,'rpc') as mutation:
    response=app.test_client().delete('/api/studio/charts/'+O,json={'actor_user_id':X})
    self.assertEqual(response.status_code,403);mutation.assert_not_called();self.assertEqual(check.call_args_list[0].args[0],U)
 def test_chart_reference(self):
  with patch.object(a,'execute',side_effect=a.AccessError('OBJECT_ACCESS_DENIED',403)),patch.object(capi.core_api,'_post_mode') as lookup:
   with self.assertRaises(a.AccessError):capi.authorized_dataset(U,X,'DIRECT')
  lookup.assert_not_called()
 def test_output_parent(self):
  store=p.PipelineStore()
  with patch.object(store,'call',return_value={'run_id':X}),patch.object(store,'job',return_value={'pipeline_id':O}) as job:
   row=store.output(U,O)
  job.assert_called_once_with(U,X);self.assertEqual(row['pipeline_id'],O)
 def test_submit_denied(self):
  store=p.PipelineStore()
  with patch.object(a,'execute',return_value={'effective_role':'NONE'}),patch.object(store,'get') as get,patch.object(store,'call') as queue:
   with self.assertRaises(a.AccessError):store.submit(U,O,1,X)
  get.assert_not_called();queue.assert_not_called()
 def test_no_delegation(self):
  from app.routes import studio_object_access_api as api
  app=Flask(__name__);app.register_blueprint(api.studio_object_access_bp)
  with patch.object(api,'_principal',return_value=U),patch.object(api,'_mutating'),patch.object(api,'execute',return_value={'owner_user_id':X}) as rpc:
   response=app.test_client().post('/api/studio/object-access/DATASET/'+O,json={'action':'GRANT','principal_type':'USER','principal_id':U,'access_role':'VIEWER'})
  self.assertEqual(response.status_code,403);self.assertEqual(rpc.call_count,1)

class BoundaryTests(unittest.TestCase):
 def test_schedule_recipient_cannot_execute_unshared_target(self):
  from app.services import studio_scheduler as scheduler
  form=dict(schedule_id=O,schedule_name='Daily',target_type='STORED',target_id=X,pipeline_version=None,frequency='DAILY',interval_minutes=None,time_of_day='07:00',week_day=None,month_day=None,enabled=True)
  with patch.object(a,'execute',side_effect=[{'effective_role':'EDITOR'},{'effective_role':'NONE'}]),patch.object(scheduler,'_rpc') as mutation:
   with self.assertRaises(a.AccessError):scheduler.save(U,form)
  mutation.assert_not_called()
 def test_schedule_toggle_unshared_denied(self):
  from app.services import studio_scheduler as scheduler
  with patch.object(a,'execute',return_value={'effective_role':'NONE'}),patch.object(scheduler,'_rpc') as rpc:
   with self.assertRaises(a.AccessError):scheduler.toggle(U,O,True)
  rpc.assert_not_called()
 def test_ingest_unshared_denied(self):
  from app.services import studio_dataset_ingest as ingest
  with patch.object(a,'execute',return_value={'effective_role':'NONE'}),patch.object(ingest,'call') as rpc:
   with self.assertRaises(a.AccessError):ingest.submit(U,O,X)
  rpc.assert_not_called()
 def test_stored_worker_revocation_before_metadata(self):
  from app.services import studio_ingest_worker as worker
  from app.clients.core_api_client import core_api
  with patch.object(a,'execute',side_effect=a.AccessError('OBJECT_ACCESS_DENIED',403)),patch.object(core_api,'_post_mode') as rpc:
   with self.assertRaises(a.AccessError):worker.bind_source(U,O,X)
  rpc.assert_not_called()
 def test_guessed_output_parent_denied(self):
  store=p.PipelineStore()
  with patch.object(store,'call',side_effect=[{'run_id':O},{'pipeline_id':X}]),patch.object(a,'execute',side_effect=a.AccessError('OBJECT_ACCESS_DENIED',403)) as check:
   with self.assertRaises(a.AccessError):store.output(U,O)
  self.assertEqual(check.call_args.args,(U,'CHECK','PIPELINE',X))
 def test_stored_delete_editor_denied(self):
  from app.services import studio_parquet_delete as delete
  with patch.object(a,'execute',return_value={'effective_role':'EDITOR'}),patch.object(delete,'ingest_jobs') as jobs:
   with self.assertRaises(a.AccessError):delete._resolve(U,'STORED',O,X)
  jobs.assert_not_called()
 def test_secret_resolution_denied_before_rpc(self):
  from app.routes import studio_datasets_api as ds
  with patch.object(a,'execute',side_effect=a.AccessError('OBJECT_ACCESS_DENIED',403)),patch.object(ds.core_api,'_post_mode') as rpc:
   with self.assertRaises(a.AccessError):ds._target(U,O)
  rpc.assert_not_called()
 def test_failed_authorizer_api_status_and_no_cache(self):
  app=Flask(__name__);app.register_blueprint(api.studio_connections_bp)
  with patch.object(api,'_principal',return_value=U),patch.object(api,'_mutating'),patch.object(a,'execute',side_effect=a.AccessError('BEAM_OWNERSHIP_UNAVAILABLE',503)),patch.object(c.core_api,'set_studio_connection_active') as rpc:
   res=app.test_client().patch('/api/studio/connections/'+O+'/active',json={'is_active':True})
  self.assertEqual(res.status_code,503);self.assertEqual(res.headers['Cache-Control'],'no-store');rpc.assert_not_called()
 def test_pipeline_worker_revoked_before_recovery_or_driver(self):
  import tempfile,json
  from unittest.mock import Mock
  from app.services import studio_dispatcher as worker
  graph={'sources':[{'id':'fixed','kind':'fixed','columns':['A'],'rows':[['x']]}],'nodes':[],'outputs':[{'id':'out','name':'Result','input':{'node':'fixed','port':'main'}}]}
  store=Mock();store.claim.return_value={'has_job':True,'run_id':O,'pipeline_id':X,'requested_by':U,'graph_json':'{}'}
  with tempfile.TemporaryDirectory() as root,patch.object(worker,'validate_document',return_value={'graph':graph}),patch.object(a,'execute',side_effect=a.AccessError('OBJECT_ACCESS_DENIED',403)),patch.object(worker,'committed_outputs') as recover,patch.object(worker.subprocess,'Popen') as launch:
   dispatcher=worker.Dispatcher(store=store,root=root,authorize_owner=lambda actor:None)
   self.assertTrue(dispatcher.once())
  recover.assert_not_called();launch.assert_not_called()
  self.assertEqual(store.complete.call_args.args[2],'FAILED')

class SharedEditPolicyTests(unittest.TestCase):
 def test_both_legacy_grant_roles_can_edit_execute_but_not_delete_share(self):
  for role in ('VIEWER','EDITOR'):
   for op in ('read','edit','execute'):
    with self.subTest(role=role,op=op),patch.object(a,'execute',return_value={'effective_role':role}):
     a.require_access(U,'DATASET',O,op)
   for op in ('delete','share'):
    with self.subTest(role=role,op=op),patch.object(a,'execute',return_value={'effective_role':role}),self.assertRaises(a.AccessError):
     a.require_access(U,'DATASET',O,op)
 def test_new_share_uses_editor_even_from_legacy_client(self):
  import os,json
  from unittest.mock import MagicMock
  client=MagicMock();client.session.post.return_value.json.return_value={'data':[{'success':True,'action_type':'GRANT'}]}
  with patch.dict(os.environ,{'STUDIO_OBJECT_ACCESS_BEAM_ENABLED':'true','STUDIO_OBJECT_ACCESS_MUTATIONS_ENABLED':'true','STUDIO_OBJECT_ACCESS_BEAM_HMAC_KEY_HEX':'AB'*32}),patch.object(a,'CoreApiClient',return_value=client):
   a.execute(U,'GRANT','DATASET',O,principal_type='USER',principal_id=X,access_role='VIEWER')
  envelope=json.loads(client.session.post.call_args.kwargs['json']['Payload'])
  self.assertEqual(json.loads(envelope['Request'])['AccessRole'],'EDITOR')
 def test_dataset_scoped_secret_passes_reference_without_connection_grant(self):
  import base64
  from unittest.mock import Mock
  from app.routes import studio_datasets_api as ds
  record={'connection_id':O,'encrypted_password_base64':base64.b64encode(b'cipher').decode(),'encryption_key_version':1,'connection_type':'SQLSERVER','server_port':1433,'connection_timeout_seconds':10}
  connector=Mock();connector.make_target.return_value='scoped-target'
  with patch.object(ds,'_require_object_access') as check,patch.object(ds.core_api,'_post_mode',return_value={'data':[record]}) as rpc,patch.object(ds,'_cipher') as cipher,patch.object(ds,'_connector',return_value=connector):
   cipher.return_value.decrypt.return_value=b'secret'
   self.assertEqual(ds._target(U,O,dataset_id=X),'scoped-target')
  check.assert_called_once_with(U,'DATASET',X)
  self.assertEqual(rpc.call_args.args[1],{'UserID':U,'ConnectionID':O,'DatasetID':X})
 def test_failed_dataset_reference_never_falls_back_to_connection_secret(self):
  from app.routes import studio_datasets_api as ds
  with patch.object(ds,'_require_object_access'),patch.object(ds.core_api,'_post_mode',return_value={'data':[]}) as rpc,patch.object(ds,'_cipher') as cipher:
   with self.assertRaises(ValueError):ds._target(U,O,dataset_id=X)
  self.assertEqual(rpc.call_count,1);cipher.assert_not_called()
