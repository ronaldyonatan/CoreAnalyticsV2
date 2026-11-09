import unittest
from app.preview import preview


class PreviewTest(unittest.TestCase):
    def test_fixed_two_columns_two_rows_select_one_column(self):
        result = preview([['Andi', 'Jakarta'], ['Budi', 'Bandung']], ['Nama', 'Kota'], [
            {'type': 'select', 'columns': ['Nama']},
        ])
        self.assertEqual(result, {'columns': ['Nama'], 'rows': [['Andi'], ['Budi']]})

    def test_select_alias_then_filter_uses_output_schema(self):
        result = preview([['Andi', 'Jakarta'], ['Budi', 'Bandung']], ['Nama', 'Kota'], [
            {'type': 'select', 'columns': ['Nama'], 'renames': {'Nama': 'Pelanggan'}},
            {'type': 'filter', 'column': 'Pelanggan', 'op': 'eq', 'value': 'Andi'},
        ])
        self.assertEqual(result, {'columns': ['Pelanggan'], 'rows': [['Andi']]})

    def test_filter_and_select(self):
        result = preview([['A', '5'], ['B', '2'], ['A', '3']], ['category', 'value'], [
            {'type': 'filter', 'column': 'category', 'op': 'eq', 'value': 'A'},
            {'type': 'select', 'columns': ['value']},
        ])
        self.assertEqual(result, {'columns': ['value'], 'rows': [['5'], ['3']]})

    def test_unknown_step_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'UNSUPPORTED_STEP'):
            preview([['x']], ['col'], [{'type': 'python_script', 'expression': '1'}])

    def test_sample_limit_is_enforced(self):
        with self.assertRaisesRegex(ValueError, 'INVALID_ROWS'):
            preview([['x']] * 51, ['col'], [])


if __name__ == '__main__':
    unittest.main()
