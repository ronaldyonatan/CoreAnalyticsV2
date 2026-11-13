"""Direct-ingest metadata RPC; deliberately does not start Spark yet."""
from app.services.studio_object_access import require_access, visible_rows
import json
import uuid
from app.clients.core_api_client import core_api
from app.services.studio_connections import _rows

class IngestError(ValueError):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.http_status=status

def _id(value):
    try:
        if not isinstance(value,str): raise ValueError()
        return str(uuid.UUID(value))
    except (ValueError,AttributeError,TypeError):
        raise IngestError('INGEST_INVALID_REQUEST') from None

def call(action,user,**kwargs):
    payload={'Action':action,'UserID':_id(user),**kwargs}
    try:
        response=core_api.session.post(core_api.url,json={'Mode':'CoreStudioIngest','Payload':json.dumps(payload)},timeout=core_api.timeout)
        response.raise_for_status()
        rows=_rows(response.json())
    except Exception:
        raise IngestError('INGEST_METADATA_UNAVAILABLE',503) from None
    if not rows or rows[0].get('success') not in (True,1):
        code=rows[0].get('code') if rows else None
        if not isinstance(code,str) or not code.startswith('INGEST_'): code='INGEST_METADATA_UNAVAILABLE'
        raise IngestError(code,404 if code.endswith('NOT_FOUND') else 409 if code in ('INGEST_ALREADY_PENDING','INGEST_REQUEST_REUSED') else 503 if code=='INGEST_METADATA_UNAVAILABLE' else 400)
    return rows[0]

def submit(user,dataset_id,request_id):
    require_access(user, 'DATASET', dataset_id, 'execute')
    return call('Submit',user,DatasetID=_id(dataset_id),RequestID=_id(request_id))

def jobs(user):
    return visible_rows(user, 'DATASET', json.loads(call('Jobs',user).get('items_json') or '[]'), 'dataset_id')

def job(user,run_id):
    row = call('Job',user,RunID=_id(run_id))
    require_access(user, 'DATASET', row.get('dataset_id'))
    return row
