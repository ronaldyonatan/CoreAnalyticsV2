import datetime
import decimal
import tempfile
import unittest
from pathlib import Path

import pyarrow.parquet as pq
from app.sql_script_staging import stage_last_resultset, stage_sql_script


class Cursor:
    def __init__(self, sets):
        self.sets = sets
        self.index = 0
        self.offset = 0
        self.executed = []

    def execute(self, script):
        self.executed.append(script)

    @property
    def description(self):
        return self.sets[self.index][0]

    def fetchmany(self, amount):
        rows = self.sets[self.index][1]
        result = rows[self.offset:self.offset + amount]
        self.offset += len(result)
        return result

    def nextset(self):
        self.index += 1
        self.offset = 0
        return self.index < len(self.sets)


def col(name, kind, precision=None, scale=None):
    return (name, kind, None, None, precision, scale, True)


class ScriptStagingTests(unittest.TestCase):
    def test_script_is_executed_once_for_multiple_result_sets(self):
        cursor = Cursor([([col('x', int)], [(1,)]), ([col('y', int)], [(2,)])])
        script = 'SELECT 1 AS x; SELECT 2 AS y;'
        with tempfile.TemporaryDirectory() as folder:
            path, count = stage_sql_script(cursor, script, folder)
            self.assertEqual(cursor.executed, [script])
            self.assertEqual(count, 1)
            self.assertEqual(pq.read_table(path).to_pylist(), [{'y':2}])

    def test_stages_only_last_result_with_types_and_exact_values(self):
        cursor = Cursor([(None, []), ([col('old', int)], [(99,)]),
            ([col('id', int), col('amount', decimal.Decimal, 12, 2), col('day', datetime.date)],
             [(1, decimal.Decimal('12.30'), datetime.date(2026, 1, 2)), (2, None, None)])])
        with tempfile.TemporaryDirectory() as folder:
            path, count = stage_last_resultset(cursor, folder, batch_size=1)
            self.assertEqual(count, 2)
            self.assertEqual(sorted(p.name for p in Path(folder).iterdir()), ['result-2.parquet'])
            self.assertEqual(pq.read_table(path).to_pylist(), [
                {'id':1, 'amount':decimal.Decimal('12.30'), 'day':datetime.date(2026,1,2)},
                {'id':2, 'amount':None, 'day':None}])

    def test_empty_result_keeps_schema(self):
        with tempfile.TemporaryDirectory() as folder:
            path, count = stage_last_resultset(Cursor([([col('item', str)], [])]), folder)
            self.assertEqual(count, 0)
            self.assertEqual(pq.read_table(path).schema.names, ['item'])

    def test_duplicate_column_and_unsupported_types_fail(self):
        for columns, expected in [([col('x', int), col('x', int)], 'QUERY_RESULT_DUPLICATE_COLUMN'),
                                  ([col('x', int), col('X', int)], 'QUERY_RESULT_DUPLICATE_COLUMN'),
                                  ([col('x', object)], 'QUERY_RESULT_TYPE_UNSUPPORTED')]:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ValueError, expected):
                stage_last_resultset(Cursor([(columns, [])]), folder)

    def test_row_limit_prevents_unbounded_staging(self):
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ValueError, 'QUERY_RESULT_ROW_LIMIT'):
            stage_last_resultset(Cursor([([col('x', int)], [(1,), (2,)])]), folder, max_rows=1)

    def test_binary_boolean_and_timestamp_are_preserved(self):
        fields = [col('data', bytes), col('flag', bool), col('at', datetime.datetime)]
        stamp = datetime.datetime(2026, 1, 2, 3, 4, 5, 123456)
        with tempfile.TemporaryDirectory() as folder:
            path, count = stage_sql_script(Cursor([(fields, [(b'\x00\xff', True, stamp)])]), 'SELECT 1', folder)
            self.assertEqual(count, 1)
            self.assertEqual(pq.read_table(path).to_pylist(), [{'data':b'\x00\xff', 'flag':True, 'at':stamp}])

    def test_timezone_aware_timestamp_is_rejected_instead_of_silent_conversion(self):
        stamp = datetime.datetime(2026, 1, 2, tzinfo=datetime.timezone.utc)
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ValueError, 'QUERY_RESULT_TIMEZONE_UNSUPPORTED'):
            stage_sql_script(Cursor([([col('at', datetime.datetime)], [(stamp,)])]), 'SELECT 1', folder)


if __name__ == '__main__':
    unittest.main()
