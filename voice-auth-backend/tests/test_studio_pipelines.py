import copy
import json
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from flask import Flask
from app.services import studio_pipelines as metadata
from app.services import studio_dispatcher as dispatch
from app.routes import studio_pipelines_api as api


def document():
    return {'nodes':[{'id':'fixed','type':'pipeline','position':{'x':0,'y':0},'data':{'label':'Fixed Input','fixedColumns':['A'],'fixedRows':[['x']]}},{'id':'out','type':'pipeline','position':{'x':300,'y':0},'data':{'label':'Output Dataset'}}],
    'edges':[{'id':'e','source':'fixed','target':'out'}],
    'graph':{'sources':[{'id':'fixed','kind':'fixed','columns':['A'],'rows':[['x']]}],'nodes':[],'outputs':[{'id':'out','name':'Result','input':{'node':'fixed','port':'main'}}]}}


class PipelineMetadataTests(unittest.TestCase):
    def setUp(self):
        auth = patch.object(metadata, 'require_access', return_value='OWNER')
        auth.start(); self.addCleanup(auth.stop)

    def test_sql_guid_casing_is_normalized(self):
        value=str(uuid.uuid4())
        self.assertEqual(metadata.identifier(value.upper()),value)
        with self.assertRaises(ValueError):metadata.identifier('{'+value+'}')

    def test_roundtrip_detached_and_draft(self):
        value=document();saved=metadata.validate_document(value);saved['nodes'][0]['data']['label']='Changed'
        self.assertEqual(value['nodes'][0]['data']['label'],'Fixed Input')
        value['graph']=None;self.assertIsNone(metadata.validate_document(value)['graph'])

    def test_rejects_invalid_ids_positions_edges_and_injected_runtime_state(self):
        cases=[]
        for change in ('position','state','edge','graph'):
            value=document()
            if change=='position':value['nodes'][0]['position']['x']=float('nan')
            if change=='state':value['nodes'][0]['data']['password']='secret'
            if change=='edge':value['edges'][0]['source']='unknown'
            if change=='graph':value['nodes'][0]['id']='other'
            cases.append(value)
        for value in cases:
            with self.subTest(value=value),self.assertRaises(ValueError):metadata.validate_document(value)

    def test_no_rpc_before_input_validation(self):
        store=metadata.PipelineStore()
        with patch.object(store,'call') as rpc:
            with self.assertRaises(ValueError):store.save('owner','x',document(),expected_version=True)
            with self.assertRaises(ValueError):store.save('owner','',document())
            rpc.assert_not_called()

    def test_run_uses_saved_version_and_rejects_unsupported_or_incomplete_graph(self):
        store=metadata.PipelineStore();saved=document();identifier=str(uuid.uuid4());request=str(uuid.uuid4())
        with patch.object(store,'get',return_value={'document':saved}) as get,patch.object(store,'call',return_value={'run_id':'run'}) as rpc:
            self.assertEqual(store.submit('owner',identifier,2,request),{'run_id':'run'})
            get.assert_called_once_with('owner',identifier,2)
            rpc.assert_called_once_with('Submit','owner',PipelineID=identifier,Version=2,RequestID=request)
        saved['graph']=None
        with patch.object(store,'get',return_value={'document':saved}),patch.object(store,'call') as rpc:
            with self.assertRaisesRegex(ValueError,'NOT_READY'):store.submit('owner',identifier,2,request)
            rpc.assert_not_called()

    def test_rpc_hides_transport_errors_and_maps_conflicts(self):
        store=metadata.PipelineStore()
        with patch.object(metadata.core_api.session,'post',side_effect=RuntimeError('private-connection-password')):
            with self.assertRaises(metadata.PipelineError) as error:store.status('owner')
            self.assertEqual(str(error.exception),'PIPELINE_METADATA_UNAVAILABLE')
        response=Mock();response.json.return_value={'data':[{'success':False,'code':'PIPELINE_VERSION_CONFLICT'}]}
        with patch.object(metadata.core_api.session,'post',return_value=response):
            with self.assertRaises(metadata.PipelineError) as error:store.status('owner')
            self.assertEqual(error.exception.http_status,409)

    def test_legacy_transport_is_blocked_before_save_writes(self):
        store=metadata.PipelineStore()
        with patch.object(store,'call',return_value={'success':True,'metadata_ready':True}) as rpc:
            with self.assertRaisesRegex(metadata.PipelineError,'UUID_TRANSPORT_REQUIRED'):store.save('owner','Saved draft',document())
            rpc.assert_called_once_with('Status','owner')
        with patch.object(store,'call',return_value={'success':True,'metadata_ready':True,'uuid_transport_version':1}):
            self.assertTrue(store.status('owner')['metadata_ready'])

    def test_save_checks_contract_then_returns_text_id_without_retrying_write(self):
        store=metadata.PipelineStore();value=str(uuid.uuid4());status=Mock();saved=Mock()
        status.json.return_value={'data':[{'success':True,'metadata_ready':True,'uuid_transport_version':1}]}
        saved.json.return_value={'data':[{'success':True,'pipeline_id':value.upper(),'pipeline_name':'Draft','version':1}]}
        with patch.object(metadata.core_api.session,'post',side_effect=[status,saved]) as post:
            result=store.save('owner','Draft',document())
        self.assertEqual(result['pipeline_id'],value)
        payloads=[json.loads(call.kwargs['json']['Payload']) for call in post.call_args_list]
        self.assertEqual([item['Action'] for item in payloads],['Status','Save'])
        self.assertTrue(all(item['UserID']=='owner' for item in payloads))
        self.assertEqual(json.loads(payloads[1]['GraphJSON']),document())

    def test_binary_guid_response_is_rejected_without_exposing_bytes(self):
        store=metadata.PipelineStore();response=Mock()
        response.json.return_value={'data':[{'success':True,'pipeline_id':'\ufffdVQ\x04\ufffdN'}]}
        with patch.object(metadata.core_api.session,'post',return_value=response):
            with self.assertRaises(metadata.PipelineError) as error:store.call('Get','owner')
        self.assertEqual(str(error.exception),'PIPELINE_UUID_TRANSPORT_REQUIRED');self.assertEqual(error.exception.http_status,503)

    def test_text_guid_response_normalizes_all_transport_identities(self):
        store=metadata.PipelineStore();response=Mock();value=str(uuid.uuid4());fields=('pipeline_id','run_id','requested_by','output_version_id')
        response.json.return_value={'data':[{'success':True,**{key:value.upper() for key in fields}}]}
        with patch.object(metadata.core_api.session,'post',return_value=response):result=store.call('Claim',WorkerID=value)
        self.assertTrue(all(result[key]==value for key in fields))

    def test_http_auth_and_csrf_before_store(self):
        app=Flask(__name__);app.register_blueprint(api.studio_pipelines_bp);client=app.test_client()
        with patch.object(api,'_principal',side_effect=PermissionError('AUTH_REQUIRED')),patch.object(api.pipeline_store,'status') as store:
            self.assertEqual(client.get('/api/studio/pipelines/status').status_code,401);store.assert_not_called()
        with patch.object(api,'_principal',return_value='owner'),patch.object(api,'_mutating',side_effect=PermissionError('CSRF_ORIGIN_REJECTED')),patch.object(api.pipeline_store,'save') as store:
            self.assertEqual(client.post('/api/studio/pipelines',json={}).status_code,403);store.assert_not_called()

    def test_owner_forwarded_and_body_rejects_extra_fields(self):
        app=Flask(__name__);app.register_blueprint(api.studio_pipelines_bp);client=app.test_client()
        with patch.object(api,'_principal',return_value='owner'),patch.object(api,'_mutating'),patch.object(api.pipeline_store,'jobs',return_value=[]) as store:
            result=client.get('/api/studio/pipelines/jobs');self.assertEqual(result.json['data'],[]);self.assertEqual(result.headers['Cache-Control'],'no-store');store.assert_called_once_with('owner')
            self.assertEqual(client.post('/api/studio/pipelines',json={'UserID':'other'}).status_code,400)


