"""Owner/administrator metadata API; no data-plane sharing is enabled yet."""
from flask import Blueprint, jsonify, request

from app.routes.studio_connections_api import _principal, _mutating
from app.services.studio_object_access import execute, AccessError

studio_object_access_bp = Blueprint(
    'studio_object_access', __name__, url_prefix='/api/studio/object-access'
)


def _error(exc):
    if isinstance(exc, PermissionError):
        code = str(exc)
        return jsonify(success=False, code=code), 401 if code == 'AUTH_REQUIRED' else 403
    return jsonify(success=False, code=str(exc)), exc.status


def _result(data, status=200):
    result = jsonify(success=True, data=data)
    result.headers['Cache-Control'] = 'no-store'
    return result, status


def _assert_owner(actor, object_type, object_id):
    """Only the recorded primary owner can manage sharing, including for admins.

    Do not use CHECK's effective_role: group ADMIN can mask ownership.
    The signed gateway GET is authoritative for the owner GUID.
    """
    info = execute(actor, 'GET', object_type, object_id)
    if str(info.get('owner_user_id') or '').lower() != str(actor).lower():
        raise AccessError('OWNER_REQUIRED', 403)
    return info


def _payload():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) - {'action', 'principal_type', 'principal_id', 'access_role'}:
        raise AccessError('INVALID_FIELDS')
    action = str(data.get('action') or '').upper()
    expected = {
        'GRANT': {'action', 'principal_type', 'principal_id', 'access_role'},
        'REVOKE': {'action', 'principal_type', 'principal_id'},
    }
    if action not in expected or set(data) != expected[action]:
        raise AccessError('INVALID_FIELDS_FOR_ACTION')
    return action, data


@studio_object_access_bp.route('/<object_type>/<uuid:object_id>', methods=['GET','POST'])
def object_access(object_type, object_id):
    try:
        actor = _principal()
        if request.method == 'GET':
            return _result(execute(actor,'GET',object_type,object_id))
        _mutating()
        action, data = _payload()
        _assert_owner(actor, object_type, object_id)
        return _result(execute(actor, action, object_type, object_id,
                               principal_type=data['principal_type'],
                               principal_id=data['principal_id'],
                               access_role=data.get('access_role')))
    except (PermissionError, AccessError) as exc:
        return _error(exc)


@studio_object_access_bp.get('/<object_type>/<uuid:object_id>/check')
def object_access_check(object_type,object_id):
    try:
        return _result(execute(_principal(),'CHECK',object_type,object_id))
    except (PermissionError, AccessError) as exc:
        return _error(exc)


@studio_object_access_bp.post('/<object_type>/<uuid:object_id>/register')
def register_ownership(object_type,object_id):
    try:
        actor = _principal()
        _mutating()
        if request.get_data(cache=False) not in (b'',b'{}'):
            raise AccessError('REGISTER_BODY_NOT_ALLOWED')
        return _result(execute(actor,'REGISTER',object_type,object_id),201)
    except (PermissionError, AccessError) as exc:
        return _error(exc)

@studio_object_access_bp.get('/<object_type>/<uuid:object_id>/directory')
def ownership_user_directory(object_type, object_id):
    """Limited active-user picker for object Owner/Admin only; never exposes emails or login secrets."""
    try:
        actor = _principal()
        _assert_owner(actor, object_type, object_id)
        search = str(request.args.get('search', '')).strip()
        if len(search) > 100:
            raise AccessError('SEARCH_TOO_LONG', 400)
        from app.clients.core_api_client import core_api
        from app.routes.management_api import _data_rows
        response = core_api.list_users(page=1, page_size=30, search=search, status='active')
        if not isinstance(response, dict) or response.get('success') is False:
            raise AccessError('DIRECTORY_UNAVAILABLE', 503)
        rows = _data_rows(response)
        directory = []
        for row in rows:
            if not row.get('user_id') or not row.get('is_active') or row.get('is_locked'):
                continue
            directory.append({
                'user_id': str(row['user_id']),
                'username': str(row.get('username') or ''),
                'display_name': str(row.get('display_name') or row.get('username') or ''),
            })
        return _result(directory)
    except (PermissionError, AccessError) as exc:
        return _error(exc)
    except Exception:
        return jsonify(success=False, code='DIRECTORY_UNAVAILABLE'), 503
