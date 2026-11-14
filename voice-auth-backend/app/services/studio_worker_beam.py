"""Signed, private BEAM transport for ingest workers and scheduler ticks.

This transport is opt-in until the matching SQL gateway has been installed and
integration-tested. Never print the request envelope or its signing key.
"""
import json
import os

from app.services.studio_object_access import _envelope


class WorkerBeamError(RuntimeError):
    pass


def call(payload, *, client=None):
    key = os.environ.get('STUDIO_WORKER_BEAM_HMAC_KEY_HEX', '')
    try:
        envelope = _envelope(payload, key_hex=key)
        if client is None:
            from app.clients.core_api_client import CoreApiClient
            client = CoreApiClient()
        response = client.session.post(
            client.url,
            json={'Mode': 'CoreStudioWorkerRpc',
                  'Payload': json.dumps(envelope, ensure_ascii=True, separators=(',', ':'))},
            timeout=client.timeout,
        )
        if response.status_code >= 400:
            raise WorkerBeamError('WORKER_BEAM_HTTP_' + str(response.status_code))
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError('Invalid BEAM response')
        data = data.get('data', data)
        rows = data if isinstance(data, list) else [data]
        if len(rows) != 1 or not isinstance(rows[0], dict):
            raise ValueError('Worker RPC denied')
        row = rows[0]
        scheduler_result = (payload.get('Operation') == 'SCHEDULER'
                            and row.get('has_event') in (0, 1, False, True)
                            and ('success' not in row or row['success'] in (1, True)))
        if not scheduler_result and row.get('success') not in (1, True):
            safe_codes = {'WORKER_INVALID_ENVELOPE', 'WORKER_GATEWAY_DISABLED',
                          'WORKER_SIGNATURE_INVALID', 'WORKER_NONCE_REPLAY_OR_DB_ERROR',
                          'WORKER_OPERATION_FAILED'}
            code = row.get('code')
            raise WorkerBeamError(code if code in safe_codes else 'WORKER_BEAM_RPC_DENIED')
        return row
    except WorkerBeamError:
        raise
    except Exception:
        # Never include HTTP, SQL, or signature details in logs.
        raise WorkerBeamError('WORKER_BEAM_RPC_UNAVAILABLE') from None


def ingest(action, worker_id, run_id=None, **values):
    if action not in {'Claim', 'ClaimSpecific', 'Heartbeat', 'Complete', 'Fail'}:
        raise ValueError('INGEST_WORKER_ACTION_INVALID')
    if action == 'ClaimSpecific' and not run_id:
        raise ValueError('INGEST_RUN_REQUIRED')
    request = {'Operation': 'INGEST', 'Action': action, 'WorkerID': worker_id,
               'RunID': run_id, 'RowCount': values.get('row_count'),
               'SchemaJson': values.get('schema_json'),
               'StorageRelativePath': values.get('storage_relative_path'),
               'ErrorCode': values.get('error_code')}
    result = call(request)
    if action in {'Claim', 'ClaimSpecific'}:
        if result.get('has_job') in (0, False):
            return None
        if result.get('has_job') not in (1, True) or not all(result.get(k) for k in ('run_id', 'dataset_id', 'requested_by')):
            raise WorkerBeamError('WORKER_BEAM_RESPONSE_INVALID')
    elif result.get('affected') not in (0, 1):
        raise WorkerBeamError('WORKER_BEAM_RESPONSE_INVALID')
    return result


def scheduler_tick():
    result = call({'Operation': 'SCHEDULER', 'Action': 'Tick'})
    if result.get('has_event') not in (0, 1, False, True):
        raise WorkerBeamError('WORKER_BEAM_RESPONSE_INVALID')
    return result


if __name__ == '__main__':
    try:
        row = call({'Operation': 'HEALTH', 'Action': 'Check'})
        if row.get('code') != 'WORKER_BEAM_READY':
            raise WorkerBeamError('WORKER_BEAM_RESPONSE_INVALID')
        print('WORKER_BEAM_HEALTH_OK')
    except WorkerBeamError:
        raise SystemExit('WORKER_BEAM_HEALTH_FAILED') from None
