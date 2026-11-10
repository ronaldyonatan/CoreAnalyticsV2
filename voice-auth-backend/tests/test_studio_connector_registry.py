"""Connector registry and SQL Server compatibility tests."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.connectors.registry import ConnectorSpec, get, capabilities, register
from app.services import studio_batch_bindings  # registers the SQL Server adapter


class ConnectorRegistryTests(unittest.TestCase):
    def test_existing_sqlserver_available(self):
        self.assertIn('read', get('sqlserver').capabilities)
        self.assertNotIn('write', capabilities()['sqlserver'])

    def test_unknown_connector_is_rejected_without_import(self):
        for kind in ('postgresql', '../../etc/passwd', None):
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, 'CONNECTOR_UNSUPPORTED'):
                get(kind)

    def test_duplicate_registration_fails(self):
        with self.assertRaisesRegex(ValueError, 'CONNECTOR_DUPLICATE'):
            register(ConnectorSpec('sqlserver', frozenset({'read'}), lambda *a: {}))


if __name__ == '__main__':
    unittest.main()
