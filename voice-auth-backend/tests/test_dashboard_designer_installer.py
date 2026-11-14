import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SQL=(ROOT/'artifacts/CoreAnalyticsV2-DASHBOARD-DESIGNER-INSTALL-DEV.sql').read_text()
ROLLBACK=(ROOT/'artifacts/CoreAnalyticsV2-DASHBOARD-DESIGNER-ROLLBACK-DEV.sql').read_text()

class DashboardInstallerTests(unittest.TestCase):
    def test_signed_gateway_and_guards_are_present(self):
        for marker in ('DASHBOARD_DESIGNER_V1','fnObjectAccessHmac256','object_access_rpc_nonce','UPDLOCK,HOLDLOCK','PHASE2D8_BACKUP_MISMATCH','QUERY_BACKUP_MISMATCH','GATEWAY_POST_INSTALL_VERIFICATION_FAILED'):
            self.assertIn(marker,SQL)
        self.assertIn('owner_user_id=@Actor',SQL)
        self.assertIn('DASHBOARD_VERSION_CONFLICT',SQL)
        self.assertEqual(len(re.findall(r'@Name nvarchar\(max\)',SQL)),1)
        self.assertNotIn('UPDATE studio.dataset_query_gateway_backup SET',SQL)
    def test_rollback_refuses_data_loss_and_gateway_drift(self):
        self.assertIn('ROLLBACK_BLOCKED_SAVED_DASHBOARDS_EXIST',ROLLBACK)
        self.assertIn('GATEWAY_CHANGED_AFTER_DESIGNER_INSTALL',ROLLBACK)
        self.assertIn('ROLLBACK_BACKUP_MISMATCH',ROLLBACK)

if __name__=='__main__': unittest.main()
