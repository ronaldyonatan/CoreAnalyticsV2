import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.connectors.sqlserver import SqlServerTarget
from app.services import studio_query_ingest_binding as binding

USER = '11111111-1111-4111-8111-111111111111'
CONNECTION = '22222222-2222-4222-8222-222222222222'
DATASET = '33333333-3333-4333-8333-333333333333'
RUN = '44444444-4444-4444-8444-444444444444'
GRAPH = {'sources': [{'id': 'source', 'kind': 'dataset', 'dataset_id': DATASET}],
         'nodes': [], 'outputs': [{'id': 'output', 'name': 'Dataset', 'input': {'node': 'source', 'port': 'main'}}]}
METADATA = {DATASET: {'access_mode': 'STORED', 'source_schema': '__coreanalytics_query__',
                      'source_name': DATASET, 'connection_id': CONNECTION}}
DEFINITION = {'dataset_id': DATASET, 'connection_id': CONNECTION, 'dialect': 'sqlserver', 'query': 'SELECT 1 AS x'}
ENV = {'STUDIO_DATASET_QUERY_SQLSERVER_ENABLED': 'true', 'STUDIO_DATASET_QUERY_CONNECTION_ID': CONNECTION,
       'STUDIO_DATASET_QUERY_EXECUTION_LOGIN': 'coreanalytics_reader',
       'STUDIO_SQLSERVER_QUERY_GUARD_JAR': '/worker/guard.jar', 'STUDIO_SQLSERVER_JDBC_JAR': '/worker/sqlserver.jar'}


class QueryIngestBindingTests(unittest.TestCase):
    def setUp(self):
        gate = patch('app.services.studio_dataset_query_feature.QUERY_SECURITY_REVIEW_COMPLETE', True)
        gate.start()
        self.addCleanup(gate.stop)

    def test_review_gate_blocks_before_reading_definition(self):
        with patch('app.services.studio_dataset_query_feature.QUERY_SECURITY_REVIEW_COMPLETE', False), \
             patch.dict(os.environ, ENV, clear=True), patch.object(binding, 'read_definition') as read:
            with self.assertRaisesRegex(ValueError, 'DATASET_QUERY_SECURITY_REVIEW_REQUIRED'):
                binding.bind_query_ingest(USER, RUN, GRAPH, METADATA, MagicMock())
        read.assert_not_called()

    def test_disabled_never_resolves_credentials_or_metadata(self):
        resolver = MagicMock()
        with patch.dict(os.environ, {}, clear=True), patch.object(binding, 'read_definition') as read:
            with self.assertRaisesRegex(ValueError, 'QUERY_INGEST_DISABLED'):
                binding.bind_query_ingest(USER, RUN, GRAPH, METADATA, resolver)
        read.assert_not_called(); resolver.assert_not_called()

    def test_access_denial_happens_before_definition_and_credentials(self):
        resolver = MagicMock()
        with patch.dict(os.environ, ENV, clear=True), patch.object(binding, 'require_access', side_effect=PermissionError('denied')), \
             patch.object(binding, 'read_definition') as read:
            with self.assertRaises(PermissionError):
                binding.bind_query_ingest(USER, RUN, GRAPH, METADATA, resolver)
        read.assert_not_called(); resolver.assert_not_called()

    def test_definition_connection_mismatch_does_not_resolve_credentials(self):
        resolver = MagicMock()
        definition = {**DEFINITION, 'connection_id': DATASET}
        with patch.dict(os.environ, ENV, clear=True), patch.object(binding, 'require_access'), \
             patch.object(binding, 'read_definition', return_value=definition):
            with self.assertRaisesRegex(ValueError, 'QUERY_INGEST_DEFINITION_MISMATCH'):
                binding.bind_query_ingest(USER, RUN, GRAPH, METADATA, resolver)
        resolver.assert_not_called()

    def test_valid_binding_uses_trusted_configuration_without_changing_graph(self):
        target = SqlServerTarget('host', 1433, 'BI', 'sa', 'synthetic')
        connector = SimpleNamespace(validate_target=lambda _: ('host', '10.0.0.1'),
            bind_source=lambda source, metadata, target, validate: {'id': source['id'], 'kind': 'sqlserver',
                'schema': metadata['source_schema'], 'table': metadata['source_name'], 'password': target.password})
        with patch.dict(os.environ, ENV, clear=True), patch.object(binding, 'require_access') as access, \
             patch.object(binding, 'read_definition', return_value=DEFINITION), patch.object(binding, 'resolve', return_value=connector):
            request = binding.bind_query_ingest(USER, RUN, GRAPH, METADATA, lambda *_: target)
        access.assert_called_once_with(USER, 'DATASET', DATASET, 'execute')
        self.assertEqual(request['sources'][0]['kind'], 'sqlserver_query')
        self.assertEqual(request['sources'][0]['execution_login'], 'coreanalytics_reader')
        self.assertEqual(request['sources'][0]['query'], 'SELECT 1 AS x')
        self.assertNotIn('schema', request['sources'][0])
        self.assertNotIn('synthetic', str(GRAPH))

    def test_cte_is_rejected_before_credentials(self):
        resolver = MagicMock()
        definition = {**DEFINITION, 'query': 'WITH t AS (SELECT 1 AS x) SELECT x FROM t'}
        with patch.dict(os.environ, ENV, clear=True), patch.object(binding, 'require_access'), \
             patch.object(binding, 'read_definition', return_value=definition):
            with self.assertRaisesRegex(ValueError, 'QUERY_INGEST_SELECT_REQUIRED'):
                binding.bind_query_ingest(USER, RUN, GRAPH, METADATA, resolver)
        resolver.assert_not_called()

    def test_query_semicolon_before_comment_is_removed_for_spark(self):
        from app.services.studio_source_query_validation import sqlserver_derived_table_query
        self.assertEqual(sqlserver_derived_table_query("SELECT ';' AS x; -- comment"),
                         "SELECT ';' AS x -- comment")
        self.assertEqual(sqlserver_derived_table_query("SELECT ';' AS x"), "SELECT ';' AS x")


if __name__ == '__main__':
    unittest.main()
