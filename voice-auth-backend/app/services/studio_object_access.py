"""CoreAnalyticsV2 Ownership metadata through BEAM/spDashboard only.

No direct SQL connection. Privileged requests carry a one-time HMAC-SHA256
signature validated by studio.spObjectAccessRpc in SQL Server. The actor comes
only from the BEAM-verified Flask session, never from browser JSON.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from app.clients.core_api_client import CoreApiClient


class AccessError(RuntimeError):
    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.status = status


def _enabled(name: str) -> bool:
    return os.environ.get(name, 'false').strip().lower() == 'true'


def _guid(value: Any) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise AccessError('INVALID_UUID', 400) from None


def _row(response: Any) -> dict[str, Any]:
    if not isinstance(response, dict):
        raise AccessError('BEAM_RESPONSE_INVALID', 503)
    data = response.get('data')
    if isinstance(data, list):
        row = data[0] if data else None
    elif isinstance(data, dict):
        row = data
    else:
        row = response if 'success' in response else None
    if not isinstance(row, dict) or row.get('success') not in (True, 1):
        if isinstance(row, dict) and row.get('code'):
            code = str(row['code'])
            if code in ('OWNER_REQUIRED', 'OBJECT_ACCESS_DENIED', 'OBJECT_ACCESS_OPERATION_DENIED', 'OBJECT_ACCESS_ACTOR_INACTIVE'):
                raise AccessError(code, 403)
            if code in ('OBJECT_NOT_REGISTERED',):
                raise AccessError(code, 404)
            if code in ('OBJECT_ACCESS_GATEWAY_DISABLED',):
                raise AccessError(code, 503)
        raise AccessError('BEAM_OWNERSHIP_OPERATION_FAILED', 503)
    return row


def _envelope(request_payload: dict[str, Any], *, key_hex: str | None = None,
              issued_at: str | None = None, nonce: str | None = None) -> dict[str, str]:
    """Produce the signed envelope consumed by the SQL 027 RPC gateway.

    SQL NVARCHAR uses UTF-16LE. Sign precisely the Request JSON string bytes.
    """
    secret_hex = key_hex if key_hex is not None else os.environ.get('STUDIO_OBJECT_ACCESS_BEAM_HMAC_KEY_HEX', '')
    try:
        secret = bytes.fromhex(secret_hex.strip())
    except ValueError:
        secret = b''
    if len(secret) != 32:
        raise AccessError('BEAM_OWNERSHIP_HMAC_KEY_NOT_CONFIGURED', 503)

    request_json = json.dumps(request_payload, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    timestamp = issued_at or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')
    nonce_id = _guid(nonce if nonce is not None else uuid.uuid4())
    message = f'{timestamp}|{nonce_id}|{request_json}'.encode('utf-16le')
    signature = hmac.new(secret, message, hashlib.sha256).hexdigest().upper()
    return {'Request': request_json, 'IssuedAtUtc': timestamp,
            'Nonce': nonce_id, 'Signature': signature}


def execute(actor_user_id: str, action: str, object_type: str, object_id: Any,
            *, principal_type: str | None = None, principal_id: Any = None,
            access_role: str | None = None, new_owner_user_id: Any = None) -> dict[str, Any]:
    if not _enabled('STUDIO_OBJECT_ACCESS_BEAM_ENABLED'):
        raise AccessError('BEAM_OWNERSHIP_DISABLED', 503)
    action = str(action or '').upper()
    object_type = str(object_type or '').upper()
    if object_type not in {'CONNECTION', 'DATASET', 'PIPELINE', 'SCHEDULE', 'CHART', 'DASHBOARD'}:
        raise AccessError('INVALID_OBJECT_TYPE')
    if action not in {'GET', 'CHECK', 'REGISTER', 'GRANT', 'REVOKE'}:
        raise AccessError('ACTION_NOT_ENABLED', 403)
    if action == 'REGISTER' and not _enabled('STUDIO_OBJECT_ACCESS_REGISTRATION_ENABLED'):
        raise AccessError('REGISTRATION_NOT_ENABLED', 503)
    if action in {'GRANT', 'REVOKE'} and not _enabled('STUDIO_OBJECT_ACCESS_MUTATIONS_ENABLED'):
        raise AccessError('MUTATIONS_NOT_ENABLED', 503)

    # The browser must never supply actor/owner identity. This ID is from session.
    body: dict[str, Any] = {
        'ActorUserID': _guid(actor_user_id), 'Action': action,
        'ObjectType': object_type, 'ObjectID': _guid(object_id),
    }
    if principal_type is not None:
        pt = str(principal_type).upper()
        if pt not in ('USER', 'GROUP'):
            raise AccessError('INVALID_PRINCIPAL_TYPE')
        body['PrincipalType'] = pt
    if principal_id is not None:
        body['PrincipalID'] = _guid(principal_id)
    if access_role is not None:
        role = str(access_role).upper()
        if role not in ('VIEWER', 'EDITOR'):
            raise AccessError('INVALID_ACCESS_ROLE')
        # Current product policy: every recipient may edit/run; legacy VIEWER is compatible.
        body['AccessRole'] = 'EDITOR' if action == 'GRANT' else role
    if new_owner_user_id is not None:
        raise AccessError('OWNERSHIP_CHANGES_NOT_ENABLED', 403)

    payload = _envelope(body)
    client = CoreApiClient()
    # Call the existing BEAM URL and headers without CoreApiClient._post_mode's
    # debug printer, which would otherwise log a replayable signed payload.
    try:
        resp = client.session.post(
            client.url,
            json={'Mode': 'CoreStudioObjectAccess',
                  'Payload': json.dumps(payload, ensure_ascii=True, separators=(',', ':'))},
            timeout=client.timeout,
        )
        resp.raise_for_status()
        result = resp.json()
    except Exception:
        raise AccessError('BEAM_OWNERSHIP_UNAVAILABLE', 503) from None
    row = _row(result)
    if action == 'GET':
        if row.get('code') != 'ACCESS_INFO':
            raise AccessError('BEAM_RESPONSE_INVALID', 503)
        try:
            shares = json.loads(row.get('shares_json') or '[]')
        except (ValueError, TypeError):
            raise AccessError('BEAM_RESPONSE_INVALID', 503) from None
        if not isinstance(shares, list):
            raise AccessError('BEAM_RESPONSE_INVALID', 503)
        owner_id = str(row.get('owner_user_id') or '')
        return {'owner_user_id': owner_id,
                'is_admin': bool(row.get('is_admin')),
                'can_manage_sharing': owner_id.lower() == _guid(actor_user_id).lower(),
                'shares': shares}
    if action == 'CHECK':
        if row.get('action_type') != 'CHECK' or row.get('effective_role') not in {'ADMIN','OWNER','EDITOR','VIEWER'}:
            raise AccessError('BEAM_RESPONSE_INVALID', 503)
        return {'effective_role': row['effective_role']}
    if row.get('action_type') != action:
        raise AccessError('BEAM_RESPONSE_INVALID', 503)
    return {'action_type': action}


def require_access(actor, object_type, object_id, operation='read'):
    """Fresh signed SQL check. Every explicit recipient may read/edit/execute.

    Delete/sharing remain primary-owner-only; Admin alone is read-only.
    Resolve primary ownership defensively for older CHECK deployments.
    Never cache grants: revocation applies on the next request.
    """
    if operation not in {'read', 'edit', 'execute', 'delete', 'share'}:
        raise AccessError('INVALID_ACCESS_OPERATION', 400)
    actor = _guid(actor)
    object_id = _guid(object_id)
    role = execute(actor, 'CHECK', object_type, object_id).get('effective_role')
    allowed = {'read': {'VIEWER', 'EDITOR', 'OWNER', 'ADMIN'},
               'edit': {'VIEWER', 'EDITOR', 'OWNER'}, 'execute': {'VIEWER', 'EDITOR', 'OWNER'},
               'delete': {'OWNER'}, 'share': {'OWNER'}}[operation]
    if role == 'ADMIN' and operation != 'read':
        info = execute(actor, 'GET', object_type, object_id)
        if str(info.get('owner_user_id', '')).lower() == actor:
            role = 'OWNER'
    if role not in allowed:
        raise AccessError('OBJECT_ACCESS_DENIED', 403)
    return role


def visible_rows(actor, object_type, rows, id_field):
    """Defense in depth for unpaginated legacy catalogs; SQL filtering still required.

    A malformed catalog is an outage, never an authorization bypass. Only an
    explicit denial hides a row; failed authorization fails the whole request.
    """
    if not isinstance(rows, list):
        raise AccessError('BEAM_RESPONSE_INVALID', 503)
    visible = []
    for row in rows:
        if not isinstance(row, dict) or not row.get(id_field):
            raise AccessError('BEAM_RESPONSE_INVALID', 503)
        try:
            require_access(actor, object_type, row[id_field])
        except AccessError as exc:
            if exc.status in (403, 404):
                continue
            raise
        visible.append(row)
    return visible
