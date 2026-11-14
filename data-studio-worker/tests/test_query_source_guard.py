"""Query JDBC source remains opt-in and uses only the guarded driver."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.batch_graph import BatchError
from app.batch_sources import read_sources
from run_batch import configured_jdbc_jars

CONNECTION = '4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3'


def source():
    return {'id': 'source', 'kind': 'sqlserver_query', 'address': '10.8.0.5',
            'hostname': 'db.internal', 'port': 1433, 'database': 'BI', 'username': 'sa',
            'password': 'synthetic', 'encrypt': True, 'trust_server_certificate': False,
            'timeout': 10, 'connection_id': CONNECTION, 'execution_login': 'CoreAnalytics_QueryReader_Dev',
            'query': 'SELECT value FROM dbo.example;'}


class QuerySourceGuardTests(unittest.TestCase):
    def setUp(self):
        gate = patch('app.batch_sources.QUERY_SECURITY_REVIEW_COMPLETE', True)
        gate.start()
        self.addCleanup(gate.stop)
        self.spark = MagicMock()
        self.reader = self.spark.read.format.return_value
        self.reader.option.return_value = self.reader
        self.reader.load.return_value.columns = ['value']
        self.env = {'STUDIO_DATASET_QUERY_SQLSERVER_ENABLED': 'true',
                    'STUDIO_DATASET_QUERY_CONNECTION_ID': CONNECTION,
                    'STUDIO_DATASET_QUERY_EXECUTION_LOGIN': 'CoreAnalytics_QueryReader_Dev',
                    'STUDIO_SQL_ALLOW_PRIVATE': 'true', 'STUDIO_SQL_ALLOWED_PORTS': '1433'}

    def test_disabled_source_cannot_open_a_reader(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(BatchError, 'QUERY_SOURCE_DISABLED'):
            read_sources(self.spark, [source()], '/tmp')
        self.spark.read.format.assert_not_called()

    def test_security_review_gate_cannot_be_enabled_by_environment(self):
        with patch('app.batch_sources.QUERY_SECURITY_REVIEW_COMPLETE', False), patch.dict(os.environ, self.env, clear=True), \
             self.assertRaisesRegex(BatchError, 'QUERY_SOURCE_SECURITY_REVIEW_REQUIRED'):
            read_sources(self.spark, [source()], '/tmp')
        self.spark.read.format.assert_not_called()

    def test_only_configured_connection_and_identity_are_accepted(self):
        for change in ({'connection_id': '00000000-0000-4000-8000-000000000001'},
                       {'execution_login': 'sa'}):
            with self.subTest(change=change), patch.dict(os.environ, self.env, clear=True):
                item = {**source(), **change}
                with self.assertRaisesRegex(BatchError, 'QUERY_SOURCE_CONFIGURATION_INVALID'):
                    read_sources(self.spark, [item], '/tmp')
        self.spark.read.format.assert_not_called()

    def test_query_uses_guarded_driver_and_not_the_regular_sql_driver(self):
        with patch.dict(os.environ, self.env, clear=True):
            result = read_sources(self.spark, [source()], '/tmp')
        options = dict(call.args for call in self.reader.option.call_args_list)
        self.assertEqual(options['driver'], 'com.coreanalytics.jdbc.GuardedSqlServerDriver')
        self.assertEqual(options['coreanalyticsExecutionLogin'], 'CoreAnalytics_QueryReader_Dev')
        self.assertEqual(options['dbtable'], '(SELECT value FROM dbo.example\n) AS [ca_source]')
        self.assertEqual(result['source'].columns, ['value'])

    def test_trailing_comment_cannot_hide_the_closing_wrapper(self):
        with patch.dict(os.environ, self.env, clear=True):
            read_sources(self.spark, [{**source(), 'query': 'SELECT(1) AS value -- comment'}], '/tmp')
        options = dict(call.args for call in self.reader.option.call_args_list)
        self.assertEqual(options['dbtable'], '(SELECT(1) AS value -- comment\n) AS [ca_source]')

    def test_cte_is_rejected_before_opening_a_reader(self):
        with patch.dict(os.environ, self.env, clear=True), self.assertRaisesRegex(BatchError, 'QUERY_SOURCE_SELECT_REQUIRED'):
            read_sources(self.spark, [{**source(), 'query': 'WITH c AS (SELECT 1 AS x) SELECT x FROM c'}], '/tmp')
        self.spark.read.format.assert_not_called()

    def test_query_mode_requires_both_sql_server_and_guard_jars(self):
        with tempfile.TemporaryDirectory() as folder:
            jdbc = Path(folder) / 'sqlserver.jar'; jdbc.touch()
            guard = Path(folder) / 'guard.jar'; guard.touch()
            with self.assertRaisesRegex(BatchError, 'JDBC_DRIVER_NOT_CONFIGURED'):
                configured_jdbc_jars({'STUDIO_DATASET_QUERY_SQLSERVER_ENABLED': 'true',
                                      'STUDIO_SQLSERVER_JDBC_JAR': str(jdbc)})
            result = configured_jdbc_jars({'STUDIO_DATASET_QUERY_SQLSERVER_ENABLED': 'true',
                                           'STUDIO_SQLSERVER_JDBC_JAR': str(jdbc),
                                           'STUDIO_SQLSERVER_QUERY_GUARD_JAR': str(guard)})
            self.assertEqual(result, [str(jdbc), str(guard)])
            self.assertEqual(configured_jdbc_jars({}), [])


if __name__ == '__main__':
    unittest.main()
