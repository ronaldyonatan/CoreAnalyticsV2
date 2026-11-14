import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.studio_source_sql_script import preview_sql_script, validate_sql_script


class SourceSqlScriptTests(unittest.TestCase):
    def test_batch_uses_one_connection_and_returns_last_result(self):
        cursor = MagicMock()
        cursor.description = [('value',)]
        cursor.fetchmany.side_effect = [[[1]], [[2]]]
        cursor.nextset.side_effect = [True, False]
        connection = MagicMock()
        connection.cursor.return_value = cursor
        connect = MagicMock(return_value=connection)
        sql = 'SELECT 1 INTO #temporary; SELECT 2 AS value;'
        with patch('pyodbc.pooling', False):
            result = preview_sql_script(SimpleNamespace(timeout=10), sql, connect=connect)
        self.assertEqual(result, {'columns': ['value'], 'rows': [[2]], 'has_more': False})
        connect.assert_called_once()
        cursor.execute.assert_called_once_with(sql)
        cursor.close.assert_called_once()
        connection.close.assert_called_once()

    def test_failure_closes_connection(self):
        cursor = MagicMock()
        cursor.execute.side_effect = RuntimeError('synthetic database error')
        connection = MagicMock()
        connection.cursor.return_value = cursor
        with patch('pyodbc.pooling', False), self.assertRaises(RuntimeError):
            preview_sql_script(SimpleNamespace(timeout=10), 'SELECT 1', connect=lambda _: connection)
        cursor.close.assert_called_once()
        connection.close.assert_called_once()

    def test_pooling_is_rejected_before_connect(self):
        connect = MagicMock()
        with patch('pyodbc.pooling', True), self.assertRaisesRegex(ValueError, 'QUERY_NONPOOLED_CONNECTION_REQUIRED'):
            preview_sql_script(SimpleNamespace(timeout=10), 'SELECT 1', connect=connect)
        connect.assert_not_called()

    def test_invalid_scripts_are_rejected(self):
        for sql in ('', '   ', 'SELECT \x00 1', 'x' * 32001):
            with self.subTest(sql=repr(sql[:20])), self.assertRaisesRegex(ValueError, 'QUERY_INPUT_INVALID'):
                validate_sql_script(sql)


if __name__ == '__main__':
    unittest.main()
