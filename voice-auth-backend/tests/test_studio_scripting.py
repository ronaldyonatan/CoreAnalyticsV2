import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from flask import Flask
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routes import studio_datasets_api as api
from app.services import studio_spark_preview as service
from app.services.studio_graph_preview import validate_graph_request


class ScriptApiTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__); app.register_blueprint(api.studio_datasets_bp); self.client = app.test_client()

    def test_runtime_status_requires_session_and_has_no_database_access(self):
        with patch.object(api, '_principal', side_effect=PermissionError('AUTH_REQUIRED')), patch.object(service, 'scripting_status') as status:
            self.assertEqual(self.client.get('/api/studio/datasets/script-runtime').status_code, 401); status.assert_not_called()
        with patch.object(api, '_principal', return_value='user'), patch.object(service, 'scripting_status', return_value={'python': True, 'r': True}), patch.object(api.core_api, '_post_mode') as database:
            response = self.client.get('/api/studio/datasets/script-runtime')
            self.assertEqual(response.status_code, 200); self.assertTrue(response.json['data']['r']); self.assertEqual(response.headers['Cache-Control'], 'no-store'); database.assert_not_called()

    def test_script_error_detail_is_bounded_and_visible(self):
        body = {'columns': ['x'], 'rows': [['1']], 'steps': [{'type': 'script'}]}
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(service, 'spark_preview', side_effect=service.ScriptPreviewError('SCRIPT_EXECUTION_FAILED', 'SyntaxError: line 2')):
            response = self.client.post('/api/studio/datasets/fixed-spark-preview', json=body)
            self.assertEqual(response.status_code, 400); self.assertEqual(response.json['detail'], 'SyntaxError: line 2')
        self.assertEqual(len(service.ScriptPreviewError('SCRIPT_EXECUTION_FAILED', 'x' * 2000).detail), 1000)

    def test_more_than_four_script_nodes_rejected_before_dataset_access(self):
        nodes = []
        previous = 'source'
        for i in range(5):
            identifier = f'node-{i}'
            nodes.append({'id': identifier, 'inputs': [{'node': previous, 'port': 'main'}], 'steps': [{'type': 'script', 'language': 'python', 'code': 'output = df', 'outputs': [{'name': 'x', 'kind': 'Text'}]}]})
            previous = identifier
        body = {'sources': [{'id': 'source', 'kind': 'dataset', 'dataset_id': '00000000-0000-4000-8000-000000000001'}], 'nodes': nodes, 'outputs': [{'id': 'output', 'name': 'Output', 'input': {'node': previous, 'port': 'main'}}]}
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode') as database:
            response = self.client.post('/api/studio/datasets/graph-spark-preview', json=body)
            self.assertEqual(response.status_code, 400); self.assertEqual(response.json['code'], 'SCRIPT_TOO_MANY_STEPS'); database.assert_not_called()

    def test_cleanup_removes_only_containers_labelled_for_request(self):
        request_id = 'a' * 32
        listed = MagicMock(stdout=b'0123456789ab\nuntrusted-name\n', returncode=0)
        with patch.object(service.shutil, 'which', return_value='/usr/local/bin/docker'), patch.object(service.subprocess, 'run', return_value=listed) as run:
            service._cleanup_scripts(request_id)
            self.assertIn('label=coreanalytics.preview-request=' + request_id, run.call_args_list[0].args[0])
            self.assertEqual(run.call_args_list[1].args[0], ['/usr/local/bin/docker', 'rm', '--force', '0123456789ab'])

    def test_worker_error_propagation_and_cleanup_on_failure(self):
        result = MagicMock(returncode=0, stdout=json.dumps({'success': False, 'code': 'SCRIPT_SCHEMA_MISMATCH', 'detail': 'Expected x'}))
        with patch.object(service.subprocess, 'run', return_value=result), patch.object(service, '_cleanup_scripts') as cleanup:
            with self.assertRaisesRegex(service.ScriptPreviewError, 'SCRIPT_SCHEMA_MISMATCH') as error:
                service.spark_preview({'preview_columns': [{'name': 'x'}], 'rows': [['1']]}, [{'type': 'script'}])
            self.assertEqual(error.exception.detail, 'Expected x'); cleanup.assert_called_once()
