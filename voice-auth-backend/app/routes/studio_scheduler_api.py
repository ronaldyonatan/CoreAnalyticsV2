"""Owner-scoped scheduler UI; no background jobs run inside the HTTP process."""
from functools import wraps
from flask import Blueprint, jsonify, request
from app.routes.studio_connections_api import _principal, _mutating, _error
from app.services import studio_scheduler as scheduler

studio_scheduler_bp = Blueprint('studio_scheduler', __name__, url_prefix='/api/studio/scheduler')


def endpoint(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        try:
            owner = _principal()
            if request.method != 'GET':
                _mutating()
            result = fn(owner, *args, **kwargs)
            resp = jsonify(success=True, data=result)
            resp.headers['Cache-Control'] = 'no-store'
            return resp
        except PermissionError as exc:
            return _error(exc)
        except scheduler.SchedulerError as exc:
            return jsonify(success=False, code=str(exc)), exc.http_status
        except Exception:
            return jsonify(success=False, code='SCHEDULER_METADATA_UNAVAILABLE'), 503
    return wrapped


@studio_scheduler_bp.get('/status')
@endpoint
def status(owner):
    return scheduler.status(owner)


@studio_scheduler_bp.get('')
@endpoint
def list_schedules(owner):
    return scheduler.list_schedules(owner)


@studio_scheduler_bp.get('/history')
@endpoint
def history(owner):
    return scheduler.history(owner)


@studio_scheduler_bp.post('')
@endpoint
def save(owner):
    return scheduler.save(owner, request.get_json(silent=True))


@studio_scheduler_bp.post('/<uuid:schedule_id>/toggle')
@endpoint
def toggle(owner, schedule_id):
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) != {'enabled'}:
        raise scheduler.SchedulerError('SCHEDULER_INPUT_INVALID')
    return scheduler.toggle(owner, str(schedule_id), body['enabled'])
