import unittest
from pyspark.sql import SparkSession
from app.preview import preview


class TextPreviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spark = SparkSession.builder.master('local[2]').appName('Text preview tests').config('spark.ui.enabled', 'false').config('spark.sql.ansi.enabled', 'true').getOrCreate()
        cls.spark.sparkContext.setLogLevel('ERROR')

    @classmethod
    def tearDownClass(cls):
        cls.spark.stop()

    def run_text(self, rows, columns, steps):
        return preview(rows, columns, steps, spark=self.spark)

    def test_combine_order_null_fields_and_drop(self):
        result = self.run_text([['A', 'B', 'keep'], [None, 'C', 'keep'], ['', None, 'keep']], ['first', 'second', 'other'], [
            {'type': 'combine', 'columns': ['second', 'first'], 'output': 'full', 'delimiter': '|', 'remove_sources': True},
        ])
        self.assertEqual(result, {'columns': ['other', 'full'], 'rows': [['keep', 'B|A'], ['keep', 'C|'], ['keep', '|']]})

    def test_combine_bounds_output(self):
        result = self.run_text([['a' * 256, 'b' * 256]], ['a', 'b'], [{'type': 'combine', 'columns': ['a', 'b'], 'output': 'full', 'delimiter': ' ', 'remove_sources': False}])
        self.assertEqual(len(result['rows'][0][-1]), 256)

    def test_replace_literal_pattern_and_replacement(self):
        result = self.run_text([['a.b.*b'], [None], ['']], ['text'], [{'type': 'replace', 'column': 'text', 'find': '.', 'replacement': '$1\\'}])
        self.assertEqual(result['rows'], [['a$1\\b$1\\*b'], [None], ['']])
        result = self.run_text([['abcabc']], ['text'], [{'type': 'replace', 'column': 'text', 'find': 'ab', 'replacement': ''}])
        self.assertEqual(result['rows'], [['cc']])

    def test_split_literal_missing_null_empty_and_remainder(self):
        for keep_extra, expected in [(False, [['A', 'B'], ['A', None], [None, None], ['', None], ['A', '']]), (True, [['A', 'B|C'], ['A', None], [None, None], ['', None], ['A', '']])]:
            with self.subTest(keep_extra=keep_extra):
                result = self.run_text([['A|B|C'], ['A'], [None], [''], ['A|']], ['text'], [{'type': 'split', 'column': 'text', 'outputs': ['first', 'rest'], 'delimiter': '|', 'keep_extra': keep_extra, 'remove_source': True}])
                self.assertEqual(result, {'columns': ['first', 'rest'], 'rows': expected})

    def test_split_one_output_keeps_remainder(self):
        result = self.run_text([['A.B.C']], ['text'], [{'type': 'split', 'column': 'text', 'outputs': ['part'], 'delimiter': '.', 'keep_extra': True, 'remove_source': False}])
        self.assertEqual(result['rows'], [['A.B.C', 'A.B.C']])

    def test_substring_unicode_and_null(self):
        result = self.run_text([['Aé😀BCD'], [None], ['']], ['text'], [{'type': 'string', 'column': 'text', 'output': 'part', 'op': 'substring', 'start': 2, 'length': 3}])
        self.assertEqual(result['rows'], [['Aé😀BCD', 'é😀B'], [None, None], ['', '']])

    def test_left_right_substring(self):
        for side, expected in [('left', 'AB'), ('right', 'DE')]:
            result = self.run_text([['ABCDE']], ['text'], [{'type': 'string', 'column': 'text', 'output': 'text', 'op': 'right_left_substring', 'side': side, 'length': 2}])
            self.assertEqual(result, {'columns': ['text'], 'rows': [[expected]]})

    def test_trim_sides(self):
        for side, expected in [('both', 'ab'), ('left', 'ab  '), ('right', '  ab')]:
            result = self.run_text([['  ab  '], [None]], ['text'], [{'type': 'string', 'column': 'text', 'output': 'clean', 'op': 'trim_spaces', 'trim': side}])
            self.assertEqual(result['rows'], [['  ab  ', expected], [None, None]])

    def test_padding_does_not_truncate(self):
        for side, expected in [('left', '   ab'), ('right', 'ab   ')]:
            result = self.run_text([['ab'], ['abcdef'], [None], ['']], ['text'], [{'type': 'string', 'column': 'text', 'output': 'padded', 'op': 'pad_with_space', 'side': side, 'width': 5}])
            self.assertEqual(result['rows'], [['ab', expected], ['abcdef', 'abcdef'], [None, None], ['', '     ']])

    def test_case_and_unicode_number_formatting(self):
        for case, numbers, expected in [('lower', '', 'a1b٢'), ('upper', 'remove_numbers', 'AB'), ('capitalize_first', 'remove_numbers', 'AB'), ('', 'only_numbers', '1٢')]:
            result = self.run_text([['a1B٢'], [None], ['']], ['text'], [{'type': 'format', 'column': 'text', 'case': case, 'numbers': numbers}])
            self.assertEqual(result['rows'], [[expected], [None], ['']])

    def test_all_text_nodes_chain_then_select_and_filter(self):
        result = self.run_text([['  andi01 ', 'jakarta'], [' budi02 ', 'bandung']], ['Nama', 'Kota'], [
            {'type': 'string', 'column': 'Nama', 'output': 'Clean', 'op': 'trim_spaces', 'trim': 'both'},
            {'type': 'format', 'column': 'Clean', 'case': 'upper', 'numbers': 'remove_numbers'},
            {'type': 'replace', 'column': 'Kota', 'find': 'a', 'replacement': '@'},
            {'type': 'combine', 'columns': ['Clean', 'Kota'], 'output': 'Full', 'delimiter': '|', 'remove_sources': True},
            {'type': 'split', 'column': 'Full', 'outputs': ['Person', 'City'], 'delimiter': '|', 'keep_extra': False, 'remove_source': True},
            {'type': 'select', 'columns': ['Person', 'City']},
            {'type': 'filter', 'column': 'Person', 'op': 'eq', 'value': 'ANDI'},
        ])
        self.assertEqual(result, {'columns': ['Person', 'City'], 'rows': [['ANDI', 'j@k@rt@']]})

    def test_quoted_column_names(self):
        result = self.run_text([['a.b']], ['a.`b'], [{'type': 'replace', 'column': 'a.`b', 'find': '.', 'replacement': '|'}])
        self.assertEqual(result['rows'], [['a|b']])

    def test_invalid_parameters_collisions_and_extra_fields(self):
        invalid = [
            {'type': 'combine', 'columns': ['a'], 'output': 'c', 'delimiter': '', 'remove_sources': False},
            {'type': 'combine', 'columns': ['a', 'b'], 'output': 'A', 'delimiter': '', 'remove_sources': True},
            {'type': 'replace', 'column': 'a', 'find': '', 'replacement': 'x'},
            {'type': 'split', 'column': 'a', 'outputs': ['b'], 'delimiter': '|', 'keep_extra': True, 'remove_source': False},
            {'type': 'split', 'column': 'a', 'outputs': ['c'], 'delimiter': '', 'keep_extra': False, 'remove_source': False},
            {'type': 'string', 'column': 'missing', 'output': 'c', 'op': 'trim_spaces', 'trim': 'both'},
            {'type': 'string', 'column': 'a', 'output': 'b', 'op': 'trim_spaces', 'trim': 'both'},
            {'type': 'string', 'column': 'a', 'output': 'c', 'op': 'substring', 'start': True, 'length': 3},
            {'type': 'string', 'column': 'a', 'output': 'c', 'op': 'pad_with_space', 'side': 'left', 'width': 257},
            {'type': 'string', 'column': 'a', 'output': 'c', 'op': 'eval', 'code': '1'},
            {'type': 'format', 'column': 'a', 'case': '', 'numbers': ''},
            {'type': 'format', 'column': 'a', 'case': 'upper', 'numbers': '', 'sql': '1'},
        ]
        for step in invalid:
            with self.subTest(step=step), self.assertRaises(ValueError):
                self.run_text([['a', 'b']], ['a', 'b'], [step])

    def test_output_column_limit(self):
        with self.assertRaisesRegex(ValueError, 'TOO_MANY_OUTPUT_COLUMNS'):
            self.run_text([['a'] * 30], [str(i) for i in range(30)], [{'type': 'string', 'column': '0', 'output': 'extra', 'op': 'trim_spaces', 'trim': 'both'}])
