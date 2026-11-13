"""Unified scheduler metadata via existing private BEAM Core API (never executes Spark in Flask)."""
from app.services.studio_object_access import require_access, visible_rows
import json
import re
import uuid

from app.clients.core_api_client import core_api
from app.services.studio_connections import _rows


class SchedulerError(ValueError):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.http_status = status


def _uuid(value, optional=False):
    if optional and value is None:
        return None
    try:
        if not isinstance(value, str):
            raise ValueError
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise SchedulerError('SCHEDULER_INPUT_INVALID') from None


def _rpc(action, owner, **params):
    payload = {'Action': action, 'UserID': _uuid(owner), **params}
    try:
        # Do not use the generic debug helper: schedule metadata is private to its owner.
        result = core_api.session.post(
            core_api.url,
            json={'Mode': 'CoreStudioScheduler', 'Payload': json.dumps(payload, allow_nan=False)},
            timeout=core_api.timeout,
        )
        result.raise_for_status()
        rows = _rows(result.json())
    except Exception:
        raise SchedulerError('SCHEDULER_METADATA_UNAVAILABLE', 503) from None
    if not rows or rows[0].get('success') not in (1, True):
        code = rows[0].get('code') if rows else None
        if not isinstance(code, str) or not re.fullmatch(r'SCHEDULER_[A-Z_]{2,80}', code):
            code = 'SCHEDULER_METADATA_UNAVAILABLE'
        raise SchedulerError(code, 404 if code == 'SCHEDULER_NOT_FOUND' else 503 if code == 'SCHEDULER_METADATA_UNAVAILABLE' else 400)
    return rows[0]


def status(owner):
    return _rpc('Status', owner)


def list_schedules(owner):
    return visible_rows(owner, 'SCHEDULE', json.loads(_rpc('List', owner).get('items_json') or '[]'), 'schedule_id')


def history(owner):
    return visible_rows(owner, 'SCHEDULE', json.loads(_rpc('History', owner).get('items_json') or '[]'), 'schedule_id')


def save(owner, body):
    expected = {'schedule_id', 'schedule_name', 'target_type', 'target_id',
                'pipeline_version', 'frequency', 'interval_minutes', 'time_of_day',
                'week_day', 'month_day', 'enabled', 'week_days_mask', 'repeat_minutes'}
    if not isinstance(body, dict) or not set(body).issubset(expected) or not (expected - {'week_days_mask', 'repeat_minutes'}).issubset(body):
        raise SchedulerError('SCHEDULER_INPUT_INVALID')
    name = body['schedule_name']
    target_type = body['target_type']
    frequency = body['frequency']
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 150:
        raise SchedulerError('SCHEDULER_INPUT_INVALID')
    if target_type not in ('STORED', 'PIPELINE') or frequency not in ('INTERVAL', 'DAILY', 'WEEKLY', 'MONTHLY'):
        raise SchedulerError('SCHEDULER_INPUT_INVALID')
    if type(body['enabled']) is not bool:
        raise SchedulerError('SCHEDULER_INPUT_INVALID')
    ver = body['pipeline_version']
    if (target_type == 'PIPELINE' and (type(ver) is not int or not 1 <= ver <= 2147483647)) or (target_type == 'STORED' and ver is not None):
        raise SchedulerError('SCHEDULER_INPUT_INVALID')
    interval = body['interval_minutes']
    clock = body['time_of_day']
    weekday = body['week_day']
    monthday = body['month_day']
    mask = body.get('week_days_mask')
    repeat = body.get('repeat_minutes')
    if mask is not None and (type(mask) is not int or not 1 <= mask <= 127):
        raise SchedulerError('SCHEDULER_INPUT_INVALID')
    if repeat is not None and (type(repeat) is not int or not 5 <= repeat <= 1440):
        raise SchedulerError('SCHEDULER_INPUT_INVALID')
    if frequency == 'INTERVAL':
        if type(interval) is not int or not 5 <= interval <= 10080 or any(x is not None for x in (clock, weekday, monthday, mask, repeat)):
            raise SchedulerError('SCHEDULER_INPUT_INVALID')
    else:
        if interval is not None or not isinstance(clock, str) or not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]', clock):
            raise SchedulerError('SCHEDULER_INPUT_INVALID')
        if frequency == 'WEEKLY':
            if monthday is not None or repeat is not None or (mask is None and (type(weekday) is not int or not 1 <= weekday <= 7)) or (mask is not None and weekday is not None):
                raise SchedulerError('SCHEDULER_INPUT_INVALID')
        elif frequency == 'MONTHLY':
            if type(monthday) is not int or not 1 <= monthday <= 31 or weekday is not None or mask is not None or repeat is not None:
                raise SchedulerError('SCHEDULER_INPUT_INVALID')
        elif weekday is not None or monthday is not None or mask is not None:
            raise SchedulerError('SCHEDULER_INPUT_INVALID')
    _uuid(body['target_id'])
    _uuid(body['schedule_id'], optional=True)
    if body['schedule_id'] is not None:
        require_access(owner, 'SCHEDULE', body['schedule_id'], 'edit')
    require_access(owner, 'PIPELINE' if target_type == 'PIPELINE' else 'DATASET', body['target_id'], 'execute')
    return _rpc('Save', owner, ScheduleID=_uuid(body['schedule_id'], optional=True), ScheduleName=name.strip(),
                TargetType=target_type, TargetID=_uuid(body['target_id']), PipelineVersion=ver,
                Frequency=frequency, IntervalMinutes=interval, TimeOfDay=clock, WeekDay=weekday,
                MonthDay=monthday, WeekDaysMask=(mask if mask is not None else (1 << (weekday - 1) if frequency == 'WEEKLY' else None)),
                RepeatMinutes=repeat, Enabled=body['enabled'])


def toggle(owner, schedule_id, enabled):
    if type(enabled) is not bool:
        raise SchedulerError('SCHEDULER_INPUT_INVALID')
    require_access(owner, 'SCHEDULE', schedule_id, 'edit')
    return _rpc('Toggle', owner, ScheduleID=_uuid(schedule_id), Enabled=enabled)
