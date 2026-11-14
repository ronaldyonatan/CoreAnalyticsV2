import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from decimal import Decimal
from datetime import date

from app.services.studio_source_query_sqlserver import validate_guarded_query, preview_guarded_query
from app.services.studio_source_query_validation import SourceQueryError


class SQLServerQueryBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.pooling = patch('pyodbc.pooling', False)
        self.pooling.start()
        self.addCleanup(self.pooling.stop)

    def test_privileged_or_invalid_execution_identity_rejected(self):
        for login in ('sa', 'SA', 'dbo', '', "x'; DROP TABLE t--", None):
            with self.subTest(login=login), self.assertRaises(ValueError):
                validate_guarded_query('SELECT 1', login)

    def test_unsafe_shape_is_not_prepared(self):
        with self.assertRaises(SourceQueryError):
            validate_guarded_query('SELECT 1; REVERT', 'coreanalytics_reader')

    def test_preview_fetches_bounded_rows_and_closes_connection(self):
        connection, cursor = MagicMock(), MagicMock()
        connection.cursor.return_value = cursor
        cursor.fetchone.return_value = ('coreanalytics_reader', 0, 0, 0, 0, 0, 0, 0, 0)
        cursor.description = [('name',)]
        cursor.fetchmany.return_value = [(str(i),) for i in range(51)]
        cursor.nextset.return_value = None
        result = preview_guarded_query(SimpleNamespace(timeout=60), 'SELECT name FROM dbo.t', 'coreanalytics_reader', connect=lambda _: connection)
        self.assertEqual(len(result['rows']), 50)
        self.assertTrue(result['has_more'])
        self.assertEqual(connection.timeout, 30)
        statements = cursor.execute.call_args_list
        self.assertEqual(statements[0].args, ("EXECUTE AS LOGIN = N'coreanalytics_reader' WITH NO REVERT;",))
        self.assertIn("IS_SRVROLEMEMBER('sysadmin')", statements[1].args[0])
        self.assertEqual(statements[2].args, ('SET ROWCOUNT 51;',))
        self.assertEqual(statements[3].args, ('EXEC sys.sp_executesql ?', 'SELECT name FROM dbo.t'))
        cursor.nextset.assert_called_once()
        cursor.close.assert_called_once()
        connection.close.assert_called_once()

    def test_preview_closes_connection_on_error(self):
        connection, cursor = MagicMock(), MagicMock()
        connection.cursor.return_value = cursor
        cursor.execute.side_effect = RuntimeError('database unavailable')
        with self.assertRaises(RuntimeError):
            preview_guarded_query(SimpleNamespace(timeout=10), 'SELECT 1', 'coreanalytics_reader', connect=lambda _: connection)
        cursor.close.assert_called_once()
        connection.close.assert_called_once()

    def test_preview_rejects_invalid_limit(self):
        for limit in (0, 52, True, '51'):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                validate_guarded_query('SELECT 1', 'coreanalytics_reader', preview_limit=limit)

    def test_unsafe_identity_never_executes_user_query(self):
        connection, cursor = MagicMock(), MagicMock()
        connection.cursor.return_value = cursor
        cursor.fetchone.return_value = ('coreanalytics_reader', 1, 0, 0, 0, 0, 0, 0, 0)
        with self.assertRaisesRegex(ValueError, 'QUERY_EXECUTION_IDENTITY_UNSAFE'):
            preview_guarded_query(SimpleNamespace(timeout=10), 'SELECT 1', 'coreanalytics_reader', connect=lambda _: connection)
        self.assertEqual(cursor.execute.call_count, 2)
        cursor.close.assert_called_once()
        connection.close.assert_called_once()

    def test_pooled_connection_is_rejected_before_connecting(self):
        connector = MagicMock()
        with patch('pyodbc.pooling', True), self.assertRaisesRegex(ValueError, 'QUERY_NONPOOLED_CONNECTION_REQUIRED'):
            preview_guarded_query(SimpleNamespace(timeout=10), 'SELECT 1', 'coreanalytics_reader', connect=connector)
        connector.assert_not_called()

    def test_preview_normalizes_values_without_losing_decimal_precision(self):
        connection, cursor = MagicMock(), MagicMock()
        connection.cursor.return_value = cursor
        cursor.fetchone.return_value = ('coreanalytics_reader', 0, 0, 0, 0, 0, 0, 0, 0)
        cursor.description = [('amount',), ('day',), ('text',), ('binary',)]
        cursor.fetchmany.return_value = [(Decimal('123.456789'), date(2026, 11, 13), 'x' * 300, bytes(range(200)))]
        cursor.nextset.return_value = None
        output = preview_guarded_query(SimpleNamespace(timeout=10), 'SELECT 1', 'coreanalytics_reader', connect=lambda _: connection)
        self.assertEqual(output['rows'][0][:3], ['123.456789', '2026-11-13', 'x' * 256])
        self.assertEqual(len(output['rows'][0][3]), 256)


if __name__ == '__main__':
    unittest.main()
