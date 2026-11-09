import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.routes import studio_datasets_api as api
from app.services import studio_spark_preview as service


def graph():
    return {'sources':[{'id':'input','kind':'fixed','columns':['Name','Amount'],'rows':[['Andi','10'],['Budi','30']]}], 'nodes':[{'id':'store','inputs':[{'node':'input','port':'main'}],'steps':[{'type':'select_store','columns':['Amount'],'key':'Key'}]},{'id':'restore','inputs':[{'node':'store','port':'main'}],'steps':[{'type':'restore_columns','store':'store','key':'Key'}]}], 'outputs':[{'id':'out','name':'Performance','input':{'node':'restore','port':'main'}}]}


class PerformanceApiTests(unittest.TestCase):
    def setUp(self):
        app=Flask(__name__);app.register_blueprint(api.studio_datasets_bp);self.client=app.test_client()

    def test_missing_sibling_store_invalid_key_and_selection_reject_before_dataset_access(self):
        cases=[]
        body=graph();body['nodes'][1]['inputs'][0]['node']='input';body['outputs'].append({'id':'stored-out','name':'Stored','input':{'node':'store','port':'main'}});cases.append(body)
        body=graph();body['nodes'][1]['steps'][0]['store']='unknown';cases.append(body)
        body=graph();body['nodes'][1]['steps'][0]['key']='Renamed';cases.append(body)
        body=graph();body['nodes'][0]['steps'][0]['columns']=[];cases.append(body)
        body=graph();body['nodes'][0]['steps'][0]['columns']=['Key'];cases.append(body)
        body=graph();body['nodes'][0]['steps'].append({'type':'select','columns':['Amount']});cases.append(body)
        for body in cases:
            body['sources']=[{'id':'input','kind':'dataset','dataset_id':'00000000-0000-4000-8000-000000000001'}]
            with patch.object(api,'_principal',return_value='fixture'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode') as database,patch.object(service,'spark_graph_preview') as worker:
                response=self.client.post('/api/studio/datasets/graph-spark-preview',json=body)
                self.assertEqual(response.status_code,400,response.json);self.assertTrue(response.json['code'].startswith('PERFORMANCE_'),response.json)
                database.assert_not_called();worker.assert_not_called()

    def test_graph_authentication_and_csrf_still_apply(self):
        with patch.object(api,'_principal',side_effect=PermissionError('AUTH_REQUIRED')):
            self.assertEqual(self.client.post('/api/studio/datasets/graph-spark-preview',json=graph()).status_code,401)
        with patch.object(api,'_principal',return_value='fixture'),patch.object(api,'_mutating',side_effect=PermissionError('CSRF_INVALID')):
            self.assertEqual(self.client.post('/api/studio/datasets/graph-spark-preview',json=graph()).status_code,403)

    def test_runtime_detail_forwarded_without_leaking_snapshot(self):
        with patch.object(api,'_principal',return_value='fixture'),patch.object(api,'_mutating'),patch.object(service,'spark_graph_preview',side_effect=service.ScriptPreviewError('PERFORMANCE_KEY_CHANGED','Jangan mengubah kunci.')):
            response=self.client.post('/api/studio/datasets/graph-spark-preview',json=graph())
            self.assertEqual(response.status_code,400);self.assertEqual(response.json['detail'],'Jangan mengubah kunci.')


@unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SPARK')=='1','Set STUDIO_TEST_REAL_SPARK=1')
class PerformanceIntegrationTests(unittest.TestCase):
    def test_store_filter_restore_and_changed_key_through_actual_spark(self):
        app=Flask(__name__);app.register_blueprint(api.studio_datasets_bp);client=app.test_client();body=graph()
        middle={'id':'filter','inputs':[{'node':'store','port':'main'}],'steps':[{'type':'filter','column':'Amount','op':'eq','value':'30'}]}
        body['nodes'].insert(1,middle);body['nodes'][-1]['inputs'][0]['node']='filter'
        with patch.object(api,'_principal',return_value='fixture'),patch.object(api,'_mutating'),patch.object(api.core_api,'_post_mode',side_effect=AssertionError('No database access')):
            response=client.post('/api/studio/datasets/graph-spark-preview',json=body)
            self.assertEqual(response.status_code,200,response.json);self.assertEqual(response.json['data']['columns'],['Amount','Name']);self.assertEqual(response.json['data']['rows'],[['30','Budi']]);self.assertNotIn('stores',response.json['data'])
            # Use existing select to drop the key; worker must return an actionable error.
            middle['steps']=[{'type':'select','columns':['Amount']}]
            response=client.post('/api/studio/datasets/graph-spark-preview',json=body)
            self.assertEqual(response.status_code,400,response.json);self.assertEqual(response.json['code'],'PERFORMANCE_KEY_MISSING');self.assertIn('Kunci',response.json['detail'])
