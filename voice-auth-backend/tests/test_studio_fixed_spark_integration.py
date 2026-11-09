"""Opt-in API → subprocess → real Spark test; no SQL Server or real login."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routes import studio_datasets_api as api


@unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SPARK') == '1', 'Set STUDIO_TEST_REAL_SPARK=1 for real Spark')
class FixedSparkIntegrationTest(unittest.TestCase):
    @unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SCRIPT') == '1', 'Set STUDIO_TEST_REAL_SCRIPT=1 for container scripting')
    def test_python_r_graph_and_logs_through_api(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        schema = [{'name': 'Name', 'kind': 'Text'}, {'name': 'Total', 'kind': 'Floating Decimal'}]
        body = {
            'sources': [{'id': 'input', 'kind': 'fixed', 'columns': ['Name', 'Price', 'Qty'], 'rows': [['Andi', '10', '2'], ['Budi', '7.5', '4']]}],
            'nodes': [
                {'id': 'python', 'inputs': [{'node': 'input', 'port': 'main'}], 'steps': [{'type': 'script', 'language': 'python', 'code': 'output = df[["Name"]].copy()\noutput["Total"] = pd.to_numeric(df["Price"]) * pd.to_numeric(df["Qty"])\nprint("python done")', 'outputs': schema}]},
                {'id': 'r', 'inputs': [{'node': 'python', 'port': 'main'}], 'steps': [{'type': 'script', 'language': 'r', 'code': 'output <- df\noutput$Category <- ifelse(as.numeric(output$Total) >= 25, "High", "Standard")\ncat("r done")', 'outputs': schema + [{'name': 'Category', 'kind': 'Text'}]}]},
            ],
            'outputs': [{'id': 'output', 'name': 'Python & R', 'input': {'node': 'r', 'port': 'main'}}],
        }
        with patch.object(api, '_principal', return_value='fixture-user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode', side_effect=AssertionError('No database access')):
            response = app.test_client().post('/api/studio/datasets/graph-spark-preview', json=body)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['data']['rows'], [['Andi', '20.0', 'Standard'], ['Budi', '30.0', 'High']])
        self.assertEqual([entry['language'] for entry in response.json['data']['script_logs']], ['python', 'r'])

    @unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SCRIPT') == '1', 'Set STUDIO_TEST_REAL_SCRIPT=1 for container scripting')
    def test_script_schema_error_keeps_diagnostic_through_api(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        body = {'columns': ['Name'], 'rows': [['Andi']], 'steps': [{'type': 'script', 'language': 'python', 'code': 'output = df.copy()', 'outputs': [{'name': 'Other', 'kind': 'Text'}]}]}
        with patch.object(api, '_principal', return_value='fixture-user'), patch.object(api, '_mutating'):
            response = app.test_client().post('/api/studio/datasets/fixed-spark-preview', json=body)
        self.assertEqual(response.status_code, 400, response.json)
        self.assertEqual(response.json['code'], 'SCRIPT_SCHEMA_MISMATCH')
        self.assertIn('Kolom', response.json['detail'])

    def test_multi_input_graph_returns_three_split_join_outputs(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        body = {
            'sources': [
                {'id': 'left', 'kind': 'fixed', 'columns': ['id', 'name'], 'rows': [['1', 'Andi'], ['2', 'Budi']]},
                {'id': 'right', 'kind': 'fixed', 'columns': ['id', 'city'], 'rows': [['1', 'Jakarta'], ['3', 'Bandung']]},
            ],
            'nodes': [{'id': 'join', 'inputs': [{'node': 'left', 'port': 'main'}, {'node': 'right', 'port': 'main'}], 'steps': [{'type': 'split_join', 'join': 'Inner', 'keys': [{'left': 'id', 'right': 'id'}], 'prefix': 'right_', 'key_kind': 'Text', 'nulls': False}]}],
            'outputs': [{'id': f'output-{port}', 'name': port, 'input': {'node': 'join', 'port': port}} for port in ('matched', 'left_only', 'right_only')],
        }
        with patch.object(api, '_principal', return_value='fixture-user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode', side_effect=AssertionError('No database access')):
            response = app.test_client().post('/api/studio/datasets/graph-spark-preview', json=body)
        self.assertEqual(response.status_code, 200, response.json)
        results = response.json['data']['outputs']
        self.assertEqual([item['rows'] for item in results], [[['1', 'Andi', '1', 'Jakarta']], [['2', 'Budi']], [['3', 'Bandung']]])

    def test_dates_calculator_formula_and_query_through_api(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        steps = [
            {'type': 'calculate', 'output': 'Subtotal', 'op': 'multiplication', 'left': {'kind': 'column', 'value': 'Harga'}, 'right': {'kind': 'column', 'value': 'Jumlah'}},
            {'type': 'date', 'output': 'Tahun', 'op': 'Year of date', 'left': {'kind': 'column', 'value': 'Tanggal'}, 'right': None, 'unit': 'days'},
            {'type': 'constant', 'output': 'Biaya', 'kind': 'Integer', 'value': '5'},
            {'type': 'formula', 'output': 'Total', 'expression': {'kind': 'binary', 'op': '+', 'left': {'kind': 'column', 'name': 'Subtotal'}, 'right': {'kind': 'column', 'name': 'Biaya'}}},
            {'type': 'query', 'select': [{'name': name, 'expression': {'kind': 'column', 'name': name}} for name in ('Total', 'Tahun')], 'where': None, 'order': [{'column': 'Total', 'direction': 'desc'}], 'limit': 2, 'offset': 0},
        ]
        with patch.object(api, '_principal', return_value='fixture-user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode', side_effect=AssertionError('No database access')):
            response = app.test_client().post('/api/studio/datasets/fixed-spark-preview', json={
                'columns': ['Harga', 'Jumlah', 'Tanggal'], 'rows': [['10', '2', '2026-11-07'], ['7.5', '4', '2026-10-31']], 'steps': steps,
            })
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['data'], {'columns': ['Total', 'Tahun'], 'rows': [['35.0', '2026'], ['25.0', '2026']], 'has_more': False})

    def test_fixed_two_by_two_returns_one_column_through_api(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        with patch.object(api, '_principal', return_value='fixture-user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode', side_effect=AssertionError('Fixed Input must not access database')):
            response = app.test_client().post('/api/studio/datasets/fixed-spark-preview', json={
                'columns': ['Nama', 'Kota'],
                'rows': [['Andi', 'Jakarta'], ['Budi', 'Bandung']],
                'steps': [{'type': 'select', 'columns': ['Nama'], 'renames': {'Nama': 'Nama'}}],
            })
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['data'], {'columns': ['Nama'], 'rows': [['Andi'], ['Budi']], 'has_more': False})
        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_all_text_components_return_spark_result_through_api(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_datasets_bp)
        steps = [
            {'type': 'string', 'column': 'Nama', 'output': 'Clean', 'op': 'trim_spaces', 'trim': 'both'},
            {'type': 'format', 'column': 'Clean', 'case': 'upper', 'numbers': 'remove_numbers'},
            {'type': 'replace', 'column': 'Kota', 'find': 'a', 'replacement': '@'},
            {'type': 'combine', 'columns': ['Clean', 'Kota'], 'output': 'Full', 'delimiter': '|', 'remove_sources': True},
            {'type': 'split', 'column': 'Full', 'outputs': ['Person', 'City'], 'delimiter': '|', 'keep_extra': False, 'remove_source': True},
            {'type': 'select', 'columns': ['Person', 'City']},
        ]
        with patch.object(api, '_principal', return_value='fixture-user'), patch.object(api, '_mutating'), patch.object(api.core_api, '_post_mode', side_effect=AssertionError('No database access')):
            response = app.test_client().post('/api/studio/datasets/fixed-spark-preview', json={
                'columns': ['Nama', 'Kota'], 'rows': [['  andi01 ', 'jakarta'], [' budi02 ', 'bandung']], 'steps': steps,
            })
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['data'], {'columns': ['Person', 'City'], 'rows': [['ANDI', 'j@k@rt@'], ['BUDI', 'b@ndung']], 'has_more': False})
