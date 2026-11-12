"""Offline regression tests; no BEAM, SQL Server, or Spark connection needed."""
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# Avoid importing live config/BEAM while exercising the pure preview service.
stub = types.ModuleType('app.services.studio_dataset_ingest')
stub.job = lambda *args, **kwargs: None
stub.jobs = lambda *args, **kwargs: []
sys.modules['app.services.studio_dataset_ingest'] = stub
from app.services import studio_stored_preview as sp

DATASET = 'c8355667-4044-4d24-a334-f8d4f88d0c9f'
RUN = '8f443942-73c2-4149-aaff-b159e2a3bfbf'
OTHER = '00000000-0000-0000-0000-000000000001'
USER = '397ebb69-2aab-4bb0-89b6-731c1b95ab13'


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.rows = [dict(dataset_id=DATASET, dataset_name='financeAllMonthly', access_mode='STORED', storage_status='PENDING'),
                     dict(dataset_id=OTHER, dataset_name='live', access_mode='DIRECT', storage_status='READY')]

    def jobs(self):
        return [dict(dataset_id=DATASET, run_id=OTHER, status='FAILED', completed_at='2026-11-11T11:00:00'),
                dict(dataset_id=DATASET, run_id=RUN, status='SUCCEEDED', row_count=150852, completed_at='2026-11-11T10:00:00')]

    @patch.object(sp, 'ingest_job')
    @patch.object(sp, 'ingest_jobs')
    def test_last_good_snapshot_when_refresh_fails(self, jobs, detail):
        jobs.return_value = self.jobs()
        detail.return_value = dict(run_id=RUN, dataset_id=DATASET, status='SUCCEEDED', row_count=150852)
        result = sp.enrich_catalog(USER, self.rows)
        self.assertEqual(result[0]['storage_status'], 'READY')
        self.assertEqual(result[0]['row_count'], 150852)
        self.assertEqual(result[0]['run_id'], RUN)
        self.assertEqual(result[1], self.rows[1])
        self.assertEqual(result[0]['refresh_status'], 'FAILED')

    @patch.object(sp, 'ingest_jobs', return_value=[])
    def test_pending_does_not_become_ready_without_success(self, _jobs):
        self.assertEqual(sp.enrich_catalog(USER, self.rows), self.rows)
        with self.assertRaisesRegex(sp.StoredPreviewError, 'STORED_SNAPSHOT_NOT_READY'):
            sp._snapshot(USER, DATASET)

    @patch.object(sp, 'ingest_job')
    @patch.object(sp, 'ingest_jobs')
    def test_job_cannot_be_reassigned_to_other_dataset(self, jobs, detail):
        jobs.return_value = self.jobs()
        detail.return_value = dict(run_id=RUN, dataset_id=OTHER, status='SUCCEEDED')
        with self.assertRaisesRegex(sp.StoredPreviewError, 'STORED_SNAPSHOT_INVALID'):
            sp._snapshot(USER, DATASET)

    @patch.object(sp, '_private_page')
    @patch.object(sp, 'ingest_job')
    @patch.object(sp, 'ingest_jobs')
    def test_preview_uses_successful_run_and_reader_only(self, jobs, detail, reader):
        jobs.return_value = self.jobs()
        detail.return_value = dict(run_id=RUN, dataset_id=DATASET, status='SUCCEEDED', row_count=150852)
        columns = [{'name':'Amount','type':'decimal(18,2)'}]
        reader.return_value = dict(page=1, page_size=50, schema={'fields':[{'name':'Amount','type':'decimal(18,2)'}]},
                                   rows=[['123.40']]*50, columns=columns, preview_columns=columns, total_rows=150852,
                                   has_more=True, stable_order=True, omitted_columns=0, truncated_cells=False)
        result = sp.stored_page(USER, self.rows[0], 1)
        self.assertEqual(result['total_rows'], 150852)
        self.assertEqual(len(result['rows']), 50)
        reader.assert_called_once_with(RUN, 1)

    def test_page_limit(self):
        with self.assertRaisesRegex(sp.StoredPreviewError, 'DATASET_PAGE_INVALID'):
            sp.stored_page(USER, self.rows[0], 0)
        with self.assertRaisesRegex(sp.StoredPreviewError, 'DATASET_PAGE_INVALID'):
            sp.stored_page(USER, self.rows[0], True)


if __name__ == '__main__':
    unittest.main()
