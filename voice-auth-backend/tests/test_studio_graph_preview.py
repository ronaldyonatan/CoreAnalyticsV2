import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routes import studio_datasets_api as api
from app.services.studio_graph_preview import validate_graph_request

DATASET = '00000000-0000-4000-8000-000000000001'


class GraphApiTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__); app.register_blueprint(api.studio_datasets_bp); self.client = app.test_client()
        self.body = {'sources': [{'id': 'source', 'kind': 'fixed', 'columns': ['n'], 'rows': [['1']]}], 'nodes': [], 'outputs': [{'id': 'output', 'name': 'Output', 'input': {'node': 'source', 'port': 'main'}}]}
        self.url = '/api/studio/datasets/graph-spark-preview'

    def test_graph_requires_session_and_csrf_before_database_or_worker(self):
        for method in ('_principal', '_mutating'):
            with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api, method, side_effect=PermissionError('AUTH_REQUIRED' if method == '_principal' else 'CSRF_ORIGIN_REJECTED')), patch.object(api.core_api, '_post_mode') as database, patch('app.services.studio_spark_preview.spark_graph_preview') as worker:
                self.assertEqual(self.client.post(self.url, json=self.body).status_code, 401 if method == '_principal' else 403)
                database.assert_not_called(); worker.assert_not_called()

    def test_fixed_graph_never_fetches_database_credentials(self):
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode') as database, patch('app.services.studio_spark_preview.spark_graph_preview', return_value={'columns': ['n'], 'rows': [['1']], 'has_more': False, 'outputs': []}) as worker:
            response = self.client.post(self.url, json=self.body)
            self.assertEqual(response.status_code, 200); self.assertEqual(response.headers['Cache-Control'], 'no-store')
            database.assert_not_called(); self.assertNotIn('kind', worker.call_args.args[0][0])

    def test_all_dataset_sources_are_authorized_before_any_connection(self):
        self.body['sources'] = [{'id': 'a', 'kind': 'dataset', 'dataset_id': DATASET}, {'id': 'b', 'kind': 'dataset', 'dataset_id': '00000000-0000-4000-8000-000000000002'}]
        self.body['nodes'] = [{'id': 'append', 'inputs': [{'node': 'a', 'port': 'main'}, {'node': 'b', 'port': 'main'}], 'steps': [{'type': 'append', 'mode': 'all', 'conflict': 'compatible'}]}]
        self.body['outputs'][0]['input']['node'] = 'append'
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode', return_value={'data': [{'dataset_id': DATASET, 'access_mode': 'DIRECT'}]}), patch.object(api, '_target') as target:
            response = self.client.post(self.url, json=self.body)
            self.assertEqual(response.status_code, 404); target.assert_not_called()

    def test_direct_source_sampling_is_bounded_and_authenticated(self):
        self.body['sources'] = [{'id': 'source', 'kind': 'dataset', 'dataset_id': DATASET}]
        definition = {'dataset_id': DATASET, 'access_mode': 'DIRECT', 'connection_id': DATASET, 'source_schema': 'dbo', 'source_name': 'Sales', 'source_type': 'VIEW'}
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode', return_value={'data': [definition]}), patch.object(api, '_target', return_value='target'), patch.object(api, 'preview_sqlserver_object', return_value={'preview_columns': [{'name': 'n'}], 'rows': [['1']], 'has_more': True}) as source, patch('app.services.studio_spark_preview.spark_graph_preview', return_value={'columns': ['n'], 'rows': [['1']], 'has_more': False, 'outputs': [{'has_more': False}]}) as worker:
            response = self.client.post(self.url, json=self.body)
            self.assertEqual(response.status_code, 200); self.assertTrue(response.json['data']['has_more']); self.assertTrue(response.json['data']['outputs'][0]['has_more'])
            self.assertEqual(source.call_args.args[2:], (1, {}, None)); self.assertEqual(worker.call_args.args[0][0]['columns'], ['n'])

    def test_invalid_graph_rejected_before_source_access(self):
        bad = []
        for changed in [None, {}, {'sources': [], 'nodes': [], 'outputs': []}]: bad.append(changed)
        duplicate = copy.deepcopy(self.body); duplicate['outputs'][0]['id'] = 'source'; bad.append(duplicate)
        unknown = copy.deepcopy(self.body); unknown['outputs'][0]['input']['node'] = 'missing'; bad.append(unknown)
        unused = copy.deepcopy(self.body); unused['sources'].append({'id': 'unused', 'kind': 'fixed', 'columns': ['n'], 'rows': [['1']]}); bad.append(unused)
        invalid = copy.deepcopy(self.body); invalid['sources'][0]['rows'] = [[1]]; bad.append(invalid)
        for body in bad:
            with self.subTest(body=body), patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode') as database:
                self.assertEqual(self.client.post(self.url, json=body).status_code, 400); database.assert_not_called()
