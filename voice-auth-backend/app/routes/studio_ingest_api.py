"""Stage 2C.2 metadata endpoints (no execution)."""
from app.services.studio_object_access import AccessError

import uuid
from flask import Blueprint,jsonify,request
from app.routes.studio_connections_api import _principal,_mutating,_error
from app.services.studio_dataset_ingest import submit,jobs,job,IngestError

studio_ingest_bp=Blueprint('studio_ingest',__name__,url_prefix='/api/studio/ingest')

@studio_ingest_bp.post('/submit')
def submit_job():
    try:
        user=_principal();_mutating()
        body=request.get_json(silent=True)
        if not isinstance(body,dict) or set(body)!={'dataset_id','request_id'}: raise IngestError('INGEST_INVALID_REQUEST')
        result=submit(user,body['dataset_id'],body['request_id'])
        return jsonify(success=True,data=result),202
    except AccessError as exc:
        return jsonify(success=False, code=str(exc)), exc.status
    except PermissionError as exc:return _error(exc)
    except IngestError as exc:return jsonify(success=False,code=str(exc)),exc.http_status

@studio_ingest_bp.get('/jobs')
def list_jobs():
    try:return jsonify(success=True,data=jobs(_principal()))
    except AccessError as exc:
        return jsonify(success=False, code=str(exc)), exc.status
    except PermissionError as exc:return _error(exc)
    except IngestError as exc:return jsonify(success=False,code=str(exc)),exc.http_status

@studio_ingest_bp.get('/jobs/<uuid:run_id>')
def get_job(run_id):
    try:return jsonify(success=True,data=job(_principal(),str(run_id)))
    except AccessError as exc:
        return jsonify(success=False, code=str(exc)), exc.status
    except PermissionError as exc:return _error(exc)
    except IngestError as exc:return jsonify(success=False,code=str(exc)),exc.http_status


@studio_ingest_bp.after_request
def prevent_private_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response
