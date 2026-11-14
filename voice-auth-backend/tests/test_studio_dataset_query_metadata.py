import hashlib
import hmac
import json
import unittest
from unittest.mock import MagicMock, patch

from app.services import studio_dataset_query_metadata as metadata
from app.services.studio_source_query_validation import SourceQueryError

ACTOR = '11111111-1111-4111-8111-111111111111'
CONNECTION = '22222222-2222-4222-8222-222222222222'
DATASET = '33333333-3333-4333-8333-333333333333'
KEY = 'AB' * 32


class DatasetQueryMetadataTests(unittest.TestCase):
    def test_disabled_by_default_never_calls_beam(self):
        with patch.dict('os.environ', {}, clear=True), patch.object(metadata, 'CoreApiClient') as client:
            with self.assertRaisesRegex(metadata.DatasetQueryMetadataError, 'DATASET_QUERY_METADATA_DISABLED'):
                metadata.create_definition(ACTOR, CONNECTION, 'Example', '', 'SELECT 1')
        client.assert_not_called()

    def test_create_signs_domain_separated_request_without_debug_client(self):
        client, response = MagicMock(), MagicMock()
        response.json.return_value = {'data': [{'success': True, 'code': 'DATASET_QUERY_CREATED', 'dataset_id': DATASET}]}
        client.session.post.return_value = response
        env = {'STUDIO_DATASET_QUERY_METADATA_ENABLED': 'true', 'STUDIO_OBJECT_ACCESS_BEAM_HMAC_KEY_HEX': KEY}
        with patch.dict('os.environ', env, clear=True), patch.object(metadata, 'CoreApiClient', return_value=client):
            result = metadata.create_definition(ACTOR, CONNECTION, ' Example ', '', 'SELECT 1')
        self.assertEqual(result, {'dataset_id': DATASET})
        kwargs = client.session.post.call_args.kwargs
        self.assertEqual(kwargs['json']['Mode'], 'CoreStudioDatasetQuery')
        envelope = json.loads(kwargs['json']['Payload'])
        request = json.loads(envelope['Request'])
        self.assertEqual(request['Purpose'], 'DATASET_QUERY_V1')
        self.assertEqual(request['ActorUserID'], ACTOR)
        self.assertEqual(request['Query'], 'SELECT 1')
        message = f"{envelope['IssuedAtUtc']}|{envelope['Nonce']}|{envelope['Request']}".encode('utf-16le')
        self.assertEqual(envelope['Signature'], hmac.new(bytes.fromhex(KEY), message, hashlib.sha256).hexdigest().upper())
        client._post_mode.assert_not_called()

    def test_invalid_query_is_not_sent(self):
        with patch.object(metadata, '_call') as call:
            with self.assertRaises(SourceQueryError):
                metadata.create_definition(ACTOR, CONNECTION, 'Example', '', 'SELECT 1; DELETE FROM t')
        call.assert_not_called()

    def test_signed_purpose_cannot_be_overridden(self):
        with patch.dict('os.environ', {'STUDIO_DATASET_QUERY_METADATA_ENABLED': 'true'}, clear=True), \
             patch.object(metadata, '_envelope') as envelope:
            with self.assertRaisesRegex(metadata.DatasetQueryMetadataError, 'DATASET_QUERY_REQUEST_INVALID'):
                metadata._call({'Purpose': 'OTHER'})
        envelope.assert_not_called()

    def test_get_rejects_mismatched_dataset(self):
        row = {'success': True, 'code': 'DATASET_QUERY_INFO', 'dataset_id': CONNECTION,
               'connection_id': CONNECTION, 'dialect': 'sqlserver', 'source_query': 'SELECT 1'}
        with patch.object(metadata, '_call', return_value=row):
            with self.assertRaisesRegex(metadata.DatasetQueryMetadataError, 'DATASET_QUERY_RESPONSE_INVALID'):
                metadata.read_definition(ACTOR, DATASET)

    def test_script_metadata_preserves_temporary_table_batch(self):
        script = 'SELECT 1 AS x INTO #work; SELECT x FROM #work;'
        created = {'success':True, 'code':'DATASET_QUERY_CREATED', 'dataset_id':DATASET}
        with patch.object(metadata, '_call', return_value=created) as call:
            result = metadata.create_script_definition(ACTOR, CONNECTION, 'Example', '', script)
        self.assertEqual(result, {'dataset_id':DATASET})
        self.assertEqual(call.call_args.args[0]['Query'], script)
        row = {'success':True, 'code':'DATASET_QUERY_INFO', 'dataset_id':DATASET,
               'connection_id':CONNECTION, 'dialect':'sqlserver', 'source_query':script}
        with patch.object(metadata, '_call', return_value=row):
            self.assertEqual(metadata.read_script_definition(ACTOR, DATASET)['query'], script)


if __name__ == '__main__':
    unittest.main()
