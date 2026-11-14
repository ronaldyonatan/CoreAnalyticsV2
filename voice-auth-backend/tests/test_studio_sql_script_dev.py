import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from flask import Flask

from app.connectors.sqlserver import SqlServerTarget
from app.routes import studio_datasets_api as api
from app.services import studio_source_sql_script_dev as service
from app.services import studio_source_sql_script_runner as runner
import pyodbc

CONNECTION = '4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3'
OTHER = '00000000-0000-4000-8000-000000000002'
ENV = {'STUDIO_SQL_SCRIPT_PREVIEW_DEV_ENABLED': 'true',
       'STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID': CONNECTION}


class SqlScriptDevTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        self.client = app.test_client()

    def test_disabled_and_wrong_connection_never_resolve_credentials(self):
        with patch.object(api, '_principal', return_value=CONNECTION), patch.object(api, '_mutating'), \
             patch.object(api, '_target') as target:
            with patch.dict('os.environ', {}, clear=True):
                response = self.client.post('/api/studio/datasets/query-script-dev/preview', json={'connection_id': CONNECTION, 'query': 'SELECT 1'})
                self.assertEqual(response.json['code'], 'QUERY_SCRIPT_DEV_DISABLED')
            with patch.dict('os.environ', ENV, clear=True):
                response = self.client.post('/api/studio/datasets/query-script-dev/preview', json={'connection_id': OTHER, 'query': 'SELECT 1'})
                self.assertEqual(response.json['code'], 'QUERY_SCRIPT_DEV_CONNECTION_DENIED')
            target.assert_not_called()

    def test_preview_uses_authorized_connection_and_same_script(self):
        target = object()
        sql = 'SELECT 1 INTO #t; SELECT * FROM #t;'
        with patch.dict('os.environ', ENV, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access') as access, \
             patch.object(api, '_target', return_value=target), \
             patch.object(service, 'preview', return_value={'columns':['x'], 'rows':[[1]], 'has_more':False}) as run:
            response = self.client.post('/api/studio/datasets/query-script-dev/preview', json={'connection_id': CONNECTION, 'query': sql})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        access.assert_called_once_with(CONNECTION, 'CONNECTION', CONNECTION, write=True)
        run.assert_called_once_with(target, sql)

    def test_child_process_receives_sql_and_credentials_only_via_stdin(self):
        target = SqlServerTarget('host', 1433, 'BI', 'sa', 'synthetic')
        data = {'columns':['x'], 'rows':[[1]], 'has_more':False}
        proc = SimpleNamespace(returncode=0, stdout=json.dumps({'success':True, 'data':data}).encode())
        with patch.object(service.subprocess, 'run', return_value=proc) as run:
            self.assertEqual(service.preview(target, 'SELECT 1'), data)
        command = run.call_args.args[0]
        self.assertNotIn('synthetic', str(command))
        self.assertNotIn('SELECT 1', str(command))
        payload = json.loads(run.call_args.kwargs['input'])
        self.assertEqual(payload['query'], 'SELECT 1')

    def test_csrf_denial_precedes_target_access(self):
        with patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), \
             patch.object(api, '_target') as target:
            response = self.client.post('/api/studio/datasets/query-script-dev/preview', json={'connection_id': CONNECTION, 'query': 'SELECT 1'})
        self.assertEqual(response.status_code, 403)
        target.assert_not_called()

    def test_known_sql_errors_are_mapped_without_driver_text(self):
        for number, code in [('208', 'QUERY_SQL_OBJECT_NOT_FOUND'), ('207', 'QUERY_SQL_COLUMN_NOT_FOUND'),
                             ('102', 'QUERY_SQL_SYNTAX_ERROR'), ('229', 'QUERY_SQL_PERMISSION_DENIED')]:
            with self.subTest(number=number):
                error = pyodbc.ProgrammingError('42S02', f'Secret server and SQL ({number})')
                self.assertEqual(runner.safe_failure(error), code)
        self.assertEqual(runner.safe_failure(ValueError('secret (208)')), 'QUERY_SCRIPT_PREVIEW_FAILED')

    def test_safe_child_code_propagates_without_driver_message(self):
        target = SqlServerTarget('host', 1433, 'BI', 'sa', 'synthetic')
        result = {'success':False, 'code':'QUERY_SQL_OBJECT_NOT_FOUND', 'message':'secret server name'}
        proc = SimpleNamespace(returncode=0, stdout=json.dumps(result).encode())
        with patch.object(service.subprocess, 'run', return_value=proc), \
             self.assertRaisesRegex(ValueError, '^QUERY_SQL_OBJECT_NOT_FOUND$'):
            service.preview(target, 'SELECT 1')

    def test_unknown_child_code_is_not_reflected(self):
        target = SqlServerTarget('host', 1433, 'BI', 'sa', 'synthetic')
        proc = SimpleNamespace(returncode=0, stdout=json.dumps({'success':False, 'code':'secret'}).encode())
        with patch.object(service.subprocess, 'run', return_value=proc), \
             self.assertRaisesRegex(ValueError, '^QUERY_SCRIPT_PREVIEW_FAILED$'):
            service.preview(target, 'SELECT 1')

    def test_route_returns_safe_object_not_found_code(self):
        with patch.dict('os.environ', ENV, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access'), \
             patch.object(api, '_target', return_value=object()), \
             patch.object(service, 'preview', side_effect=ValueError('QUERY_SQL_OBJECT_NOT_FOUND')):
            response = self.client.post('/api/studio/datasets/query-script-dev/preview',
                                        json={'connection_id':CONNECTION, 'query':'SELECT * FROM missing'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json['code'], 'QUERY_SQL_OBJECT_NOT_FOUND')

    def test_columns_use_authorized_metadata_path_without_running_user_sql(self):
        from unittest.mock import MagicMock
        target = SqlServerTarget('host', 1433, 'BI', 'sa', 'synthetic')
        db = MagicMock()
        with patch.dict('os.environ', ENV, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_require_object_access') as access, patch.object(api, '_target', return_value=target), \
             patch('app.connectors.sqlserver.open_readonly_connection', return_value=db), \
             patch('app.connectors.sqlserver._dataset_columns', return_value=(1, [{'name':'HealthcareID', 'type':'varchar'}], [])) as columns:
            response = self.client.get(f'/api/studio/datasets/query-script-dev/columns/{CONNECTION}',
                                       query_string={'schema':'dbo', 'name':'BI_DailyTracking', 'type':'BASE TABLE'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['data']['columns'][0]['name'], 'HealthcareID')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        access.assert_called_once_with(CONNECTION, 'CONNECTION', CONNECTION, write=True)
        columns.assert_called_once_with(db.cursor.return_value, {'schema':'dbo','name':'BI_DailyTracking','type':'BASE TABLE'})
        db.cursor.return_value.close.assert_called_once()
        db.close.assert_called_once()

    def test_columns_denied_for_other_connection_before_credentials(self):
        with patch.dict('os.environ', ENV, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_target') as target:
            response = self.client.get(f'/api/studio/datasets/query-script-dev/columns/{OTHER}',
                                       query_string={'schema':'dbo', 'name':'t', 'type':'BASE TABLE'})
        self.assertEqual(response.status_code, 400)
        target.assert_not_called()

    def test_column_search_is_bounded_parameterized_and_authorized(self):
        from unittest.mock import MagicMock
        target = SqlServerTarget('host', 1433, 'BI', 'sa', 'synthetic')
        db = MagicMock()
        db.cursor.return_value.fetchmany.return_value = [('dbo', 'BI_DailyTracking', 'HealthcareID')]
        with patch.dict('os.environ', ENV, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_require_object_access') as access, patch.object(api, '_target', return_value=target), \
             patch('app.connectors.sqlserver.open_readonly_connection', return_value=db):
            response = self.client.get(f'/api/studio/datasets/query-script-dev/column-search/{CONNECTION}',
                                       query_string={'q':'Health_%['})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['data']['items'], [{'schema':'dbo', 'table':'BI_DailyTracking', 'name':'HealthcareID'}])
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        access.assert_called_once_with(CONNECTION, 'CONNECTION', CONNECTION, write=True)
        args = db.cursor.return_value.execute.call_args.args
        self.assertIn('TOP (50)', args[0])
        self.assertNotIn('Health_', args[0])
        self.assertEqual(args[1], 'Health\\_\\%\\[%')
        db.cursor.return_value.close.assert_called_once()
        db.close.assert_called_once()

    def test_column_search_denies_unlisted_connection(self):
        with patch.dict('os.environ', ENV, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_target') as target:
            response = self.client.get(f'/api/studio/datasets/query-script-dev/column-search/{OTHER}', query_string={'q':'He'})
        self.assertEqual(response.status_code, 400)
        target.assert_not_called()

    def test_script_create_does_not_execute_script_during_save(self):
        from app.services import studio_dataset_query_metadata as metadata
        body = {'connection_id':CONNECTION, 'dataset_name':'Test', 'description':'', 'query':'SELECT 1 INTO #x; SELECT * FROM #x'}
        env = {**ENV, 'STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED':'true'}
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access'), patch.object(api, '_target') as target, \
             patch.object(metadata, 'create_script_definition', return_value={'dataset_id':OTHER}) as create:
            response = self.client.post('/api/studio/datasets/query-script-dev', json=body)
        self.assertEqual(response.status_code, 201)
        create.assert_called_once_with(CONNECTION, CONNECTION, 'Test', '', body['query'])
        target.assert_not_called()

    def test_status_only_enables_save_when_metadata_gateway_is_ready(self):
        from app.services import studio_dataset_query_metadata as metadata
        env = {**ENV, 'STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED':'true'}
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_require_object_access'), patch.object(metadata, 'script_metadata_ready', return_value=True):
            response = self.client.get('/api/studio/datasets/query-script-dev/status', query_string={'connection_id':CONNECTION})
        self.assertEqual(response.json['data'], {'available':True, 'save_available':True})
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_require_object_access'), patch.object(metadata, 'script_metadata_ready', side_effect=RuntimeError('offline')):
            response = self.client.get('/api/studio/datasets/query-script-dev/status', query_string={'connection_id':CONNECTION})
        self.assertEqual(response.json['data'], {'available':True, 'save_available':False})

    def test_saved_query_requires_dataset_execute_access_and_is_not_cached(self):
        from app.services import studio_dataset_query_metadata as metadata
        payload = {'dataset_id':OTHER, 'connection_id':CONNECTION, 'dialect':'sqlserver', 'query':'SELECT 1'}
        with patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_require_object_access') as access, \
             patch.object(metadata, 'read_script_definition', return_value=payload) as read:
            response = self.client.get(f'/api/studio/datasets/{OTHER}/query-definition')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['data']['query'], 'SELECT 1')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertTrue(access.call_args.kwargs['write'])
        read.assert_called_once_with(CONNECTION, OTHER)

    def test_saved_query_denial_never_reads_definition(self):
        from app.services import studio_dataset_query_metadata as metadata
        with patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_require_object_access', side_effect=api.AccessError('OBJECT_ACCESS_DENIED', 403)), \
             patch.object(metadata, 'read_script_definition') as read:
            response = self.client.get(f'/api/studio/datasets/{OTHER}/query-definition')
        self.assertEqual(response.status_code, 403)
        read.assert_not_called()

if __name__ == '__main__':
    unittest.main()
