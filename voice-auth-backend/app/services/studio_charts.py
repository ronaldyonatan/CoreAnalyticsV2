"""Chart catalog metadata via the existing private Core API and SQL Server RPC."""
from app.services.studio_object_access import require_access, visible_rows
import json
import uuid
from app.clients.core_api_client import core_api
from app.services.studio_connections import _rows

class ChartError(ValueError):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.http_status=status


def _identifier(value):
    try:return str(uuid.UUID(str(value)))
    except (ValueError,TypeError):raise ChartError('CHART_ID_INVALID') from None


def rpc(action,user,**fields):
    payload={'Action':action,'UserID':_identifier(user),**fields}
    try:
        rows=_rows(core_api._post_mode('CoreStudioCharts',payload))
    except Exception:
        raise ChartError('CHART_METADATA_UNAVAILABLE',503) from None
    if not rows or rows[0].get('success') not in (True,1):
        code=rows[0].get('code') if rows else None
        if not isinstance(code,str) or not code.startswith('CHART_'):code='CHART_METADATA_UNAVAILABLE'
        raise ChartError(code,404 if code.endswith('NOT_FOUND') else 409 if code.endswith('CONFLICT') else 503)
    return dict(rows[0])


def list_charts(user):
    response=rpc('List',user)
    try:return visible_rows(user, 'CHART', json.loads(response.get('items_json') or '[]'), 'chart_id')
    except (TypeError,ValueError):raise ChartError('CHART_METADATA_UNAVAILABLE',503) from None


def get_chart(user,chart_id):
    chart_id = _identifier(chart_id)
    require_access(user, 'CHART', chart_id)
    row=rpc('Get',user,ChartID=_identifier(chart_id))
    try:
        return {'chart_id':_identifier(row['chart_id']),'name':row['chart_name'],
                'version':int(row['version']),'created_at':str(row['created_at']),
                'updated_at':str(row['updated_at']),
                'config':json.loads(row['config_json'])}
    except (KeyError,TypeError,ValueError):raise ChartError('CHART_METADATA_UNAVAILABLE',503) from None


def save_chart(user,name,spec,chart_id=None,expected_version=0):
    if not isinstance(name,str) or not name.strip() or len(name)>150:
        raise ChartError('CHART_NAME_INVALID')
    if type(expected_version)is not int or not 0<=expected_version<2**31-1:
        raise ChartError('CHART_VERSION_INVALID')
    if chart_id:require_access(user, 'CHART', chart_id, 'edit')
    return rpc('Save',user,ChartID=_identifier(chart_id) if chart_id else None,
               ChartName=name.strip(),ConfigJSON=json.dumps(spec,ensure_ascii=False,allow_nan=False),
               ExpectedVersion=expected_version)


def delete_chart(user,chart_id):
    chart_id = _identifier(chart_id)
    require_access(user, 'CHART', chart_id, 'delete')
    return rpc('Delete',user,ChartID=_identifier(chart_id))
