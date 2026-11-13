import unittest
from unittest.mock import MagicMock, patch

from flask import Flask
from app.connectors.postgresql_adapter import PostgreSQLTarget
from app.routes import studio_charts_api as api
from app.services import studio_chart_postgresql as service
from app.services.studio_chart_query import ChartQueryError


class PostgresChartTests(unittest.TestCase):
    def setUp(self):
        self.target = PostgreSQLTarget('db.example', 5432, 'db', 'user', 'password')
        self.spec = {'dataset_id': 'id', 'dataset_kind': 'DIRECT', 'dimension': 'branch_name',
                     'measure': '', 'series': '', 'aggregation': 'count', 'chart_type': 'filter_dropdown',
                     'filters': [], 'sort': 'dimension_asc', 'limit': 1}
        self.source = {'schema': 'public', 'name': 'bank', 'type': 'VIEW'}

    def test_query_uses_postgresql_target(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_charts_bp)
        row = {'connection_id': 'connection', 'dataset_id': 'id', 'source_schema': 'public', 'source_name': 'bank', 'source_type': 'VIEW'}
        with patch.object(api, '_principal', return_value='user'), patch.object(api, '_mutating'), \
             patch.object(api, 'validate_spec', return_value=(self.spec, row)), patch.object(api, '_target', return_value=self.target), \
             patch.object(service, 'execute_postgresql_chart', return_value={'rows': []}) as pg, \
             patch.object(api, 'execute_direct_chart') as sqlserver:
            response = app.test_client().post('/api/studio/charts/query', json=self.spec)
        self.assertEqual(response.status_code, 200)
        pg.assert_called_once_with(self.target, self.source, self.spec)
        sqlserver.assert_not_called()

    def test_query_groups_source_rows_and_reports_truncation(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = [('A', None, 4), ('B', None, 2)]
        fields = [{'name': 'branch_name', 'type': 'character varying(100)'}]
        with patch.object(service, '_connect', return_value=connection), patch.object(service, '_object_metadata', return_value=(1, fields, fields)):
            result = service.execute_postgresql_chart(self.target, self.source, self.spec)
        statement, params = cursor.execute.call_args.args
        self.assertIn('GROUP BY left("branch_name"::text, 256)', statement.as_string())
        self.assertEqual(params, [2])
        self.assertEqual(result['rows'], [{'dimension': 'A', 'series': None, 'value': 4.0}])
        self.assertTrue(result['truncated'])

    def test_query_rejects_unknown_column_before_execution(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        with patch.object(service, '_connect', return_value=connection), patch.object(service, '_object_metadata', return_value=(1, [], [])):
            with self.assertRaisesRegex(ChartQueryError, 'CHART_COLUMN_NOT_FOUND'):
                service.execute_postgresql_chart(self.target, self.source, self.spec)
        cursor.execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
