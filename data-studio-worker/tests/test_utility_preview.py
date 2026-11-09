import unittest
from pyspark.sql import SparkSession
from app.preview import preview


def value(value): return {'kind': 'value', 'value': value}
def column(value): return {'kind': 'column', 'value': value}
def ref(name): return {'kind': 'column', 'name': name}
def lit(value): return {'kind': 'literal', 'value': value}


class UtilityPreviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spark = SparkSession.builder.master('local[2]').appName('Dates utility tests').config('spark.ui.enabled', 'false').config('spark.sql.ansi.enabled', 'true').getOrCreate()
        cls.spark.sparkContext.setLogLevel('ERROR')

    @classmethod
    def tearDownClass(cls): cls.spark.stop()

    def run_steps(self, steps, rows=None, columns=None):
        return preview([['10', '2', '2024-02-29']] if rows is None else rows, ['Price', 'Qty', 'Day'] if columns is None else columns, steps, spark=self.spark)

    def test_all_calculator_operations(self):
        for op, expected in [('addition', '12.0'), ('subtraction', '8.0'), ('multiplication', '20.0'), ('division', '5.0'), ('power', '100.0'), ('ceiling', '10'), ('floor', '10')]:
            with self.subTest(op=op):
                result = self.run_steps([{'type': 'calculate', 'output': 'result', 'op': op, 'left': column('Price'), 'right': None if op in ('floor', 'ceiling') else column('Qty')}])
                self.assertEqual(result['rows'][0][-1], expected)

    def test_calculator_bad_values_zero_and_nonfinite_are_null(self):
        for op, left, right in [('division', '5', '0'), ('power', '-1', '0.5'), ('multiplication', '1e308', '1e308'), ('addition', 'bad', '2')]:
            result = self.run_steps([{'type': 'calculate', 'output': 'result', 'op': op, 'left': column('a'), 'right': column('b')}], [[left, right], [None, right]], ['a', 'b'])
            self.assertEqual([row[-1] for row in result['rows']], [None, None])

    def test_date_parts(self):
        for op, expected in [('Year of date', '2024'), ('Quarter of date', '1'), ('Month of date', '2'), ('Day of year', '60'), ('Day of month', '29'), ('Day of week', '5'), ('Week of year', '9')]:
            result = self.run_steps([{'type': 'date', 'output': 'part', 'op': op, 'left': column('Day'), 'right': None, 'unit': 'days'}])
            self.assertEqual(result['rows'][0][-1], expected)

    def test_date_shifts_difference_and_invalid(self):
        for op, unit, amount, expected in [('Subtract from date', 'days', '1', '2024-02-28'), ('Add to date', 'years', '1', '2025-02-28'), ('Add to date', 'months', '1', '2024-03-29'), ('Subtract from date', 'days', '0.5', None), ('Subtract from date', 'days', '1e9', None), ('Difference between dates', 'days', '2024-02-28', '1')]:
            result = self.run_steps([{'type': 'date', 'output': 'result', 'op': op, 'left': column('Day'), 'right': value(amount), 'unit': unit}])
            self.assertEqual(result['rows'][0][-1], expected)
        result = self.run_steps([{'type': 'date', 'output': 'year', 'op': 'Year of date', 'left': column('d'), 'right': None, 'unit': 'days'}], [['bad'], ['2026-02-30'], [None]], ['d'])
        self.assertEqual([row[-1] for row in result['rows']], [None, None, None])

    def test_constants_all_types_and_schema(self):
        examples = [('Text', 'hello', 'hello'), ('Integer', '42', '42'), ('Floating Decimal', '2.5', '2.5'), ('Fixed Decimal', '2.5', '2.5000000000'), ('Date', '2024-02-29', '2024-02-29'), ('Timestamp', '2024-02-29 12:30:00', '2024-02-29 12:30:00'), ('Boolean', 'true', 'true'), ('Null', '', None)]
        for kind, constant, expected in examples:
            result = self.run_steps([{'type': 'constant', 'output': 'New', 'kind': kind, 'value': constant}])
            self.assertEqual(result['rows'][0][-1], expected)
        result = self.run_steps([{'type': 'constant', 'output': 'New', 'kind': 'Integer', 'value': 'bad'}])
        self.assertIsNone(result['rows'][0][-1])

    def test_formula_arithmetic_functions_and_null(self):
        result = self.run_steps([{'type': 'formula', 'output': 'Total', 'expression': {'kind': 'binary', 'op': '*', 'left': ref('Price'), 'right': ref('Qty')}}])
        self.assertEqual(result['rows'][0][-1], '20.0')
        for name, args, expected in [('upper', [lit('a')], 'A'), ('sqrt', [lit(9)], '3.0'), ('power', [lit(2), lit(3)], '8.0'), ('coalesce', [lit(None), lit('fallback')], 'fallback'), ('year', [lit('2026-02-30')], None)]:
            result = self.run_steps([{'type': 'formula', 'output': 'result', 'expression': {'kind': 'call', 'name': name, 'args': args}}])
            self.assertEqual(result['rows'][0][-1], expected)

    def test_alter_rename_cast_drop_and_duplicate(self):
        result = self.run_steps([{'type': 'duplicate', 'column': 'Price', 'output': 'Copy'}, {'type': 'alter', 'changes': [{'column': 'Price', 'output': 'Amount', 'kind': 'Integer'}], 'drop': ['Qty']}])
        self.assertEqual(result, {'columns': ['Amount', 'Day', 'Copy'], 'rows': [['10', '2024-02-29', '10']]})

    def test_get_schema_changes_rows_and_preserves_types(self):
        result = self.run_steps([{'type': 'constant', 'output': 'Count', 'kind': 'Integer', 'value': '1'}, {'type': 'schema', 'names': ['name', 'expr', 'type']}])
        self.assertEqual(result['columns'], ['name', 'expr', 'type'])
        self.assertEqual(result['rows'][-1], ['Count', '`Count`', 'bigint'])

    def test_json_nested_array_null_missing_and_types(self):
        result = self.run_steps([{'type': 'json', 'column': 'payload', 'mappings': [{'path': '$.items[0].price', 'output': 'amount', 'kind': 'Integer'}, {'path': '$.active', 'output': 'active', 'kind': 'Boolean'}]}], [['{"items":[{"price":12}],"active":true}'], ['bad'], [None], ['{}']], ['payload'])
        self.assertEqual([row[-2:] for row in result['rows']], [['12', 'true'], [None, None], [None, None], [None, None]])

    def test_limit_offset_and_zero(self):
        result = self.run_steps([{'type': 'limit', 'count': 2, 'offset': 1}], [['A'], ['B'], ['C'], ['D']], ['x'])
        self.assertEqual(result['rows'], [['B'], ['C']])
        self.assertEqual(self.run_steps([{'type': 'limit', 'count': 0, 'offset': 0}])['rows'], [])

    def test_series_and_meta_select(self):
        result = self.run_steps([{'type': 'series', 'output': 'Sequence', 'count': 3, 'start': 10, 'step': 2}, {'type': 'meta_select', 'columns': [], 'pattern': 'Seq*'}])
        self.assertEqual(result, {'columns': ['Sequence'], 'rows': [['10'], ['12'], ['14']]})
        with self.assertRaises(ValueError): self.run_steps([{'type': 'meta_select', 'columns': [], 'pattern': 'missing*'}])

    def test_numeric_order_and_nulls_last(self):
        result = self.run_steps([{'type': 'order', 'items': [{'column': 'n', 'direction': 'asc', 'kind': 'Number'}]}], [['10'], ['2'], ['bad'], [None]], ['n'])
        self.assertEqual(result['rows'][:2], [['2'], ['10']])

    def test_value_mapper_keep_default_cast_and_null(self):
        for unmatched, expected in [('keep', ['Active', 'B', None]), ('default', ['Active', 'Other', 'Other'])]:
            result = self.run_steps([{'type': 'mapper', 'column': 'status', 'output': 'mapped', 'kind': '', 'mappings': [['A', 'Active']], 'unmatched': unmatched, 'default': 'Other'}], [['A'], ['B'], [None]], ['status'])
            self.assertEqual([row[-1] for row in result['rows']], expected)

    def test_query_where_numeric_projection_order_limit(self):
        result = self.run_steps([{'type': 'query', 'select': [{'name': 'Value', 'expression': {'kind': 'binary', 'op': '*', 'left': ref('n'), 'right': lit(2)}}], 'where': {'kind': 'binary', 'op': '>', 'left': ref('n'), 'right': lit(2)}, 'order': [{'column': 'Value', 'direction': 'desc'}], 'limit': 1, 'offset': 0}], [['2'], ['10'], ['3']], ['n'])
        self.assertEqual(result, {'columns': ['Value'], 'rows': [['20.0']]})

    def test_expression_and_query_cannot_execute_code_or_access_other_sources(self):
        invalid = [
            {'type': 'formula', 'output': 'x', 'expression': {'kind': 'call', 'name': 'reflect', 'args': [lit('java.lang.Runtime')]}},
            {'type': 'formula', 'output': 'x', 'expression': {'kind': 'column', 'name': 'missing'}},
            {'type': 'query', 'select': [{'name': 'x', 'expression': lit(1)}], 'where': None, 'order': [], 'limit': 1, 'offset': 0, 'sql': 'DROP TABLE x'},
            {'type': 'limit', 'count': 51, 'offset': 0},
            {'type': 'series', 'output': 'x', 'count': 51, 'start': 0, 'step': 1},
            {'type': 'constant', 'output': 'price', 'kind': 'Integer', 'value': '2'},
            {'type': 'json', 'column': 'Price', 'mappings': [{'path': '$..*', 'output': 'x', 'kind': 'Text'}]},
        ]
        for step in invalid:
            with self.subTest(step=step), self.assertRaises(ValueError): self.run_steps([step])
