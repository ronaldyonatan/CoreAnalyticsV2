import pathlib
import importlib.util
import contextlib
import io
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]


class WorkerBeamInstallerTests(unittest.TestCase):
    def test_installer_is_guarded_and_disabled_until_key_provisioned(self):
        text = (ROOT / 'artifacts/CoreAnalyticsV2-WORKER-BEAM-INSTALL-DEV.sql').read_text()
        for guard in ('UNREVIEWED_GATEWAY_DEFINITION', 'WORKER_PROCEDURE_DEFINITION_MISMATCH',
                      'PREVIOUS_GATEWAY_BACKUP_MISMATCH', 'GATEWAY_POST_INSTALL_VERIFICATION_FAILED',
                      'WORKER_BEAM_GATEWAY_INSTALLED_DISABLED_DEV_TESTS_REQUIRED'):
            self.assertTrue(guard in text, f'installer guard missing: {guard}')
        self.assertFalse('INSERT studio.worker_beam_key' in text, 'installer must not provision a key')
        self.assertTrue('INSERT studio.worker_beam_nonce' in text)
        self.assertTrue('fnObjectAccessHmac256' in text)

    def test_rollback_refuses_dashboard_drift_and_disables_key(self):
        text = (ROOT / 'artifacts/CoreAnalyticsV2-WORKER-BEAM-ROLLBACK-DEV.sql').read_text()
        self.assertTrue('GATEWAY_CHANGED_AFTER_WORKER_INSTALL' in text)
        self.assertTrue('UPDATE studio.worker_beam_key SET enabled=0' in text)
        self.assertFalse('DROP TABLE' in text)

    def test_query_candidate_preserves_worker_rollback_order(self):
        install = (ROOT / 'artifacts/CoreAnalyticsV2-DATASET-QUERY-AFTER-WORKER-BEAM-INSTALL-DEV.sql').read_text()
        rollback = (ROOT / 'artifacts/CoreAnalyticsV2-DATASET-QUERY-AFTER-WORKER-BEAM-ROLLBACK-DEV.sql').read_text()
        self.assertTrue('32FD006231EFF08FCC19DF564B3C9A112C3E54F3F308A66EEB641596A4D37123' in install)
        self.assertTrue('GATEWAY_BACKUP_MISMATCH' in install)
        self.assertTrue('UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@installed' in install)
        self.assertFalse('UPDATE studio.worker_beam_gateway_backup SET installed_definition=' in install)
        self.assertTrue('UPDATE studio.worker_beam_gateway_backup SET installed_definition=@actual' in rollback)
        self.assertTrue('QUERY_ROLLBACK_BLOCKED_SAVED_DEFINITIONS_EXIST' in rollback)

    def test_targeted_claim_migration_is_guarded_and_scoped_to_run(self):
        sql = (ROOT / 'artifacts/CoreAnalyticsV2-WORKER-BEAM-TARGETED-CLAIM-DEV.sql').read_text()
        for required in ('UNREVIEWED_WORKER_GATEWAY_DEFINITION', 'WORKER_PREREQUISITES_REQUIRED',
                         "r.run_id=@run AND r.status=''QUEUED''", 'fnStudioAccessLevel',
                         'TARGETED_WORKER_CLAIM_INSTALLED_DEV_TRIALS_REQUIRED'):
            self.assertTrue(required in sql, f'missing expected targeted-claim guard: {required}')
        self.assertTrue('requested_by uniqueidentifier);\n    DECLARE @now datetime2(3)' in sql,
                        'table and scalar variables require separate SQL declarations')
        self.assertFalse('ALTER PROCEDURE [dbo].[spDashboard]' in sql)

    def test_key_provisioning_creates_private_matching_files_without_overwrite(self):
        spec = importlib.util.spec_from_file_location('prepare_worker_key', ROOT / 'scripts/prepare_worker_beam_dev_key.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp, patch.object(pathlib.Path, 'home', return_value=pathlib.Path(tmp)):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(module.main(), 0)
            directory = pathlib.Path(tmp) / '.config/coreanalyticsv2'
            env = directory / 'worker-beam.env'
            sql = directory / 'worker-beam-provision-PRIVATE.sql'
            key = env.read_text().split("STUDIO_WORKER_BEAM_HMAC_KEY_HEX='")[1].split("'")[0]
            self.assertEqual(len(key), 64)
            self.assertTrue(('0x' + key) in sql.read_text(), 'generated files must use the same key')
            self.assertFalse(key in output.getvalue(), 'key must never be printed')
            self.assertEqual(env.stat().st_mode & 0o777, 0o600)
            self.assertEqual(sql.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                module.main()

    def test_key_rotation_writes_private_matching_files_without_printing_key(self):
        spec = importlib.util.spec_from_file_location('rotate_worker_key', ROOT / 'scripts/rotate_worker_beam_dev_key.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp, patch.object(pathlib.Path, 'home', return_value=pathlib.Path(tmp)):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                module.main()
            directory = pathlib.Path(tmp) / '.config/coreanalyticsv2'
            env = directory / 'worker-beam-next.env'
            sql = directory / 'worker-beam-rotate-PRIVATE.sql'
            key = env.read_text().split("STUDIO_WORKER_BEAM_HMAC_KEY_HEX='")[1].split("'")[0]
            self.assertEqual(len(key), 64)
            self.assertTrue(('0x' + key) in sql.read_text(), 'rotation files must use the same key')
            self.assertFalse(key in output.getvalue(), 'key must never be printed')
            self.assertEqual(env.stat().st_mode & 0o777, 0o600)
            self.assertEqual(sql.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                module.main()


if __name__ == '__main__':
    unittest.main()
