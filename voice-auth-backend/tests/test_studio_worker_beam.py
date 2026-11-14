import json
import io
from contextlib import redirect_stdout
import unittest
from unittest.mock import MagicMock, patch

from app.services import studio_worker_beam as beam
from app.services import studio_ingest_worker as ingest_worker
from app.services import studio_scheduler_worker as scheduler_worker


class WorkerBeamTests(unittest.TestCase):
    @patch.dict('os.environ', {'STUDIO_WORKER_BEAM_HMAC_KEY_HEX': 'ab' * 32})
    def test_request_is_signed_and_uses_dedicated_mode(self):
        client = MagicMock(url='https://beam.invalid', timeout=5)
        client.session.post.return_value.status_code = 200
        client.session.post.return_value.json.return_value = {'data': [{'success': 1, 'has_event': 0}]}
        self.assertEqual(beam.call({'Operation': 'SCHEDULER', 'Action': 'Tick'}, client=client)['has_event'], 0)
        body = client.session.post.call_args.kwargs['json']
        self.assertEqual(body['Mode'], 'CoreStudioWorkerRpc')
        envelope = json.loads(body['Payload'])
        self.assertEqual(json.loads(envelope['Request'])['Action'], 'Tick')
        self.assertEqual(len(envelope['Signature']), 64)

    @patch.dict('os.environ', {'STUDIO_WORKER_BEAM_HMAC_KEY_HEX': 'ab' * 32})
    def test_scheduler_accepts_existing_idle_result_shape(self):
        client = MagicMock(url='https://beam.invalid', timeout=5)
        client.session.post.return_value.status_code = 200
        client.session.post.return_value.json.return_value = {'data': [{'has_event': 0}]}
        self.assertEqual(beam.call({'Operation': 'SCHEDULER', 'Action': 'Tick'}, client=client)['has_event'], 0)

    @patch.dict('os.environ', {'STUDIO_WORKER_BEAM_HMAC_KEY_HEX': ''})
    def test_missing_key_fails_closed(self):
        client = MagicMock()
        with self.assertRaises(beam.WorkerBeamError):
            beam.call({'Operation': 'SCHEDULER', 'Action': 'Tick'}, client=client)
        client.session.post.assert_not_called()

    @patch.dict('os.environ', {'STUDIO_WORKER_BEAM_HMAC_KEY_HEX': 'ab' * 32})
    def test_denied_gateway_does_not_expose_response_or_fall_back(self):
        client = MagicMock(url='https://beam.invalid', timeout=5)
        client.session.post.return_value.status_code = 200
        client.session.post.return_value.json.return_value = {'data': [{'success': 0, 'code': 'private-details'}]}
        with self.assertRaises(beam.WorkerBeamError) as error:
            beam.call({'Operation': 'INGEST', 'Action': 'Claim'}, client=client)
        self.assertNotIn('private-details', str(error.exception))
        self.assertEqual(client.session.post.call_count, 1)

    @patch.object(beam, 'call', return_value={'success': 1, 'has_job': 0})
    def test_no_job_returns_none(self, _call):
        self.assertIsNone(beam.ingest('Claim', 'worker'))

    @patch.object(beam, 'call', return_value={'success': 1, 'has_job': 1})
    def test_incomplete_claim_fails_closed(self, _call):
        with self.assertRaises(beam.WorkerBeamError):
            beam.ingest('Claim', 'worker')

    @patch.object(beam, 'call', return_value={'success': 1, 'has_job': 0})
    def test_targeted_claim_requires_explicit_run_and_never_claims_another(self, call):
        with self.assertRaises(ValueError):
            beam.ingest('ClaimSpecific', 'worker')
        call.assert_not_called()
        self.assertIsNone(beam.ingest('ClaimSpecific', 'worker', 'run-id'))
        self.assertEqual(call.call_args.args[0]['RunID'], 'run-id')
        self.assertEqual(call.call_args.args[0]['Action'], 'ClaimSpecific')

    def test_targeted_worker_does_not_use_fifo(self):
        with patch.object(ingest_worker, 'rpc', return_value=None) as rpc:
            self.assertFalse(ingest_worker.once(None, 'worker', '/tmp', 30, 'specific-run'))
        rpc.assert_called_once_with(None, 'ClaimSpecific', 'worker', 'specific-run')

    @patch.dict('os.environ', {'STUDIO_WORKER_TRANSPORT': 'beam'})
    @patch.object(beam, 'ingest', return_value={'affected': 1})
    def test_ingest_uses_beam_without_sql_connection(self, call):
        self.assertEqual(ingest_worker.rpc(None, 'Heartbeat', 'w', 'r')['affected'], 1)
        call.assert_called_once_with('Heartbeat', 'w', 'r')

    @patch.dict('os.environ', {'STUDIO_WORKER_TRANSPORT': 'beam'})
    @patch.object(beam, 'scheduler_tick', return_value={'has_event': 0})
    def test_scheduler_uses_beam_without_sql_connection(self, call):
        self.assertEqual(scheduler_worker.tick(None)['has_event'], 0)
        call.assert_called_once_with()

    def test_ingest_logs_only_allowlisted_bind_cause(self):
        claimed = {'run_id': '44444444-4444-4444-8444-444444444444',
                   'dataset_id': '33333333-3333-4333-8333-333333333333',
                   'requested_by': '11111111-1111-4111-8111-111111111111'}
        with patch.object(ingest_worker, 'rpc', side_effect=[claimed, {'affected': 1}]), \
             patch.object(ingest_worker, 'bind_source', side_effect=ValueError('UNTRUSTED_CERT_DISABLED')), \
             patch('pathlib.Path.exists', return_value=False), redirect_stdout(io.StringIO()) as output:
            self.assertTrue(ingest_worker.once(None, 'worker', '/tmp', 30))
        self.assertIn('INGEST_BIND_CAUSE UNTRUSTED_CERT_DISABLED', output.getvalue())


if __name__ == '__main__':
    unittest.main()
