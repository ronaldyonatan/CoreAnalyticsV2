"""Authenticated Data Studio Connections endpoints, register blueprint in server.py."""
import os
from flask import Blueprint, jsonify, request
from app.services.session_security import current_session, valid_csrf
from app.services.auth_service import get_user_access_profile
from app.services import studio_connections as store
from app.connectors.registry import resolve, capabilities

studio_connections_bp = Blueprint('studio_connections', __name__, url_prefix='/api/studio/connections')


def _principal():
    session = current_session()
    if not session:
        raise PermissionError('AUTH_REQUIRED')
    user_id = session.get('user_id')
    if not user_id:
        raise PermissionError('AUTH_REQUIRED')
    access = get_user_access_profile(str(user_id))
    if 'data_studio' not in {str(m.get('route_key', '')).lower() for m in access.get('menus', []) if isinstance(m, dict)}:
        raise PermissionError('DATA_STUDIO_FORBIDDEN')
    return str(user_id)


def _error(exc):
    code = str(exc)
    return jsonify(success=False, code=code), (401 if code == 'AUTH_REQUIRED' else 403)


def _body(*, editing=False):
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValueError('JSON_OBJECT_REQUIRED')
    allowed = {'connector_type', 'connection_name', 'server_host', 'server_port', 'database_name', 'login_username', 'password', 'encrypt_transport', 'trust_server_certificate', 'connection_timeout_seconds'}
    if set(body) - allowed:
        raise ValueError('UNKNOWN_FIELDS')
    kind = body.get('connector_type', 'sqlserver')
    if kind not in ('sqlserver', 'postgresql'):
        raise ValueError('CONNECTOR_UNSUPPORTED')
    for key, limit in (('connection_name',150),('server_host',255),('database_name',128),('login_username',255)):
        if not isinstance(body.get(key), str) or not body[key].strip() or len(body[key]) > limit:
            raise ValueError('INVALID_' + key.upper())
    if (not editing or body.get('password')) and (not isinstance(body.get('password'), str) or not body['password'] or len(body['password']) > 1024):
        raise ValueError('INVALID_PASSWORD')
    for key, default, low, high in (('server_port',5432 if kind == 'postgresql' else 1433,1,65535),('connection_timeout_seconds',10,1,60)):
        val = body.get(key, default)
        if type(val) is not int or not low <= val <= high:
            raise ValueError('INVALID_' + key.upper())
    for key in ('encrypt_transport','trust_server_certificate'):
        if key in body and type(body[key]) is not bool:
            raise ValueError('INVALID_BOOLEAN')
    if body.get('trust_server_certificate', False) and os.getenv('STUDIO_ALLOW_UNTRUSTED_CERT','false').lower() != 'true':
        raise ValueError('UNTRUSTED_CERT_DISABLED')
    body['connector_type'] = kind
    return body


def _mutating():
    if not valid_csrf():
        raise PermissionError('CSRF_ORIGIN_REJECTED')


def _target(body):
    return resolve(body.get('connector_type', 'sqlserver')).make_target(body)


@studio_connections_bp.get('/connector-capabilities')
def connector_capabilities():
    try:
        _principal()
        resolve('postgresql')
        return jsonify(success=True, data=capabilities())
    except PermissionError as exc:
        return _error(exc)


@studio_connections_bp.get('')
def list_connections():
    try:
        return jsonify(success=True, data=store.list_connections(_principal()))
    except PermissionError as exc:
        return _error(exc)
    except Exception:
        return jsonify(success=False, code='METADATA_UNAVAILABLE'), 503


@studio_connections_bp.post('')
def create_connection():
    try:
        user_id = _principal()
        _mutating()
        body = _body()
        resolve(body['connector_type']).validate_target(_target(body))
        return jsonify(success=True, data=store.create_connection(user_id, body)), 201
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return jsonify(success=False, code=str(exc)), getattr(exc, 'http_status', 400)
    except Exception:
        return jsonify(success=False, code='METADATA_UNAVAILABLE'), 503


@studio_connections_bp.patch('/<uuid:connection_id>/active')
def set_active(connection_id):
    try:
        user_id = _principal()
        _mutating()
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'is_active'} or type(body['is_active']) is not bool:
            raise ValueError('INVALID_STATUS')
        return jsonify(success=True, data=store.set_connection_active(user_id, str(connection_id), body['is_active']))
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return jsonify(success=False, code=str(exc)), 400
    except Exception:
        return jsonify(success=False, code='METADATA_UNAVAILABLE'), 503


@studio_connections_bp.post('/test')
def test_connection():
    try:
        _principal()
        _mutating()
        body = _body()
        # Test and Save use the same central network/port/TLS policy.
        return jsonify(resolve(body['connector_type']).test_connection(_target(body)))
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return jsonify(success=False, code=str(exc)), getattr(exc, 'http_status', 400)
    except Exception:
        return jsonify(success=False, code='CONNECTION_TEST_UNAVAILABLE'), 503

@studio_connections_bp.patch('/<uuid:connection_id>')
def edit_connection(connection_id):
    try:
        user_id = _principal()
        _mutating()
        body = _body(editing=True)
        existing = next((x for x in store.list_connections(user_id) if str(x.get('connection_id', '')).lower() == str(connection_id).lower()), None)
        if not existing:
            raise ValueError('STUDIO_CONNECTION_NOT_FOUND')
        if body['connector_type'].upper() != existing['connection_type'].upper():
            raise ValueError('CONNECTOR_TYPE_IMMUTABLE')
        # Validate network policy for edited endpoints even if password is unchanged.
        validation_body = {**body, 'password': body.get('password') or 'UNCHANGED_SECRET'}
        resolve(body['connector_type']).validate_target(_target(validation_body))
        if not body.get('password'):
            body.pop('password', None)
        return jsonify(success=True, data=store.update_connection(user_id, str(connection_id), body))
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return jsonify(success=False, code=str(exc)), getattr(exc, 'http_status', 400)
    except Exception:
        return jsonify(success=False, code='METADATA_UNAVAILABLE'), 503