class DispatcherTests(unittest.TestCase):
    def setUp(self):
        auth = patch('app.services.studio_object_access.require_access', return_value='OWNER')
        auth.start(); self.addCleanup(auth.stop)
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.run_id=str(uuid.uuid4());self.doc=document();self.job={'has_job':True,'run_id':self.run_id,'requested_by':'owner','graph_json':json.dumps(self.doc)}
        self.store=Mock();self.store.claim.return_value=self.job;self.store.heartbeat.return_value={'cancel_requested':False}
        self.auth=Mock();self.binder=Mock(return_value={'run_id':self.run_id})
    def dispatcher(self,**kwargs):return dispatch.Dispatcher(self.store,self.root,authorize_owner=self.auth,binder=self.binder,**kwargs)
    def manifest(self):
        directory=self.root/self.run_id;directory.mkdir();(directory/'output-0').mkdir()
        value={'version':1,'run_id':self.run_id,'outputs':[{'id':'out','name':'Result','path':'output-0','row_count':5000,'schema':{'type':'struct','fields':[]}}]}
        (directory/'manifest.json').write_text(json.dumps(value));return value
    def test_committed_output_reconciles_without_rerun(self):
        self.manifest();self.job['is_recovery']=True;worker=self.dispatcher();self.assertTrue(worker.once())
        self.binder.assert_not_called();self.store.complete.assert_called_once()
        args=self.store.complete.call_args.args;self.assertEqual(args[2],'SUCCEEDED');self.assertEqual(args[3][0]['row_count'],5000);self.assertEqual(args[3][0]['path'],self.run_id+'/output-0')
    def test_expired_run_without_manifest_never_restarts(self):
        self.job['is_recovery']=True;self.dispatcher().once();self.binder.assert_not_called()
        self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'BATCH_RECOVERY_REQUIRED')
    def test_cancel_before_launch_and_revoked_user(self):
        self.job['cancel_requested']=True;self.dispatcher().once();self.binder.assert_not_called();self.assertEqual(self.store.complete.call_args.args[2],'CANCELLED')
        self.store.reset_mock();self.auth.side_effect=PermissionError('DATA_STUDIO_FORBIDDEN');self.dispatcher().once();self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'DATA_STUDIO_FORBIDDEN')
    def test_manifest_mismatch_not_cataloged(self):
        value=self.manifest();value['outputs'][0]['path']='../elsewhere';(self.root/self.run_id/'manifest.json').write_text(json.dumps(value))
        self.dispatcher().once();self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'BATCH_MANIFEST_INVALID')
    def test_terminate_fences_jvm_group_even_if_launcher_has_exited(self):
        process=Mock(pid=12345);process.poll.return_value=1
        with patch.object(dispatch.os,'killpg') as kill:
            dispatch.terminate(process)
        self.assertEqual([call.args[1] for call in kill.call_args_list],[dispatch.signal.SIGTERM,dispatch.signal.SIGKILL])

    def test_child_secrets_whitelist(self):
        result=dispatch.driver_environment({'PATH':'/bin','BEAM_X_TOKEN':'private','STUDIO_CONNECTION_FERNET_KEY':'private','_SPARK_AUTH_SECRET':'cluster-secret','PYTHONPATH':'/backend','STUDIO_SPARK_MASTER':'spark://master'})
        self.assertEqual(set(result),{'PATH','_SPARK_AUTH_SECRET','STUDIO_SPARK_MASTER'})
    def test_query_guard_configuration_does_not_forward_hmac_or_connection_secrets(self):
        environment = {'STUDIO_DATASET_QUERY_SQLSERVER_ENABLED': 'true',
                       'STUDIO_DATASET_QUERY_CONNECTION_ID': 'connection-id',
                       'STUDIO_DATASET_QUERY_EXECUTION_LOGIN': 'restricted-login',
                       'STUDIO_SQLSERVER_QUERY_GUARD_JAR': '/opt/guard.jar',
                       'STUDIO_OBJECT_ACCESS_BEAM_HMAC_KEY_HEX': 'private',
                       'STUDIO_CONNECTION_FERNET_KEY': 'private'}
        result = dispatch.driver_environment(environment)
        self.assertEqual(set(result), {'STUDIO_DATASET_QUERY_SQLSERVER_ENABLED',
                                      'STUDIO_DATASET_QUERY_CONNECTION_ID',
                                      'STUDIO_DATASET_QUERY_EXECUTION_LOGIN',
                                      'STUDIO_SQLSERVER_QUERY_GUARD_JAR'})

    def test_local_driver_launch_is_explicit_and_isolated(self):
        with tempfile.TemporaryDirectory() as root:
            python=Path(root)/'python';python.touch()
            script=Path(root)/'run_batch.py';script.touch()
            command,env=dispatch.driver_launch({'STUDIO_BATCH_DRIVER_MODE':'local','STUDIO_BATCH_LOCAL_PYTHON':str(python),'STUDIO_BATCH_LOCAL_SCRIPT':str(script),'STUDIO_SPARK_MASTER':'local[2]','PATH':'/usr/bin','STUDIO_CONNECTION_FERNET_KEY':'secret','PYTHONPATH':'/unsafe'})
            self.assertEqual(command,[str(python),str(script)])
            self.assertEqual(env['PYTHONPATH'],root)
            self.assertEqual(env['PYSPARK_PYTHON'],str(python))
            self.assertNotIn('STUDIO_CONNECTION_FERNET_KEY',env)
            with self.assertRaisesRegex(ValueError,'BATCH_DRIVER_START_FAILED'):
                dispatch.driver_launch({'STUDIO_BATCH_DRIVER_MODE':'local','STUDIO_BATCH_LOCAL_PYTHON':str(python),'STUDIO_BATCH_LOCAL_SCRIPT':str(script),'STUDIO_SPARK_MASTER':'spark://remote:7077'})
        command,env=dispatch.driver_launch({'PATH':'/bin'})
        self.assertEqual(command,['python3','/opt/coreanalytics/start_cluster.py','submit'])
        self.assertEqual(env,{'PATH':'/bin'})

    def test_child_requires_actual_committed_manifest(self):
        worker=self.dispatcher(command=[sys.executable,'-c','print(\'{"success":true}\')']);worker.once()
        self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'BATCH_MANIFEST_MISSING')
    def test_lease_loss_kills_child_and_never_completes(self):
        self.store.heartbeat.side_effect=[{},metadata.PipelineError('PIPELINE_LEASE_LOST',409)]
        self.dispatcher(command=[sys.executable,'-c','import time;time.sleep(30)']).once();self.store.complete.assert_not_called()
    def test_source_policy_failure_is_specific_and_never_starts_driver(self):
        self.binder.side_effect=ValueError('UNTRUSTED_CERT_DISABLED')
        with patch.object(dispatch.subprocess,'Popen') as process:
            self.dispatcher().once();process.assert_not_called()
        self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'UNTRUSTED_CERT_DISABLED')
    def test_private_binding_exception_returns_only_a_safe_stage_code(self):
        self.binder.side_effect=RuntimeError('password=private-credential user=private-owner')
        with patch('builtins.print') as log:self.dispatcher().once()
        self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'BATCH_SOURCE_BIND_FAILED')
        self.assertNotIn('private-',str(log.call_args_list));self.assertIn('BIND_SOURCE',str(log.call_args_list))
    def test_driver_public_failure_code_survives_nonzero_exit(self):
        script='import json,sys;print(json.dumps({"success":False,"code":"BATCH_SOURCE_NOT_FOUND","detail":"private password"}));sys.exit(1)'
        with patch('builtins.print') as log:self.dispatcher(command=[sys.executable,'-c',script]).once()
        self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'BATCH_SOURCE_NOT_FOUND')
        self.assertNotIn('private password',str(log.call_args_list))

    def test_output_registration_keeps_public_sql_error_and_committed_artifact(self):
        self.manifest()
        self.store.complete.side_effect=[metadata.PipelineError('PIPELINE_OUTPUT_INVALID'),{}]
        with patch('builtins.print') as log:self.dispatcher().once()
        self.assertTrue((self.root/self.run_id/'manifest.json').is_file())
        self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'PIPELINE_OUTPUT_INVALID')
        self.assertNotIn('graph_json',str(log.call_args_list))

    def test_cancel_running_and_timeout(self):
        self.store.heartbeat.side_effect=[{}, {'cancel_requested':True}]
        self.dispatcher(command=[sys.executable,'-c','import time;time.sleep(30)']).once();self.assertEqual(self.store.complete.call_args.args[2],'CANCELLED')
        self.store.reset_mock();self.store.heartbeat.side_effect=None;self.store.heartbeat.return_value={}
        self.dispatcher(command=[sys.executable,'-c','import time;time.sleep(30)'],timeout=1).once();self.assertEqual(self.store.complete.call_args.kwargs['error_code'],'BATCH_TIMEOUT')


if __name__=='__main__':unittest.main()
