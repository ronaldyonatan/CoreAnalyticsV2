import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from app.sql_script_source import stage_source
from run_batch import is_script_request, safe_script_failure

CONNECTION = '4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3'
ENV = {'STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED':'true', 'STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID':CONNECTION,
       'STUDIO_SQL_ALLOW_PRIVATE':'true', 'STUDIO_SQL_ALLOWED_PORTS':'1433'}


def source():
    return {'id':'source', 'kind':'sqlserver_script', 'address':'10.8.0.5', 'hostname':'db.internal',
            'port':1433, 'database':'BI', 'username':'sa', 'password':'synthetic', 'encrypt':True,
            'trust_server_certificate':False, 'timeout':10, 'connection_id':CONNECTION,
            'script':'SELECT 1 INTO #t; SELECT * FROM #t;'}


class ScriptSourceTests(unittest.TestCase):
    def test_disabled_or_wrong_connection_never_connects(self):
        connect = MagicMock()
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(ValueError, 'QUERY_SOURCE_DISABLED'):
                stage_source(source(), folder, connect=connect)
            with patch.dict(os.environ, ENV, clear=True), self.assertRaisesRegex(ValueError, 'QUERY_SOURCE_CONFIGURATION_INVALID'):
                stage_source({**source(), 'connection_id':'00000000-0000-4000-8000-000000000001'}, folder, connect=connect)
        connect.assert_not_called()

    def test_one_session_stages_once_and_closes(self):
        connection = MagicMock(); connect = MagicMock(return_value=connection)
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, ENV, clear=True), \
             patch('app.sql_script_source.stage_sql_script', return_value=('staged', 1)) as stage:
            result = stage_source(source(), folder, connect=connect)
        self.assertEqual(result, ('staged', 1))
        connect.assert_called_once()
        self.assertEqual(connection.timeout, 300)
        stage.assert_called_once_with(connection.cursor.return_value, source()['script'], folder, max_rows=10000000)
        connection.cursor.return_value.close.assert_called_once()
        connection.close.assert_called_once()

    def test_stage_failure_does_not_retry(self):
        connection = MagicMock(); connect = MagicMock(return_value=connection)
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, ENV, clear=True), \
             patch('app.sql_script_source.stage_sql_script', side_effect=ValueError('failure')) as stage, \
             self.assertRaisesRegex(ValueError, 'failure'):
            stage_source(source(), folder, connect=connect)
        self.assertEqual(connect.call_count, 1)
        self.assertEqual(stage.call_count, 1)
        connection.close.assert_called_once()

    def test_loopback_target_is_rejected(self):
        connect = MagicMock()
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, ENV, clear=True), \
             self.assertRaisesRegex(ValueError, 'INVALID_SQL_SOURCE'):
            stage_source({**source(), 'address':'127.0.0.1'}, folder, connect=connect)
        connect.assert_not_called()

    def test_invalid_query_timeout_is_rejected_before_connection(self):
        connect = MagicMock()
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {**ENV,'STUDIO_SQL_SCRIPT_QUERY_TIMEOUT':'-1'}, clear=True), \
             self.assertRaisesRegex(ValueError, 'QUERY_SOURCE_CONFIGURATION_INVALID'):
            stage_source(source(), folder, connect=connect)
        connect.assert_not_called()

    def test_script_failure_diagnostic_does_not_expose_driver_message(self):
        import pyodbc
        self.assertEqual(safe_script_failure(pyodbc.ProgrammingError('42S02', 'secret query (208)')), 'QUERY_SQL_OBJECT_NOT_FOUND')
        self.assertEqual(safe_script_failure(ValueError('secret query (208)')), 'BATCH_EXECUTION_FAILED')
        self.assertEqual(safe_script_failure(ValueError('QUERY_RESULT_DUPLICATE_COLUMN')), 'QUERY_RESULT_DUPLICATE_COLUMN')
        self.assertFalse(is_script_request({'sources':None}))
        self.assertTrue(is_script_request({'sources':[{'kind':'sqlserver_script'}]}))

if __name__ == '__main__':
    unittest.main()
