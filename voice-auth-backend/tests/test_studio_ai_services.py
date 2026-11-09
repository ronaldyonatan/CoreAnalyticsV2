import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
from flask import Flask
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.routes import studio_datasets_api as api
from app.services import studio_spark_preview as service
from app.services import studio_science_models as models


def step(task='sentiment',**values):
    return {'type':'ai_llm','task':task,'model':'mistral:latest','source':'Review','instructions':'','execution':'NON_BATCH','mode':'overall' if task=='sentiment' else 'single' if task=='classify' else 'text','output':'Result','labels':[],'topics':[],'prompt':'Summarize {{Review}}' if task=='generate' else '', 'temperature':0,'fields':[],**values}


def graph(steps):
    nodes=[];previous='input'
    for i,s in enumerate(steps):
        identifier='node-'+str(i);nodes.append({'id':identifier,'inputs':[{'node':previous,'port':'main'}],'steps':[s]});previous=identifier
    return {'sources':[{'id':'input','kind':'dataset','dataset_id':'00000000-0000-4000-8000-000000000001'}],'nodes':nodes,'outputs':[{'id':'out','name':'AI','input':{'node':previous,'port':'main'}}]}


class AIAPITests(unittest.TestCase):
    def setUp(self):
        app=Flask(__name__);app.register_blueprint(api.studio_datasets_bp);self.client=app.test_client()

    def test_ai_status_requires_auth_has_no_store_artifacts_or_database_calls(self):
        with patch.object(api,'_principal',side_effect=PermissionError('AUTH_REQUIRED')):
            self.assertEqual(self.client.get('/api/studio/datasets/ai-runtime').status_code,401)
        with patch.object(api,'_principal',return_value='fixture'),patch.object(service,'_run_worker',return_value={'ready':False,'models':[],'model_inference':True}),patch.object(models,'list_models',return_value=[]),patch.object(api.core_api,'_post_mode') as db:
            response=self.client.get('/api/studio/datasets/ai-runtime');self.assertEqual(response.status_code,200);self.assertFalse(response.json['data']['ready']);self.assertEqual(response.json['data']['trained_models'],[]);self.assertEqual(response.headers['Cache-Control'],'no-store');db.assert_not_called()

    def test_invalid_ai_configuration_rejects_before_database_or_worker(self):
        self.assertEqual(models.resolve_steps('fixture',[step()])[0]['model'],'mistral:latest')
        bad=[{**step(),'url':'http://evil'},step(model='http://evil'),step(task='execute'),step(temperature=float('nan')),step('classify',labels=[]),step(mode='targeted',topics=[])]
        for s in bad:
            with patch.object(api,'_principal',return_value='fixture'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode') as db,patch.object(service,'_run_worker') as worker:
                response=self.client.post('/api/studio/datasets/graph-spark-preview',json=graph([s]));self.assertEqual(response.status_code,400,response.json);self.assertTrue(response.json['code'].startswith('AI_'));db.assert_not_called();worker.assert_not_called()
        with patch.object(api,'_principal',return_value='fixture'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode') as db:
            response=self.client.post('/api/studio/datasets/graph-spark-preview',json=graph([step(output='Output'+str(i)) for i in range(5)]));self.assertEqual(response.status_code,400);self.assertEqual(response.json['code'],'AI_TOO_MANY_STEPS');db.assert_not_called()

    def test_model_uploads_task_mismatch_and_other_owner_fail_before_dataset_access(self):
        model_id='00000000-0000-4000-8000-000000000001'
        model={'id':model_id,'owner':'alice','expires':10**12,'artifact':'server-owned','task':'prediction','numeric':['X'],'categorical':[]}
        with patch.dict(models._MODELS,{model_id:model},clear=True),patch.object(api,'_principal',return_value='bob'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode') as db:
            body=graph([{'type':'ai_model','model_id':model_id,'output':'Pred','task':'prediction','include_input':False}]);response=self.client.post('/api/studio/datasets/graph-spark-preview',json=body);self.assertEqual(response.status_code,400);self.assertEqual(response.json['code'],'AI_MODEL_NOT_FOUND');db.assert_not_called()
        with patch.dict(models._MODELS,{model_id:model},clear=True):
            with self.assertRaisesRegex(ValueError,'TASK_MISMATCH'):models.resolve_steps('alice',[{'type':'ai_model','model_id':model_id,'output':'Pred','task':'classification','include_input':True}])
            resolved=models.resolve_steps('alice',[{'type':'ai_model','model_id':model_id,'output':'Pred','task':'prediction','include_input':False}]);self.assertEqual(resolved[0]['type'],'ai_model_trusted');self.assertEqual(resolved[0]['_trusted_model']['artifact'],'server-owned')
        for key in ('_trusted_model','model','artifact'):
            with self.assertRaisesRegex(ValueError,'UPLOAD_FORBIDDEN'):models.resolve_steps('alice',[{'type':'ai_model_trusted',key:'untrusted'}])

    def test_worker_ai_budget_timeout_and_diagnostics_are_bounded(self):
        reply=MagicMock(returncode=0,stdout=json.dumps({'success':False,'code':'AI_PROVIDER_UNAVAILABLE','detail':'Local model unavailable'}))
        with patch.object(service.subprocess,'run',return_value=reply) as run:
            with self.assertRaisesRegex(service.ScriptPreviewError,'AI_PROVIDER_UNAVAILABLE') as raised:service.spark_preview({'preview_columns':[{'name':'Review'}],'rows':[['x']]},[step()])
            self.assertEqual(raised.exception.detail,'Local model unavailable');self.assertEqual(run.call_args.kwargs['timeout'],120)
        with patch.object(api,'_principal',return_value='fixture'),patch.object(api,'_mutating',side_effect=PermissionError('CSRF_INVALID')):
            self.assertEqual(self.client.post('/api/studio/datasets/graph-spark-preview',json=graph([step()])).status_code,403)


@unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SPARK')=='1','Set STUDIO_TEST_REAL_SPARK=1')
class AIModelIntegrationTests(unittest.TestCase):
    def test_trained_model_inference_uses_selected_task_and_include_input(self):
        app=Flask(__name__);app.register_blueprint(api.studio_datasets_bp);client=app.test_client()
        training={'columns':['X','Y'],'rows':[[str(i),str(2*i+3)] for i in range(1,13)],'target':'Y','numeric':['X'],'categorical':[],'task':'prediction'}
        with patch.object(api,'_principal',return_value='ai-model-integration'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode',side_effect=AssertionError('No database access')):
            response=client.post('/api/studio/datasets/science-models',json=training);self.assertEqual(response.status_code,200,response.json);model=response.json['data']
            body={'columns':['X'],'rows':[['20']],'steps':[{'type':'ai_model','model_id':model['id'],'task':'prediction','output':'Pred','include_input':False}]}
            response=client.post('/api/studio/datasets/fixed-spark-preview',json=body);self.assertEqual(response.status_code,200,response.json);self.assertEqual(response.json['data']['columns'],['Pred']);self.assertAlmostEqual(float(response.json['data']['rows'][0][0]),43);self.assertEqual(response.json['data']['ai_usage'][0]['requests'],0)
            body['steps'][0]['include_input']=True;response=client.post('/api/studio/datasets/fixed-spark-preview',json=body);self.assertEqual(response.status_code,200,response.json);self.assertEqual(response.json['data']['columns'],['X','Pred'])

    @unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_AI')=='1','Set STUDIO_TEST_REAL_AI=1')
    def test_classification_sentiment_generation_through_real_spark_and_local_llm(self):
        app=Flask(__name__);app.register_blueprint(api.studio_datasets_bp);client=app.test_client()
        operations=[step('classify',output='Category',labels=[{'name':'Praise','description':'Happy customer'},{'name':'Complaint','description':'Unhappy customer'}]),step(output='Sentiment'),step('generate',output='Summary')]
        body={'sources':[{'id':'input','kind':'fixed','columns':['Review'],'rows':[['Excellent product. I love it.']]}],'nodes':[{'id':'ai-'+str(i),'inputs':[{'node':'input','port':'main'}],'steps':[s]} for i,s in enumerate(operations)],'outputs':[{'id':'out-'+str(i),'name':s['task'],'input':{'node':'ai-'+str(i),'port':'main'}} for i,s in enumerate(operations)]}
        with patch.object(api,'_principal',return_value='ai-integration'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode',side_effect=AssertionError('No database access')):
            response=client.post('/api/studio/datasets/graph-spark-preview',json=body)
        self.assertEqual(response.status_code,200,response.json);data=response.json['data'];self.assertEqual(len(data['outputs']),3);self.assertEqual(data['outputs'][0]['rows'][0][-1],'Praise');self.assertEqual(data['outputs'][1]['rows'][0][-1],'Positive');self.assertTrue(data['outputs'][2]['rows'][0][-1]);self.assertEqual(sum(u['requests'] for u in data['ai_usage']),3)
