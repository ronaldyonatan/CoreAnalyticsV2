import json
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.connectors.sqlserver import SqlServerTarget
from app.services.studio_source_query_preview import QueryPreviewFailure, run_isolated_preview


class IsolatedPreviewTests(unittest.TestCase):
    def setUp(self):
        self.target = SqlServerTarget('server', 1433, 'BI', 'sa', 'do-not-log')

    def test_passes_secrets_only_on_stdin_to_isolated_process(self):
        output = json.dumps({'success': True, 'data': {'columns': ['x'], 'rows': [[1]], 'has_more': False}}).encode()
        with patch('app.services.studio_source_query_preview.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=output)) as run:
            result = run_isolated_preview(self.target, 'SELECT 1 AS x', 'coreanalytics_reader')
        self.assertEqual(result['rows'], [[1]])
        args, kwargs = run.call_args
        self.assertNotIn('do-not-log', repr(args))
        self.assertNotIn('SELECT 1 AS x', repr(args))
        self.assertEqual(json.loads(kwargs['input'])['target']['password'], 'do-not-log')
        self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)
        self.assertEqual(kwargs['timeout'], 40)

    def test_child_error_does_not_expose_sensitive_error(self):
        output = b'{"success":false,"code":"database password secret"}'
        with patch('app.services.studio_source_query_preview.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=output)):
            with self.assertRaisesRegex(ValueError, '^QUERY_PREVIEW_UNAVAILABLE$'):
                run_isolated_preview(self.target, 'SELECT 1', 'coreanalytics_reader')

    def test_child_diagnostic_is_restricted_to_known_safe_values(self):
        response = {'success': False, 'diagnostic': {'stage': 'password', 'error_type': 'secret',
                    'sqlstate': '42000', 'native_error': 15590}}
        with patch('app.services.studio_source_query_preview.subprocess.run',
                   return_value=SimpleNamespace(returncode=0, stdout=json.dumps(response).encode())):
            with self.assertRaises(QueryPreviewFailure) as error:
                run_isolated_preview(self.target, 'SELECT 1', 'coreanalytics_reader')
        self.assertEqual(error.exception.diagnostic,
                         {'stage': 'UNKNOWN', 'error_type': 'OTHER', 'sqlstate': '42000', 'native_error': 15590})

    def test_timeout_fails_closed(self):
        with patch('app.services.studio_source_query_preview.subprocess.run', side_effect=subprocess.TimeoutExpired('child', 40)):
            with self.assertRaisesRegex(ValueError, '^QUERY_PREVIEW_UNAVAILABLE$'):
                run_isolated_preview(self.target, 'SELECT 1', 'coreanalytics_reader')

    def test_malformed_child_result_fails_closed(self):
        for data in (
            {'columns': ['x'], 'rows': [[1, 2]], 'has_more': False},
            {'columns': ['x', 'x'], 'rows': [], 'has_more': False},
            {'columns': ['x'], 'rows': [['x' * 257]], 'has_more': False},
            {'columns': ['x'], 'rows': [[float('nan')]], 'has_more': False},
        ):
            with self.subTest(data=data), patch('app.services.studio_source_query_preview.subprocess.run',
                    return_value=SimpleNamespace(returncode=0, stdout=json.dumps({'success': True, 'data': data}).encode())):
                with self.assertRaisesRegex(ValueError, '^QUERY_PREVIEW_UNAVAILABLE$'):
                    run_isolated_preview(self.target, 'SELECT 1', 'coreanalytics_reader')


if __name__ == '__main__':
    unittest.main()
