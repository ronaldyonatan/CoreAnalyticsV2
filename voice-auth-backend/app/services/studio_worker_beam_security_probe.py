"""DEV signed HEALTH-only checks; never claim or dispatch jobs."""
import json
import os
from app.clients.core_api_client import CoreApiClient
from app.services.studio_object_access import _envelope


def main():
    key = os.environ.get('STUDIO_WORKER_BEAM_HMAC_KEY_HEX', '')
    client = CoreApiClient()

    def send(envelope):
        response = client.session.post(client.url, json={'Mode': 'CoreStudioWorkerRpc',
            'Payload': json.dumps(envelope, ensure_ascii=True, separators=(',', ':'))}, timeout=client.timeout)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError('invalid response')
        rows = data.get('data', data)
        if isinstance(rows, dict):
            rows = [rows]
        if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
            raise ValueError('invalid response')
        return rows[0]

    payload = {'Operation': 'HEALTH', 'Action': 'Check'}
    wrong = _envelope(payload, key_hex=key)
    wrong['Signature'] = ('0' if wrong['Signature'][0] != '0' else '1') + wrong['Signature'][1:]
    expired = _envelope(payload, key_hex=key, issued_at='2000-01-01T00:00:00')
    fresh = _envelope(payload, key_hex=key)
    cases = [
        ('invalid_signature', send(wrong), 'WORKER_SIGNATURE_INVALID'),
        ('expired_request', send(expired), 'WORKER_INVALID_ENVELOPE'),
        ('valid_health', send(fresh), 'WORKER_BEAM_READY'),
        ('nonce_replay', send(fresh), 'WORKER_NONCE_REPLAY_OR_DB_ERROR'),
    ]
    failed = False
    for label, row, expected in cases:
        matched = row.get('code') == expected and row.get('success') in ((1, True) if label == 'valid_health' else (0, False))
        print(label + ': ' + ('PASS' if matched else 'FAIL'))
        failed |= not matched
    return 1 if failed else 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        raise SystemExit('WORKER_BEAM_SECURITY_PROBE_UNAVAILABLE') from None
