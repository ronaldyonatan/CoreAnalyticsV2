"""Session-authenticated Dashboard Designer routes; owner-only DEV scope."""
from flask import Blueprint, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge
from app.routes.studio_connections_api import _principal, _mutating, _error
from app.services.studio_object_access import AccessError
from app.services.studio_charts import ChartError
from app.services.studio_dashboard_designer import DashboardError, list_dashboards, get_dashboard, save_dashboard, delete_dashboard

studio_dashboard_designer_bp = Blueprint('studio_dashboard_designer', __name__, url_prefix='/api/studio/designer/dashboards')


def dispatch(fn):
    from functools import wraps
    @wraps(fn)
    def wrapped(*args, **kwargs):
        try:
            actor = _principal()
            if request.method not in ('GET', 'HEAD'):
                _mutating()
                request.max_content_length = 8_000_000
            response = jsonify(success=True, data=fn(actor, *args, **kwargs))
            response.headers['Cache-Control'] = 'no-store'
            return response
        except PermissionError as exc:
            return _error(exc)
        except AccessError as exc:
            return jsonify(success=False, code=str(exc)), exc.status
        except DashboardError as exc:
            return jsonify(success=False, code=str(exc)), exc.http_status
        except ChartError as exc:
            return jsonify(success=False, code=str(exc)), exc.http_status
        except RequestEntityTooLarge:
            return jsonify(success=False, code='DASHBOARD_DOCUMENT_TOO_LARGE'), 413
        except Exception:
            return jsonify(success=False, code='DASHBOARD_SERVICE_UNAVAILABLE'), 503
    return wrapped


@studio_dashboard_designer_bp.get('')
@dispatch
def index(actor):
    return list_dashboards(actor)


@studio_dashboard_designer_bp.get('/<uuid:dashboard_id>')
@dispatch
def get(actor, dashboard_id):
    return get_dashboard(actor, str(dashboard_id))


@studio_dashboard_designer_bp.post('')
@dispatch
def create(actor):
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) not in ({'name', 'document'}, {'name', 'document', 'dashboard_id'}):
        raise DashboardError('DASHBOARD_INPUT_INVALID')
    return save_dashboard(actor, body['name'], body['document'], body.get('dashboard_id'))


@studio_dashboard_designer_bp.put('/<uuid:dashboard_id>')
@dispatch
def update(actor, dashboard_id):
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) != {'name', 'document', 'expected_version'}:
        raise DashboardError('DASHBOARD_INPUT_INVALID')
    return save_dashboard(actor, body['name'], body['document'], str(dashboard_id), body['expected_version'])


@studio_dashboard_designer_bp.delete('/<uuid:dashboard_id>')
@dispatch
def remove(actor, dashboard_id):
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) != {'expected_version'}:
        raise DashboardError('DASHBOARD_INPUT_INVALID')
    return delete_dashboard(actor, str(dashboard_id), body['expected_version'])
