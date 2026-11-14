import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch,Mock
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.services import studio_batch_bindings as batch
from app.connectors.sqlserver import SqlServerTarget
from app.connectors.sqlserver_adapter import bind_source as bind_sqlserver_source


def graph():
    identifier='00000000-0000-4000-8000-000000000001'
    return {'sources':[{'id':'input','kind':'dataset','dataset_id':identifier}],'nodes':[],'outputs':[{'id':'out','name':'Full dataset','input':{'node':'input','port':'main'}}]}


class BatchBindingsTests(unittest.TestCase):
    def test_query_sources_are_rejected_before_resolving_credentials(self):
        request = graph()
        identifier = request['sources'][0]['dataset_id']
        for marker in ({'source_type': 'QUERY'}, {'source_kind': 'query'}, {'source_schema': '__coreanalytics_query__'},
                       {'source_query': 'SELECT 1'}, {'query_sql': 'SELECT 1'}, {'query_text': ''}):
            for mode, function, error in (('DIRECT', batch.bind_run, 'BATCH_QUERY_SOURCE_NOT_READY'),
                                           ('STORED', batch.bind_stored_ingest, 'INGEST_QUERY_SOURCE_NOT_READY')):
                with self.subTest(marker=marker, mode=mode):
                    resolver = Mock()
                    metadata = {identifier: {'access_mode': mode, 'connection_id': 'connection', **marker}}
                    with self.assertRaisesRegex(ValueError, error):
                        function('user', str(uuid.uuid4()), request, metadata, resolver)
                    resolver.assert_not_called()

    def test_authorization_precedes_all_secret_resolution(self):
        request=graph();resolver=Mock()
        with self.assertRaises(PermissionError):batch.bind_run('user',str(uuid.uuid4()),request,{},resolver)
        resolver.assert_not_called()
        request['nodes']=[{'id':'script','inputs':[{'node':'input','port':'main'}],'steps':[{'type':'script'}]}];request['outputs'][0]['input']['node']='script'
        with self.assertRaisesRegex(ValueError,'BATCH_UNSUPPORTED_COMPONENT'):batch.bind_run('user',str(uuid.uuid4()),request,{},resolver)
        resolver.assert_not_called()

    def test_bound_sources_use_policy_pinned_ip_and_do_not_modify_saved_graph(self):
        request=graph();identifier=request['sources'][0]['dataset_id'];metadata={identifier:{'access_mode':'DIRECT','connection_id':'connection','source_schema':'dbo','source_name':'Sales'}}
        target=SqlServerTarget('approved.internal',1433,'Analytics','reader','synthetic-password')
        connector = SimpleNamespace(validate_target=lambda _: ('approved.internal', '10.8.0.5'), bind_source=bind_sqlserver_source)
        with patch.object(batch,'resolve',return_value=connector):
            bound=batch.bind_run('user',str(uuid.uuid4()),request,metadata,lambda owner,connection:target)
        self.assertEqual(bound['sources'][0]['address'],'10.8.0.5');self.assertEqual(bound['sources'][0]['table'],'Sales');self.assertEqual(bound['sources'][0]['password'],'synthetic-password')
        self.assertNotIn('password',str(request));self.assertEqual(request['sources'][0]['kind'],'dataset')
