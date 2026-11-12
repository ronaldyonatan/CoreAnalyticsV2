"""Regression: PostgreSQL and SQL Server have distinct port policies."""
import os
import sys
import types
import unittest
from unittest.mock import patch

# SQL host validator imports pyodbc at module load; this suite only validates policy.
if 'pyodbc' not in sys.modules:
    try:
        import pyodbc  # noqa
    except ImportError:
        stub = types.ModuleType('pyodbc')
        stub.Error = Exception
        sys.modules['pyodbc'] = stub

from app.connectors.sqlserver import SqlTargetPolicyError, validate_sqlserver_host
from app.connectors.postgresql_adapter import PostgreSQLTarget, validate_target as validate_pg


class DualDbPortPolicies(unittest.TestCase):
    def setUp(self):
        self.settings = patch.dict(os.environ, {
            'STUDIO_SQL_HOST_POLICY': 'dynamic',
            'STUDIO_SQL_ALLOWED_PORTS': '1433',
            'STUDIO_POSTGRESQL_ALLOWED_PORTS': '5432',
            'STUDIO_SQL_ALLOW_PRIVATE': 'true',
            'STUDIO_SQL_ALLOWED_NETWORKS': '',
        })
        self.settings.start()
        self.local_guard = patch('app.connectors.sqlserver._is_local_address', return_value=False)
        self.local_guard.start()

    def tearDown(self):
        self.local_guard.stop()
        self.settings.stop()

    def test_sqlserver_default_1433_still_allowed(self):
        self.assertEqual(validate_sqlserver_host('10.20.30.40', 1433)[1], '10.20.30.40')

    def test_sqlserver_cannot_use_postgresql_port_by_default(self):
        with self.assertRaises(SqlTargetPolicyError) as ctx:
            validate_sqlserver_host('10.20.30.40', 5432)
        self.assertEqual(str(ctx.exception), 'SQL_PORT_NOT_ALLOWED')

    def test_postgresql_default_5432_allowed_even_with_sqlserver_only_1433(self):
        target = PostgreSQLTarget('10.20.30.40', 5432, 'db', 'user', 'password')
        self.assertEqual(validate_pg(target)[1], '10.20.30.40')

    def test_postgresql_custom_port_requires_its_policy(self):
        target = PostgreSQLTarget('10.20.30.40', 55432, 'db', 'user', 'password')
        with self.assertRaises(SqlTargetPolicyError):
            validate_pg(target)
        with patch.dict(os.environ, {'STUDIO_POSTGRESQL_ALLOWED_PORTS': '5432,55432'}):
            self.assertEqual(validate_pg(target)[1], '10.20.30.40')

    def test_private_network_rule_is_not_bypassed(self):
        with patch.dict(os.environ, {'STUDIO_SQL_ALLOW_PRIVATE': 'false'}):
            target = PostgreSQLTarget('10.20.30.40', 5432, 'db', 'user', 'password')
            with self.assertRaises(SqlTargetPolicyError) as ctx:
                validate_pg(target)
            self.assertEqual(str(ctx.exception), 'SQL_PRIVATE_DESTINATION_DISABLED')


if __name__ == '__main__':
    unittest.main()
