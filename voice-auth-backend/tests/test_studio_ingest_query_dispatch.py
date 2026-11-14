import unittest
from unittest.mock import patch

from app.services import studio_ingest_worker as worker
from app.services import studio_batch_bindings as table_binding
from app.services import studio_sql_script_ingest_binding as query_binding
from app.services import studio_object_access
from app.routes import studio_datasets_api
from app.clients.core_api_client import core_api

USER = '11111111-1111-4111-8111-111111111111'
DATASET = '33333333-3333-4333-8333-333333333333'
RUN = '44444444-4444-4444-8444-444444444444'


class IngestQueryDispatchTests(unittest.TestCase):
    def test_query_marker_uses_only_the_guarded_binding(self):
        row = {'dataset_id': DATASET, 'access_mode': 'STORED', 'source_schema': '__coreanalytics_query__'}
        with patch.object(studio_object_access, 'require_access'), patch.object(core_api, '_post_mode', return_value={'data':[row]}), \
             patch.object(query_binding, 'bind_script_ingest', return_value={'guarded':True}) as guarded, \
             patch.object(table_binding, 'bind_stored_ingest') as normal, patch.object(studio_datasets_api, '_target'):
            result = worker.bind_source(USER, RUN, DATASET)
        self.assertEqual(result, {'guarded':True})
        guarded.assert_called_once()
        normal.assert_not_called()

    def test_regular_table_still_uses_existing_binding(self):
        row = {'dataset_id': DATASET, 'access_mode': 'STORED', 'source_schema': 'dbo'}
        with patch.object(studio_object_access, 'require_access'), patch.object(core_api, '_post_mode', return_value={'data':[row]}), \
             patch.object(table_binding, 'bind_stored_ingest', return_value={'table':True}) as normal, \
             patch.object(query_binding, 'bind_script_ingest') as guarded, patch.object(studio_datasets_api, '_target'):
            result = worker.bind_source(USER, RUN, DATASET)
        self.assertEqual(result, {'table':True})
        normal.assert_called_once()
        guarded.assert_not_called()

if __name__ == '__main__':
    unittest.main()
