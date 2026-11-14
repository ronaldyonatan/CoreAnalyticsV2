import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask
from app.routes import studio_datasets_api as api
from app.services import studio_source_query_preview as preview
from app.services import studio_dataset_query_metadata as metadata

CONNECTION = '4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3'
OTHER = '00000000-0000-4000-8000-000000000002'


class DatasetQueryRoutesTests(unittest.TestCase):
    def setUp(self):
        gate = patch('app.services.studio_dataset_query_feature.QUERY_SECURITY_REVIEW_COMPLETE', True)
        gate.start()
        self.addCleanup(gate.stop)
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        self.client = app.test_client()
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        jar = Path(self.folder.name) / 'guard.jar'; jar.touch()
        self.env = {'STUDIO_DATASET_QUERY_SQLSERVER_ENABLED': 'true',
                    'STUDIO_DATASET_QUERY_METADATA_ENABLED': 'true',
                    'STUDIO_DATASET_QUERY_CONNECTION_ID': CONNECTION,
                    'STUDIO_DATASET_QUERY_EXECUTION_LOGIN': 'query_reader',
                    'STUDIO_SQLSERVER_JDBC_JAR': str(jar),
                    'STUDIO_SQLSERVER_QUERY_GUARD_JAR': str(jar)}

    def test_security_review_is_required_even_if_feature_flags_are_enabled(self):
        with patch('app.services.studio_dataset_query_feature.QUERY_SECURITY_REVIEW_COMPLETE', False), \
             patch.dict('os.environ', self.env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_target') as target:
            response = self.client.post('/api/studio/datasets/query-feature/preview', json={'connection_id': CONNECTION, 'query': 'SELECT 1'})
        self.assertEqual(response.json['code'], 'DATASET_QUERY_SECURITY_REVIEW_REQUIRED')
        target.assert_not_called()

    def test_disabled_and_wrong_connection_never_get_credentials(self):
        with patch.object(api, '_principal', return_value=CONNECTION), patch.object(api, '_mutating'), \
             patch.object(api, '_target') as target, patch.dict('os.environ', {}, clear=True):
            response = self.client.post('/api/studio/datasets/query-feature/preview', json={'connection_id': CONNECTION, 'query': 'SELECT 1'})
            self.assertEqual(response.json['code'], 'DATASET_QUERY_DISABLED')
        with patch.object(api, '_principal', return_value=CONNECTION), patch.object(api, '_mutating'), \
             patch.object(api, '_target') as target, patch.dict('os.environ', self.env, clear=True):
            response = self.client.post('/api/studio/datasets/query-feature/preview', json={'connection_id': OTHER, 'query': 'SELECT 1'})
            self.assertEqual(response.json['code'], 'DATASET_QUERY_CONNECTION_NOT_ALLOWED')
            target.assert_not_called()

    def test_preview_requires_authorization_and_restricted_login(self):
        with patch.dict('os.environ', self.env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access') as access, \
             patch.object(api, '_target', return_value='synthetic'), \
             patch.object(preview, 'run_isolated_preview', return_value={'columns':['x'], 'rows':[[1]], 'has_more':False}) as run:
            response = self.client.post('/api/studio/datasets/query-feature/preview', json={'connection_id': CONNECTION, 'query': 'SELECT 1 AS x'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        access.assert_called_once_with(CONNECTION, 'CONNECTION', CONNECTION, write=True)
        run.assert_called_once_with('synthetic', 'SELECT 1 AS x', 'query_reader')

    def test_create_rejects_mutation_and_does_not_save_if_preview_fails(self):
        body = {'connection_id': CONNECTION, 'dataset_name':'Example', 'description':'', 'query':'DELETE FROM x'}
        with patch.dict('os.environ', self.env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access'), \
             patch.object(api, '_target', return_value='synthetic'), \
             patch.object(preview, 'run_isolated_preview', side_effect=ValueError('QUERY_PREVIEW_UNAVAILABLE')) as run, \
             patch.object(metadata, 'create_definition') as create:
            response = self.client.post('/api/studio/datasets/query-feature', json=body)
            self.assertEqual(response.json['code'], 'QUERY_SELECT_REQUIRED')
            run.assert_not_called()
            body['query'] = 'SELECT 1 AS x'
            response = self.client.post('/api/studio/datasets/query-feature', json=body)
            self.assertEqual(response.json['code'], 'QUERY_PREVIEW_UNAVAILABLE')
            create.assert_not_called()

    def test_create_previews_before_saving_query(self):
        body = {'connection_id': CONNECTION, 'dataset_name':'Example', 'description':'', 'query':'SELECT 1 AS x'}
        calls = []
        with patch.dict('os.environ', self.env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access'), \
             patch.object(api, '_target', return_value='synthetic'), \
             patch.object(preview, 'run_isolated_preview', side_effect=lambda *a: calls.append('preview')), \
             patch.object(metadata, 'create_definition', side_effect=lambda *a: calls.append('create') or {'dataset_id': OTHER}):
            response = self.client.post('/api/studio/datasets/query-feature', json=body)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(calls, ['preview', 'create'])

    def test_csrf_failure_never_opens_connection(self):
        with patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), \
             patch.object(api, '_target') as target:
            response = self.client.post('/api/studio/datasets/query-feature/preview', json={'connection_id': CONNECTION, 'query': 'SELECT 1'})
        self.assertEqual(response.status_code, 403)
        target.assert_not_called()

    def test_preview_failure_does_not_expose_driver_error_text(self):
        with patch.dict('os.environ', self.env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access'), \
             patch.object(api, '_target', side_effect=ValueError('secret query and server')):
            response = self.client.post('/api/studio/datasets/query-feature/preview', json={'connection_id': CONNECTION, 'query': 'SELECT 1'})
        self.assertEqual(response.json['code'], 'DATASET_QUERY_UNAVAILABLE')
        self.assertNotIn('secret', str(response.json))

if __name__ == '__main__':
    unittest.main()
