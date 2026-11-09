import copy
import json
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from flask import Flask
from app.routes import studio_pipelines_api as api
from app.services import studio_parquet_outputs as outputs
from app.services.studio_pipelines import PipelineError


class OutputApiTests(unittest.TestCase):
    def setUp(self):
        self.output_id=str(uuid.uuid4());self.run=str(uuid.uuid4());self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.token=Path(self.temp.name)/'token';self.token.write_text('a'*64)
        self.record={'output_version_id':self.output_id,'output_name':'Result','run_id':self.run,'output_node_id':'output','row_count':51,'schema_json':json.dumps({'type':'struct','fields':[{'name':'ID','type':'integer','nullable':False,'metadata':{}}]})}
        columns=[{'name':'ID','type':'integer'}]
        self.result={'total_rows':51,'schema':json.loads(self.record['schema_json']),'page':2,'page_size':50,'columns':columns,'preview_columns':columns,'omitted_columns':0,'rows':[['50']],'stable_order':True,'truncated_cells':False,'has_more':False,'internal_path':'MUST_NOT_LEAK'}
        env=patch.dict(os.environ,{'STUDIO_PARQUET_READER_URL':'http://127.0.0.1:18089','STUDIO_PARQUET_READER_TOKEN_FILE':str(self.token),'STUDIO_PARQUET_ALLOW_HTTP':'false'});env.start();self.addCleanup(env.stop)
        store=patch.object(outputs.pipeline_store,'output',return_value=self.record);self.store=store.start();self.addCleanup(store.stop)
        session=patch.object(outputs.requests,'Session');self.session_factory=session.start();self.addCleanup(session.stop)
        self.session=self.session_factory.return_value.__enter__.return_value
        self.response=self.session.post.return_value.__enter__.return_value
        self.response.status_code=200;self.respond()
        app=Flask(__name__);app.register_blueprint(api.studio_pipelines_bp);self.client=app.test_client()
    def respond(self):self.response.iter_content.return_value=[json.dumps({'success':True,'data':self.result}).encode()]
    def test_owner_lookup_precedes_secret_or_network_and_scopes_every_page(self):
        self.store.side_effect=PipelineError('PIPELINE_OUTPUT_NOT_FOUND',404)
        with patch.object(outputs.Path,'read_text') as secret:
            with self.assertRaises(PipelineError) as error:outputs.preview_output('other',self.output_id,2)
            self.assertEqual(error.exception.http_status,404);secret.assert_not_called();self.session_factory.assert_not_called()
        self.store.assert_called_once_with('other',self.output_id)
    def test_owned_page_uses_run_identity_no_path_and_strips_private_response_fields(self):
        result=outputs.preview_output('owner',self.output_id,2)
        self.assertEqual(result['rows'],[['50']]);self.assertNotIn('schema',result);self.assertNotIn('internal_path',result)
        args=self.session.post.call_args;self.assertEqual(args.kwargs['json'],{'run_id':self.run,'node_id':'output','page':2});self.assertFalse(args.kwargs['allow_redirects']);self.assertFalse(self.session.trust_env)
    def test_metadata_schema_or_count_mismatch_not_returned(self):
        for field,value in [('total_rows',5000),('schema',{'type':'struct','fields':[]})]:
            original=copy.deepcopy(self.result);self.result[field]=value;self.respond()
            with self.subTest(field=field),self.assertRaisesRegex(PipelineError,'VERSION_MISMATCH'):outputs.preview_output('owner',self.output_id,2)
            self.result=original
    def test_bad_rows_page_and_oversized_responses_rejected(self):
        for field,value in [('rows',[[{}]]),('page',1),('rows',[['x'*257]]),('rows',[]),('has_more',True)]:
            original=copy.deepcopy(self.result);self.result[field]=value;self.respond()
            with self.subTest(field=field),self.assertRaisesRegex(PipelineError,'RESPONSE_INVALID'):outputs.preview_output('owner',self.output_id,2)
            self.result=original
        self.response.iter_content.return_value=[b'x'*(4*1024*1024+1)]
        with self.assertRaisesRegex(PipelineError,'RESPONSE_INVALID'):outputs.preview_output('owner',self.output_id,2)
    def test_redirect_auth_failure_and_transport_errors_are_sanitized(self):
        self.response.status_code=302
        with self.assertRaisesRegex(PipelineError,'READER_UNAVAILABLE'):outputs.preview_output('owner',self.output_id,2)
        self.session.post.side_effect=RuntimeError('private-token='+('a'*64))
        with self.assertRaises(PipelineError) as error:outputs.preview_output('owner',self.output_id,2)
        self.assertNotIn('private',str(error.exception))
    def test_remote_http_requires_operator_opt_in(self):
        with patch.dict(os.environ,{'STUDIO_PARQUET_READER_URL':'http://private-reader:8090'}):
            with self.assertRaisesRegex(PipelineError,'TLS_REQUIRED'):outputs.preview_output('owner',self.output_id,2)
        self.session_factory.assert_not_called()
    def test_invalid_pages_before_metadata_and_no_arbitrary_browser_path(self):
        with patch.object(api,'_principal',return_value='owner'):
            for query in ['page=0','page=true','page=2147483648','page=1&page=2','path=../../secret','page=-1']:
                self.assertEqual(self.client.get('/api/studio/pipelines/outputs/'+self.output_id+'/preview?'+query).status_code,400)
        self.store.assert_not_called();self.session_factory.assert_not_called()
    def test_session_guard_and_not_found_prevent_reader_calls(self):
        with patch.object(api,'_principal',side_effect=PermissionError('AUTH_REQUIRED')):
            result=self.client.get('/api/studio/pipelines/outputs/'+self.output_id+'/preview')
            self.assertEqual(result.status_code,401);self.assertEqual(result.headers['Cache-Control'],'no-store')
        self.store.assert_not_called()
        with patch.object(api,'_principal',return_value='other'):
            self.store.side_effect=PipelineError('PIPELINE_OUTPUT_NOT_FOUND',404)
            self.assertEqual(self.client.get('/api/studio/pipelines/outputs/'+self.output_id+'/preview').status_code,404)
        self.session_factory.assert_not_called()
    def test_catalog_public_fields_only_and_page_endpoint(self):
        with patch.object(api,'_principal',return_value='owner'),patch.object(api.pipeline_store,'outputs',return_value=[{'output_version_id':self.output_id,'output_name':'Result','storage_relative_path':'secret-path'}]):
            result=self.client.get('/api/studio/pipelines/outputs')
            self.assertNotIn('storage_relative_path',result.json['data'][0])
            result=self.client.get('/api/studio/pipelines/outputs/'+self.output_id+'/preview?page=2')
            self.assertEqual(result.status_code,200);self.assertEqual(result.json['data']['rows'],[['50']])


if __name__=='__main__':unittest.main()
