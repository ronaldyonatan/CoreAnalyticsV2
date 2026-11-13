"""Data Studio metadata through BEAM; encrypt credentials before transmission."""
import base64
import os
from cryptography.fernet import Fernet
from app.services.studio_object_access import require_access, visible_rows
from app.clients.core_api_client import core_api


def _cipher():
    key = os.environ.get('STUDIO_FERNET_KEY', '').strip()
    if not key:
        raise RuntimeError('STUDIO_FERNET_KEY is required')
    return Fernet(key.encode('ascii'))


def _rows(response):
    if not isinstance(response, dict):
        raise RuntimeError('Invalid BEAM response')
    data = response.get('data', response)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    raise RuntimeError('Invalid BEAM data')


def _success(response, code):
    rows = _rows(response)
    if not rows or rows[0].get('success') not in (True, 1) or rows[0].get('code') != code:
        raise RuntimeError('BEAM metadata operation failed')
    return rows[0]


def list_connections(user_id):
    rows = _rows(core_api.list_studio_connections(user_id=user_id))
    return [{k: v for k, v in row.items() if k not in ('encrypted_password', 'password', 'password_base64', 'EncryptedPasswordBase64')} for row in visible_rows(user_id, 'CONNECTION', rows, 'connection_id')]


def create_connection(user_id, body):
    secret = _cipher().encrypt(body['password'].encode('utf-8'))
    payload = {k: v for k, v in body.items() if k != 'password'}
    payload['encrypted_password_base64'] = base64.b64encode(secret).decode('ascii')
    payload['encryption_key_version'] = 1
    return _success(core_api.create_studio_connection(user_id=user_id, record=payload), 'STUDIO_CONNECTION_CREATED')


def set_connection_active(user_id, connection_id, active):
    require_access(user_id, 'CONNECTION', connection_id, 'edit')
    return _success(core_api.set_studio_connection_active(user_id=user_id, connection_id=connection_id, active=active), 'STUDIO_CONNECTION_STATUS_UPDATED')


def update_connection(user_id, connection_id, body):
    require_access(user_id, 'CONNECTION', connection_id, 'edit')
    payload = {k: v for k, v in body.items() if k != 'password'}
    if body.get('password'):
        secret = _cipher().encrypt(body['password'].encode('utf-8'))
        payload['encrypted_password_base64'] = base64.b64encode(secret).decode('ascii')
        payload['encryption_key_version'] = 1
    return _success(core_api.update_studio_connection(user_id=user_id, connection_id=connection_id, record=payload), 'STUDIO_CONNECTION_UPDATED')
