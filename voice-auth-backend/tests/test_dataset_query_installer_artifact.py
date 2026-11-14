"""Static integrity checks; SQL Server execution is tested separately in DEV."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class DatasetQueryInstallerArtifactTests(unittest.TestCase):
    def test_installer_contains_reviewed_gateway_guard_and_atomic_rollback(self):
        sql = (ROOT / 'artifacts/CoreAnalyticsV2-DATASET-SQL-QUERY-INSTALL-DEV.sql').read_text()
        self.assertIn('D6E5A2CD61E081132FCAA1183EF9FBAB3F7AA00D5565DE08E39EDA5184ED022E', sql)
        self.assertLess(sql.index('BEGIN TRAN;'), sql.index('CREATE TABLE studio.dataset_query_source'))
        self.assertLess(sql.index('GATEWAY_POST_INSTALL_VERIFICATION_FAILED'), sql.rindex('COMMIT;'))
        self.assertIn('IF XACT_STATE()<>0 ROLLBACK;', sql)
        self.assertNotRegex(sql, r'(?im)^\s*GO\s*$')

    def test_embedded_rpc_matches_reviewed_candidate(self):
        sql = (ROOT / 'artifacts/CoreAnalyticsV2-DATASET-SQL-QUERY-INSTALL-DEV.sql').read_text()
        match = re.search(r" EXEC sys\.sp_executesql N'((?:[^']|'')*)';\n\s*CREATE TABLE studio\.dataset_query_gateway_backup", sql, re.S)
        self.assertIsNotNone(match)
        embedded = match.group(1).replace("''", "'")
        draft = (ROOT / 'data-studio-backend/dataset-query/DRAFT-query-metadata.sql').read_text()
        expected = draft[draft.index('CREATE OR ALTER PROCEDURE studio.spDatasetQueryRpc'):].rsplit('\nGO', 1)[0]
        self.assertEqual(embedded, expected.replace('CREATE OR ALTER PROCEDURE', 'CREATE PROCEDURE', 1))
        self.assertIn("@Action='STATUS'", embedded)


if __name__ == '__main__': unittest.main()
