import copy
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routes import studio_datasets_api as api
from app.services import studio_science_models as models
from app.services import studio_spark_preview as service


class ScienceApiTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__); app.register_blueprint(api.studio_datasets_bp); self.client = app.test_client()
        with models._LOCK: models._MODELS.clear()

    def test_model_endpoints_require_authentication_and_training_csrf(self):
        with patch.object(api, '_principal', side_effect=PermissionError('AUTH_REQUIRED')):
            self.assertEqual(self.client.get('/api/studio/datasets/science-models').status_code, 401)
            self.assertEqual(self.client.post('/api/studio/datasets/science-models', json={}).status_code, 401)
        with patch.object(api, '_principal', return_value='u'), patch.object(api, '_mutating', side_effect=PermissionError('CSRF_INVALID')), patch.object(models, 'train_model') as train:
            self.assertEqual(self.client.post('/api/studio/datasets/science-models', json={}).status_code, 403); train.assert_not_called()

    def test_models_are_private_expiring_and_no_artifact_is_exposed(self):
        request = {'columns':['X','Y'], 'rows':[['1','2']], 'target':'Y', 'numeric':['X'], 'categorical':[], 'task':'prediction'}
        trained = {'artifact':'server-only', 'task':'prediction', 'numeric':['X'], 'categorical':[], 'target':'Y', 'algorithm':'Linear Regression', 'score':0.1, 'metric':'CV RMSE', 'training_rows':6}
        with patch.object(service, '_run_worker', return_value=trained), patch.object(models.time, 'time', return_value=100):
            model = models.train_model('alice', request)
            self.assertNotIn('artifact', model); self.assertNotIn('owner', model)
            with patch.object(api, '_principal', return_value='alice'):
                response = self.client.get('/api/studio/datasets/science-models')
                self.assertEqual(len(response.json['data']),1); self.assertNotIn('artifact',response.json['data'][0]); self.assertEqual(response.headers['Cache-Control'],'no-store')
            self.assertEqual(models.list_models('bob'), [])
            step = {'type':'data_science','operation':'inference','model_id':model['id'],'output':'Pred'}
            with self.assertRaisesRegex(ValueError,'NOT_FOUND'): models.resolve_steps('bob',[step])
            resolved = models.resolve_steps('alice',[step]); self.assertEqual(resolved[0]['_trusted_model']['artifact'],'server-only'); self.assertNotIn('_trusted_model',step)
        with patch.object(models.time,'time',return_value=4000):
            self.assertEqual(models.list_models('alice'),[])
            with self.assertRaisesRegex(ValueError,'NOT_FOUND'): models.resolve_steps('alice',[step])

    def test_no_public_preview_route_accepts_uploaded_model_artifacts(self):
        for field in ('artifact','model','_trusted_model'):
            step = {'type':'data_science','operation':'inference_trusted','output':'Pred',field:'untrusted'}
            graph = {'sources':[{'id':'source','kind':'fixed','columns':['X'],'rows':[['1']]}], 'nodes':[{'id':'node','inputs':[{'node':'source','port':'main'}],'steps':[step]}], 'outputs':[{'id':'out','name':'Out','input':{'node':'node','port':'main'}}]}
            requests = [('/api/studio/datasets/graph-spark-preview',graph),('/api/studio/datasets/fixed-spark-preview',{'columns':['X'],'rows':[['1']],'steps':[step]}),('/api/studio/datasets/00000000-0000-4000-8000-000000000001/spark-preview',{'filters':{},'steps':[step]})]
            with patch.object(api,'_principal',return_value='u'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode') as db,patch.object(service,'_run_worker') as worker:
                for url,body in requests:
                    response=self.client.post(url,json=body);self.assertEqual(response.status_code,400,response.json);self.assertEqual(response.json['code'],'DATA_SCIENCE_MODEL_UPLOAD_FORBIDDEN')
                db.assert_not_called();worker.assert_not_called()

    def test_data_science_diagnostic_survives_worker_error(self):
        from unittest.mock import MagicMock
        import json
        result=MagicMock(returncode=0,stdout=json.dumps({'success':False,'code':'DATA_SCIENCE_INVALID_NUMBER','detail':'Clean numeric columns'}))
        with patch.object(service.subprocess,'run',return_value=result):
            with self.assertRaisesRegex(service.ScriptPreviewError,'DATA_SCIENCE_INVALID_NUMBER') as raised:service.spark_preview({'preview_columns':[{'name':'X'}],'rows':[['bad']]},[])
            self.assertEqual(raised.exception.detail,'Clean numeric columns')


@unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SPARK')=='1','Set STUDIO_TEST_REAL_SPARK=1')
class ScienceIntegrationTests(unittest.TestCase):
    def setUp(self):
        app=Flask(__name__);app.register_blueprint(api.studio_datasets_bp);self.client=app.test_client()

    def test_training_test_graph_and_numeric_diagnostics_through_real_spark(self):
        body={'sources':[{'id':'train','kind':'fixed','columns':['X','Y'],'rows':[[str(i),str(2*i+3)] for i in range(1,9)]},{'id':'test','kind':'fixed','columns':['X'],'rows':[['10'],['20']]}], 'nodes':[{'id':'fit','inputs':[{'node':'train','port':'main'},{'node':'test','port':'main'}],'steps':[{'type':'data_science','operation':'prediction','numeric':['X'],'categorical':[],'target':'Y','algorithm':'Linear Regression','output':'Pred'}]}], 'outputs':[{'id':'out','name':'Prediction','input':{'node':'fit','port':'main'}}]}
        with patch.object(api,'_principal',return_value='science-integration'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode',side_effect=AssertionError('No database access')):
            response=self.client.post('/api/studio/datasets/graph-spark-preview',json=body)
            self.assertEqual(response.status_code,200,response.json);self.assertEqual(response.json['data']['columns'],['X','Pred']);self.assertAlmostEqual(float(response.json['data']['rows'][0][-1]),23)
            body['sources'][1]['rows'][0]=['bad'];response=self.client.post('/api/studio/datasets/graph-spark-preview',json=body)
            self.assertEqual(response.status_code,400,response.json);self.assertEqual(response.json['code'],'DATA_SCIENCE_INVALID_NUMBER');self.assertIn('finite',response.json['detail'])

    def test_train_model_then_infer_on_new_sample_through_api_and_spark(self):
        body={'columns':['X','Y'],'rows':[[str(i),str(2*i+3)] for i in range(1,13)],'target':'Y','numeric':['X'],'categorical':[],'task':'prediction'}
        with patch.object(api,'_principal',return_value='science-integration'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode',side_effect=AssertionError('No database access')):
            response=self.client.post('/api/studio/datasets/science-models',json=body);self.assertEqual(response.status_code,200,response.json)
            model=response.json['data'];self.assertNotIn('artifact',model)
            request={'columns':['X'],'rows':[['20']],'steps':[{'type':'data_science','operation':'inference','model_id':model['id'],'output':'Pred'}]}
            response=self.client.post('/api/studio/datasets/fixed-spark-preview',json=request);self.assertEqual(response.status_code,200,response.json);self.assertAlmostEqual(float(response.json['data']['rows'][0][-1]),43,places=6)

    def test_all_six_science_tiles_in_one_real_graph(self):
        rows=[[f'2026-01-{i+1:02d}',str(i+1),str(2*(i+1)+3+(i%3)), 'A' if i<8 else 'B'] for i in range(16)]
        base={'type':'data_science','output':'Result'}
        operations=[
            {'operation':'classification','target':'Class','numeric':['X'],'categorical':[],'algorithm':'Naive Bayes'},
            {'operation':'prediction','target':'Y','numeric':['X'],'categorical':[],'algorithm':'Linear Regression'},
            {'operation':'clustering','features':['X'],'count':2,'algorithm':'k-medians'},
            {'operation':'outlier','source':'X','cutoff':2,'algorithm':'Mean Absolute Deviation'},
            {'operation':'multivariate','features':['X'],'cutoff':.95},
            {'operation':'forecasting','time':'T','target':'Y','periods':3,'history':4,'band':95,'frequency':1,'lower':'Lower','upper':'Upper'},
        ]
        nodes=[{'id':op['operation'],'inputs':[{'node':'source','port':'main'}],'steps':[{**base,**op}]} for op in operations]
        body={'sources':[{'id':'source','kind':'fixed','columns':['T','X','Y','Class'],'rows':rows}], 'nodes':nodes,'outputs':[{'id':'out-'+node['id'],'name':node['id'],'input':{'node':node['id'],'port':'main'}} for node in nodes]}
        with patch.object(api,'_principal',return_value='science-integration'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode',side_effect=AssertionError('No database access')):
            response=self.client.post('/api/studio/datasets/graph-spark-preview',json=body)
        self.assertEqual(response.status_code,200,response.json)
        outputs=response.json['data']['outputs'];self.assertEqual(len(outputs),6)
        self.assertTrue(all(len(o['rows'])==16 for o in outputs[:5]));self.assertEqual(len(outputs[-1]['rows']),7)
        self.assertEqual(outputs[-1]['rows'][-1][0],'2026-01-19');self.assertEqual(outputs[-1]['columns'][-3:],['Result','Lower','Upper'])
