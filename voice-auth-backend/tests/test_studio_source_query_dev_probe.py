import unittest
from unittest.mock import patch
from flask import Flask

from app.connectors.sqlserver import SqlServerTarget
from app.routes import studio_datasets_api as api
from app.services import studio_source_query_dev_probe as probe
from app.services.studio_source_query_preview import QueryPreviewFailure

CONNECTION = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'


class SourceQueryDevProbeTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        self.client = app.test_client()
        self.target = SqlServerTarget('server', 1433, 'BI', 'sa', 'password')

    def test_disabled_by_default_never_opens_connection(self):
        with patch.dict('os.environ', {}, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_target') as target:
            response = self.client.post('/api/studio/datasets/query-dev-probe', json={'connection_id': CONNECTION})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json['code'], 'QUERY_DEV_PROBE_DISABLED')
        target.assert_not_called()

    def test_status_only_available_for_allowed_authorized_connection(self):
        env = {'STUDIO_QUERY_DEV_PROBE_ENABLED': 'true', 'STUDIO_QUERY_DEV_CONNECTION_ID': CONNECTION}
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_require_object_access') as access, patch.object(api, '_target') as target:
            allowed = self.client.get('/api/studio/datasets/query-dev-probe/status?connection_id=' + CONNECTION)
            denied = self.client.get('/api/studio/datasets/query-dev-probe/status?connection_id=' + OTHER)
        self.assertTrue(allowed.json['data']['available'])
        self.assertFalse(denied.json['data']['available'])
        access.assert_called_once_with(CONNECTION, 'CONNECTION', CONNECTION, write=True)
        target.assert_not_called()

    def test_status_hides_probe_on_access_denial(self):
        env = {'STUDIO_QUERY_DEV_PROBE_ENABLED': 'true', 'STUDIO_QUERY_DEV_CONNECTION_ID': CONNECTION}
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_require_object_access', side_effect=api.AccessError('OBJECT_ACCESS_DENIED', 403)):
            response = self.client.get('/api/studio/datasets/query-dev-probe/status?connection_id=' + CONNECTION)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json['data']['available'])
        self.assertEqual(response.json['data']['reason'], 'access_denied')

    def test_status_explains_when_probe_is_disabled(self):
        with patch.dict('os.environ', {}, clear=True), patch.object(api, '_principal', return_value=CONNECTION):
            response = self.client.get('/api/studio/datasets/query-dev-probe/status?connection_id=' + CONNECTION)
        self.assertEqual(response.json['data'], {'available': False, 'reason': 'disabled'})

    def test_disallows_sql_and_unlisted_connection_before_source_access(self):
        env = {'STUDIO_QUERY_DEV_PROBE_ENABLED': 'true', 'STUDIO_QUERY_DEV_CONNECTION_ID': CONNECTION}
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_target') as target:
            injected = self.client.post('/api/studio/datasets/query-dev-probe', json={'connection_id': CONNECTION, 'query': 'SELECT 1'})
            denied = self.client.post('/api/studio/datasets/query-dev-probe', json={'connection_id': OTHER})
        self.assertEqual(injected.status_code, 400)
        self.assertEqual(denied.status_code, 403)
        target.assert_not_called()

    def test_authorized_probe_uses_only_fixed_query_and_restricted_login(self):
        env = {'STUDIO_QUERY_DEV_PROBE_ENABLED': 'true', 'STUDIO_QUERY_DEV_CONNECTION_ID': CONNECTION}
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access') as access, \
             patch.object(api, '_target', return_value=self.target), \
             patch.object(probe, 'run_isolated_preview', return_value={'columns': ['has_row'], 'rows': [[1]], 'has_more': False}) as run:
            response = self.client.post('/api/studio/datasets/query-dev-probe', json={'connection_id': CONNECTION})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['data']['has_at_least_one_row'])
        access.assert_called_once_with(CONNECTION, 'CONNECTION', CONNECTION, write=True)
        run.assert_called_once_with(self.target, probe._FIXED_QUERY, 'CoreAnalytics_QueryReader_Dev')

    def test_other_database_and_non_sql_server_rejected_before_query(self):
        with patch.object(probe, 'run_isolated_preview') as run:
            with self.assertRaisesRegex(ValueError, 'QUERY_DEV_SOURCE_NOT_ALLOWED'):
                probe.run_fixed_probe(SqlServerTarget('server', 1433, 'master', 'sa', 'password'))
            with self.assertRaisesRegex(ValueError, 'QUERY_DEV_SOURCE_NOT_ALLOWED'):
                probe.run_fixed_probe(object())
        run.assert_not_called()

    def test_probe_rejects_unexpected_or_duplicate_rows(self):
        for rows in ([[True]], [[1.0]], [[1], [1]], [[2]]):
            with self.subTest(rows=rows), patch.object(probe, 'run_isolated_preview',
                    return_value={'columns': ['has_row'], 'rows': rows, 'has_more': False}):
                with self.assertRaisesRegex(ValueError, 'QUERY_DEV_PROBE_RESULT_INVALID'):
                    probe.run_fixed_probe(self.target)

    def test_csrf_rejected_before_source_access(self):
        with patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), \
             patch.object(api, '_target') as target:
            response = self.client.post('/api/studio/datasets/query-dev-probe', json={'connection_id': CONNECTION})
        self.assertEqual(response.status_code, 403)
        target.assert_not_called()

    def test_failed_child_reports_only_safe_diagnostic(self):
        env = {'STUDIO_QUERY_DEV_PROBE_ENABLED': 'true', 'STUDIO_QUERY_DEV_CONNECTION_ID': CONNECTION}
        failure = QueryPreviewFailure({'stage': 'CONNECT_OR_QUERY', 'error_type': 'ProgrammingError',
                                       'sqlstate': '42000', 'native_error': 15590})
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access'), \
             patch.object(api, '_target', return_value=self.target), patch.object(probe, 'run_fixed_probe', side_effect=failure), \
             self.assertLogs(self.client.application.logger, level='ERROR') as logs:
            response = self.client.post('/api/studio/datasets/query-dev-probe', json={'connection_id': CONNECTION})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json['code'], 'QUERY_DEV_PROBE_UNAVAILABLE')
        self.assertEqual(response.json['diagnostic'], failure.diagnostic)
        self.assertIn('15590', ' '.join(logs.output))
        self.assertNotIn('password', ' '.join(logs.output))
        self.assertNotIn(probe._FIXED_QUERY, ' '.join(logs.output))

    def test_unexpected_failure_logs_location_without_exception_text(self):
        env = {'STUDIO_QUERY_DEV_PROBE_ENABLED': 'true', 'STUDIO_QUERY_DEV_CONNECTION_ID': CONNECTION}
        with patch.dict('os.environ', env, clear=True), patch.object(api, '_principal', return_value=CONNECTION), \
             patch.object(api, '_mutating'), patch.object(api, '_require_object_access'), \
             patch.object(api, '_target', side_effect=RuntimeError('sensitive-server-password')), \
             self.assertLogs(self.client.application.logger, level='ERROR') as logs:
            response = self.client.post('/api/studio/datasets/query-dev-probe', json={'connection_id': CONNECTION})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json['diagnostic']['stage'], 'SERVER')
        self.assertEqual(response.json['diagnostic']['error_type'], 'RuntimeError')
        self.assertNotIn('sensitive-server-password', str(response.json))
        self.assertIn('stage=server type=RuntimeError', ' '.join(logs.output))
        self.assertNotIn('sensitive-server-password', ' '.join(logs.output))


if __name__ == '__main__':
    unittest.main()
