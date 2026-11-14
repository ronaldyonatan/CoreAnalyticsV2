import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.connectors.sqlserver import SqlServerTarget
from app.services import studio_sql_script_ingest_binding as binding

USER='11111111-1111-4111-8111-111111111111'
CONNECTION='22222222-2222-4222-8222-222222222222'
DATASET='33333333-3333-4333-8333-333333333333'
RUN='44444444-4444-4444-8444-444444444444'
GRAPH={'sources':[{'id':'source','kind':'dataset','dataset_id':DATASET}], 'nodes':[],
       'outputs':[{'id':'output','name':'Dataset','input':{'node':'source','port':'main'}}]}
META={DATASET:{'access_mode':'STORED','source_schema':'__coreanalytics_query__','source_name':DATASET,'connection_id':CONNECTION}}
SCRIPT='SELECT 1 INTO #t; SELECT * FROM #t;'
DEFINITION={'dataset_id':DATASET,'connection_id':CONNECTION,'dialect':'sqlserver','query':SCRIPT}
ENV={'STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED':'true','STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID':CONNECTION}


class SqlScriptIngestBindingTests(unittest.TestCase):
    def test_disabled_does_not_read_metadata_or_credentials(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(binding, 'read_script_definition') as read:
            resolver=MagicMock()
            with self.assertRaisesRegex(ValueError, 'QUERY_INGEST_DISABLED'):
                binding.bind_script_ingest(USER,RUN,GRAPH,META,resolver)
        read.assert_not_called(); resolver.assert_not_called()

    def test_access_denied_before_sql_or_credentials(self):
        with patch.dict(os.environ, ENV, clear=True), patch.object(binding, 'require_access', side_effect=PermissionError()), \
             patch.object(binding, 'read_script_definition') as read:
            resolver=MagicMock()
            with self.assertRaises(PermissionError): binding.bind_script_ingest(USER,RUN,GRAPH,META,resolver)
        read.assert_not_called(); resolver.assert_not_called()

    def test_valid_binding_passes_original_script_and_connection_credentials_privately(self):
        target=SqlServerTarget('host',1433,'BI','sa','synthetic')
        connector=SimpleNamespace(validate_target=lambda _:('host','10.0.0.1'), bind_source=lambda source,row,target,validate:{
            'id':source['id'],'kind':'sqlserver','schema':row['source_schema'],'table':row['source_name'],'password':target.password})
        with patch.dict(os.environ, ENV, clear=True), patch.object(binding, 'require_access') as access, \
             patch.object(binding, 'read_script_definition', return_value=DEFINITION), patch.object(binding, 'resolve', return_value=connector):
            result=binding.bind_script_ingest(USER,RUN,GRAPH,META,lambda *_:target)
        access.assert_called_once_with(USER,'DATASET',DATASET,'execute')
        self.assertEqual(result['sources'][0]['kind'],'sqlserver_script')
        self.assertEqual(result['sources'][0]['script'],SCRIPT)
        self.assertEqual(result['sources'][0]['connection_id'],CONNECTION)
        self.assertNotIn('schema', result['sources'][0])

if __name__ == '__main__': unittest.main()
