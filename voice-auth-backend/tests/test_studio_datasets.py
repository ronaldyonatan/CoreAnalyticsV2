"""Dataset API contract tests; never contact BEAM or SQL Server."""
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from flask import Flask
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routes import studio_datasets_api as api
from app.connectors import sqlserver

CONNECTION = '00000000-0000-4000-8000-000000000001'
SOURCE = {'schema': 'dbo', 'name': 'Revenue', 'type': 'VIEW'}

class DatasetApiTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        self.client = app.test_client()
        access = patch.object(api, '_require_object_access', return_value='OWNER')
        self.access = access.start()
        self.addCleanup(access.stop)
        self.body = {'connection_id': CONNECTION, 'dataset_name': 'Revenue', 'description': '', 'source_schema': 'dbo', 'source_name': 'Revenue', 'source_type': 'VIEW', 'access_mode': 'DIRECT'}

    def test_authorization_denied_before_source_access(self):
        with patch.object(api, '_principal', side_effect=PermissionError('AUTH_REQUIRED')), patch.object(api, '_target') as target:
            self.assertEqual(self.client.get('/api/studio/datasets/sources/' + CONNECTION).status_code, 401)
            target.assert_not_called()

    def test_spark_preview_requires_csrf_before_source_access(self):
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), patch.object(api, '_target') as target:
            response = self.client.post('/api/studio/datasets/' + CONNECTION + '/spark-preview', json={'filters': {}, 'steps': []})
            self.assertEqual(response.status_code, 403)
            target.assert_not_called()

    def test_fixed_spark_preview_checks_csrf_and_forwards_bounded_data(self):
        body = {'columns': ['code'], 'rows': [['A']], 'steps': []}
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), patch('app.services.studio_spark_preview.spark_preview') as worker:
            response = self.client.post('/api/studio/datasets/fixed-spark-preview', json=body)
            self.assertEqual(response.status_code, 403)
            worker.assert_not_called()
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch('app.services.studio_spark_preview.spark_preview', return_value={'columns': ['code'], 'rows': [['A']]}) as worker:
            response = self.client.post('/api/studio/datasets/fixed-spark-preview', json=body)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['data']['rows'], [['A']])
            worker.assert_called_once_with({'preview_columns': [{'name': 'code'}], 'rows': [['A']]}, [])

    def test_spark_preview_reads_only_authorized_dataset(self):
        dataset = {'dataset_id': CONNECTION, 'connection_id': CONNECTION, 'source_schema': 'dbo', 'source_name': 'Revenue', 'source_type': 'VIEW', 'access_mode': 'DIRECT'}
        sample = {'preview_columns': [{'name': 'a'}], 'rows': [['x']], 'has_more': True}
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode', return_value={'data': [dataset]}), patch.object(api, '_target', return_value='source'), patch.object(api, 'preview_sqlserver_object', return_value=sample), patch('app.services.studio_spark_preview.spark_preview', return_value={'columns': ['a'], 'rows': [['x']]}) as worker:
            response = self.client.post('/api/studio/datasets/' + CONNECTION + '/spark-preview', json={'filters': {}, 'steps': []})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json['data']['has_more'])
            worker.assert_called_once_with(sample, [])

    def test_fixed_spark_rejects_invalid_input_before_worker(self):
        for columns, rows in (([], []), (['Nama', 'nama'], [['A', 'B']]), ([{}], [['A']]), (['Nama'], [['A', 'B']]), (['Nama'], [[123]])):
            with self.subTest(columns=columns, rows=rows), patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch('app.services.studio_spark_preview.spark_preview') as worker:
                response = self.client.post('/api/studio/datasets/fixed-spark-preview', json={'columns': columns, 'rows': rows, 'steps': []})
                self.assertEqual(response.status_code, 400)
                worker.assert_not_called()
    def test_search_is_parameterized_and_has_more_is_bounded(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchmany.return_value = [('dbo', 'a', 'VIEW'), ('dbo', 'b', 'BASE TABLE')]
        target = MagicMock(timeout=10)
        with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
            result = sqlserver.list_sqlserver_objects(target, 'a%_[', 100, 1)
        self.assertEqual(result['items'], [{'schema': 'dbo', 'name': 'a', 'type': 'VIEW'}])
        self.assertTrue(result['has_more'])
        args = cursor.execute.call_args.args
        self.assertIn("o.type IN ('U', 'V')", args[0])
        self.assertIn('o.is_ms_shipped = 0', args[0])
        self.assertIn("s.name NOT IN ('sys', 'INFORMATION_SCHEMA')", args[0])
        self.assertNotIn('a%_[', args[0])
        self.assertEqual(args[1], r'%a\%\_\[%')
        self.assertEqual(args[-2:], (100, 2))
        connection.close.assert_called_once()

    def test_selected_source_validation_uses_same_user_object_filter(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = (1,)
        with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
            self.assertTrue(sqlserver.sqlserver_object_exists(MagicMock(timeout=10), SOURCE))
        args = cursor.execute.call_args.args
        self.assertIn('o.is_ms_shipped = 0', args[0])
        self.assertIn("s.name NOT IN ('sys', 'INFORMATION_SCHEMA')", args[0])
        self.assertEqual(args[1:], ('dbo', 'Revenue', 'VIEW'))

    def test_invalid_page_is_rejected_before_connecting(self):
        with patch.object(sqlserver, 'open_readonly_connection') as connect:
            with self.assertRaises(ValueError):
                sqlserver.list_sqlserver_objects(MagicMock(), limit=101)
            connect.assert_not_called()

    def test_empty_dataset_catalog_is_not_an_error(self):
        with patch.object(api, '_principal', return_value='user'), patch.object(api.core_api, '_post_mode', return_value={'data': [{'success': True, 'code': 'DATASET_LIST_EMPTY'}]}):
            response = self.client.get('/api/studio/datasets')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['data'], [])

    def test_missing_beam_metadata_has_actionable_error(self):
        with patch.object(api, '_principal', return_value='user'), patch.object(api.core_api, '_post_mode', return_value={'code': 200, 'data': None, 'result': 'success'}), patch.object(api, 'list_sqlserver_objects') as discover:
            response = self.client.get('/api/studio/datasets/sources/' + CONNECTION)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json['code'], 'DATASET_CONNECTION_METADATA_UNAVAILABLE')
            discover.assert_not_called()

    def test_direct_save_checks_source_and_creates_definition(self):
        with patch('app.services.studio_object_access.require_access', return_value='OWNER'), patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api, '_target', return_value='source'), patch.object(api, 'sqlserver_object_exists', return_value=True), patch.object(api.core_api, '_post_mode', return_value={'data': [{'success': True, 'code': 'DATASET_CREATED'}]}) as call:
            response = self.client.post('/api/studio/datasets', json=self.body)
            self.assertEqual(response.status_code, 201)
            self.assertEqual(call.call_args.args[1]['SourceName'], 'Revenue')

    def test_store_is_not_falsely_reported_as_created(self):
        self.body['access_mode'] = 'STORED'
        with patch('app.services.studio_object_access.require_access', return_value='OWNER'), \
             patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), \
             patch.object(api, '_target', return_value='source'), \
             patch.object(api, 'sqlserver_object_exists', return_value=True), \
             patch.object(api.core_api, '_post_mode', return_value={'data': []}) as post:
            response = self.client.post('/api/studio/datasets', json=self.body)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json['code'], 'DATASET_CREATE_FAILED')
            self.assertEqual(post.call_args.args[0], 'CoreStudioStoredDatasetCreate')

    def test_preview_access_denial_blocks_source_connection(self):
        self.access.side_effect = api.AccessError('OBJECT_ACCESS_DENIED', 403)
        dataset = {'dataset_id': CONNECTION, 'connection_id': CONNECTION, 'source_schema': 'dbo',
                   'source_name': 'Revenue', 'source_type': 'VIEW', 'access_mode': 'DIRECT'}
        with patch.object(api, '_principal', return_value='user'), \
             patch.object(api.core_api, '_post_mode', return_value={'data': [dataset]}), \
             patch.object(api, '_target') as target:
            response = self.client.get('/api/studio/datasets/' + CONNECTION + '/preview')
        self.assertEqual(response.status_code, 403)
        target.assert_not_called()

    def test_injected_or_missing_source_is_rejected(self):
        self.body['source_name'] = 'Revenue]; DROP TABLE x;--'
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), patch.object(api, '_target', return_value='source'), patch.object(api, 'sqlserver_object_exists', return_value=False), patch.object(api.core_api, '_post_mode') as call:
            self.assertEqual(self.client.post('/api/studio/datasets', json=self.body).status_code, 400)
            call.assert_not_called()

    def test_csrf_failure_denies_create(self):
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), patch.object(api, '_target') as target:
            self.assertEqual(self.client.post('/api/studio/datasets', json=self.body).status_code, 403)
            target.assert_not_called()

    def test_preview_is_scoped_to_existing_authorized_dataset(self):
        dataset = {'dataset_id': CONNECTION, 'connection_id': CONNECTION, 'source_schema': 'dbo', 'source_name': 'Revenue', 'source_type': 'VIEW', 'access_mode': 'DIRECT'}
        with patch.object(api, '_principal', return_value='user'), patch.object(api.core_api, '_post_mode', return_value={'data': [dataset]}), patch.object(api, '_target', return_value='source'), patch.object(api, 'preview_sqlserver_object', return_value={'columns': [], 'rows': []}) as preview:
            response = self.client.get('/api/studio/datasets/' + CONNECTION + '/preview?source_name=ignored')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(preview.call_args.args[1], SOURCE)

    def test_preview_denies_missing_dataset_before_connecting(self):
        with patch.object(api, '_principal', return_value='user'), patch.object(api.core_api, '_post_mode', return_value={'data': []}), patch.object(api, '_target') as target:
            self.assertEqual(self.client.get('/api/studio/datasets/' + CONNECTION + '/preview').status_code, 404)
            target.assert_not_called()

    def test_preview_bounds_rows_columns_and_quotes_identifiers(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = (123,)
        cursor.fetchmany.side_effect = [[('safe]name', 'nvarchar'), ('image', 'varbinary')], [('primary]key',)], [('sample',)] * 51]
        with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
            result = sqlserver.preview_sqlserver_object(MagicMock(timeout=10), {'schema': 'dbo', 'name': 'Revenue', 'type': 'VIEW'}, 3)
        self.assertEqual(len(result['rows']), 50)
        self.assertTrue(result['has_more'])
        self.assertEqual(result['omitted_columns'], 1)
        sql = cursor.execute.call_args_list[-1].args[0]
        self.assertIn('OFFSET ? ROWS FETCH NEXT ? ROWS ONLY', sql)
        self.assertIn('[safe]]name]', sql)
        self.assertIn('ORDER BY [primary]]key]', sql)
        self.assertNotIn('[image]', sql)
        self.assertIn('256)', sql)
        self.assertEqual(cursor.execute.call_args.args[1:], (100, 51))
        self.assertTrue(result['stable_order'])
        connection.close.assert_called_once()

    def test_preview_without_unique_key_reports_unstable_order(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = (123,)
        cursor.fetchmany.side_effect = [[('Revenue', 'int')], [], [(1,)]]
        with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
            result = sqlserver.preview_sqlserver_object(MagicMock(timeout=10), SOURCE)
        self.assertFalse(result['stable_order'])
        self.assertIn('ORDER BY [Revenue]', cursor.execute.call_args.args[0])

    def test_sort_precedes_pagination_and_uses_unique_tiebreaker(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = (123,)
        cursor.fetchmany.side_effect = [[('Revenue', 'int'), ('ID', 'int')], [('ID',)], []]
        with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
            sqlserver.preview_sqlserver_object(MagicMock(timeout=10), SOURCE, 2, {}, {'column': 'Revenue', 'direction': 'desc'})
        args = cursor.execute.call_args.args
        self.assertIn('ORDER BY [Revenue] DESC, [ID] OFFSET', args[0])
        self.assertEqual(args[1:], (50, 51))

    def test_sort_rejects_unlisted_column_and_direction(self):
        for sort in ({'column': 'Revenue]; DROP TABLE x;--', 'direction': 'asc'}, {'column': 'Revenue', 'direction': 'asc; DROP TABLE x'}):
            connection = MagicMock()
            cursor = connection.cursor.return_value
            cursor.fetchone.return_value = (123,)
            cursor.fetchmany.return_value = [('Revenue', 'int')]
            with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
                with self.assertRaisesRegex(ValueError, 'DATASET_SORT_INVALID'):
                    sqlserver.preview_sqlserver_object(MagicMock(timeout=10), SOURCE, 1, {}, sort)

    def test_preview_invalid_page_rejected_before_connecting(self):
        with patch.object(sqlserver, 'open_readonly_connection') as connect:
            with self.assertRaises(ValueError):
                sqlserver.preview_sqlserver_object(MagicMock(), SOURCE, 0)
            connect.assert_not_called()

    def test_preview_filters_are_validated_and_parameterized(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = (123,)
        cursor.fetchmany.side_effect = [[('Name', 'nvarchar')], [('Name',)], []]
        with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
            sqlserver.preview_sqlserver_object(MagicMock(timeout=10), SOURCE, 2, {'Name': {'mode': 'include', 'values': ["x%' OR 1=1--"]}})
        args = cursor.execute.call_args.args
        self.assertIn('[Name]', args[0])
        self.assertNotIn('OR 1=1', args[0])
        self.assertEqual(args[1], "x%' OR 1=1--")
        self.assertEqual(args[-2:], (50, 51))

    def test_preview_rejects_unknown_filter_column(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = (123,)
        cursor.fetchmany.return_value = [('Name', 'nvarchar')]
        with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
            with self.assertRaisesRegex(ValueError, 'DATASET_FILTER_INVALID'):
                sqlserver.preview_sqlserver_object(MagicMock(timeout=10), SOURCE, 1, {'unknown': {'mode': 'include', 'values': ['value']}})

    def test_filter_null_include_and_exclude_semantics(self):
        columns = [{'name': 'Name', 'type': 'nvarchar'}]
        sql, params = sqlserver._filter_sql({'Name': {'mode': 'include', 'values': ['A', None]}}, columns)
        self.assertIn(' IS NULL', sql[0])
        self.assertEqual(params, ['A'])
        sql, params = sqlserver._filter_sql({'Name': {'mode': 'exclude', 'values': ['A']}}, columns)
        self.assertIn(' IS NULL', sql[0])
        self.assertIn('NOT IN', sql[0])
        self.assertEqual(params, ['A'])
        sql, _ = sqlserver._filter_sql({'Name': {'mode': 'exclude', 'values': [None]}}, columns)
        self.assertIn('IS NOT NULL', sql[0])

    def test_filter_values_are_bounded_and_search_is_parameterized(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = (123,)
        cursor.fetchmany.side_effect = [[('Name', 'nvarchar')], [(None,), ('A',)]]
        with patch.object(sqlserver, 'open_readonly_connection', return_value=connection):
            result = sqlserver.dataset_filter_values(MagicMock(timeout=10), SOURCE, 'Name', '%_', 0, {})
        self.assertEqual(result['values'], [None, 'A'])
        args = cursor.execute.call_args.args
        self.assertNotIn('%_', args[0])
        self.assertEqual(args[1], r'%\%\_%')
        self.assertEqual(args[-2:], (0, 51))

    def test_filtered_preview_requires_csrf(self):
        dataset = {'dataset_id': CONNECTION, 'connection_id': CONNECTION, 'source_schema': 'dbo', 'source_name': 'Revenue', 'source_type': 'VIEW', 'access_mode': 'DIRECT'}
        with patch.object(api, '_principal', return_value='user'), patch.object(api.core_api, '_post_mode', return_value={'data': [dataset]}), patch.object(api, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), patch.object(api, '_target') as target:
            response = self.client.post('/api/studio/datasets/' + CONNECTION + '/preview', json={'page': 1, 'filters': {'Name': 'a'}})
            self.assertEqual(response.status_code, 403)
            target.assert_not_called()

if __name__ == '__main__': unittest.main()
