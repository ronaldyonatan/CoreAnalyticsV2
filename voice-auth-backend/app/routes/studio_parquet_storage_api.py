"""Owner-scoped Parquet storage management endpoints."""
from app.services.studio_object_access import AccessError

from flask import Blueprint,request,jsonify
from app.routes.studio_connections_api import _principal,_mutating,_error
from app.services.studio_parquet_delete import capability,delete,DeleteError

studio_parquet_storage_bp=Blueprint('studio_parquet_storage',__name__,url_prefix='/api/studio/parquet/storage')

@studio_parquet_storage_bp.get('/capabilities')
def capabilities():
    try:
        owner=_principal()
        kind=request.args.get('kind','')
        target=request.args.get('id','')
        run_id=request.args.get('run_id','')
        return jsonify(success=True,data=capability(owner,kind,target,run_id))
    except AccessError as exc:
        return jsonify(success=False, code=str(exc)), exc.status
    except PermissionError as exc:return _error(exc)

@studio_parquet_storage_bp.post('/delete')
def erase():
    try:
        owner=_principal();_mutating()
        body=request.get_json(silent=True)
        if not isinstance(body,dict) or set(body)!={'kind','id','run_id','confirmation'} or body['confirmation']!='DELETE':
            raise DeleteError('PARQUET_DELETE_CONFIRMATION_REQUIRED',400)
        result=delete(owner,body['kind'],body['id'],body['run_id'])
        return jsonify(success=True,data=result)
    except AccessError as exc:
        return jsonify(success=False, code=str(exc)), exc.status
    except PermissionError as exc:return _error(exc)
    except DeleteError as exc:return jsonify(success=False,code=str(exc)),exc.http_status
    except Exception:return jsonify(success=False,code='PARQUET_DELETE_UNAVAILABLE'),503


@studio_parquet_storage_bp.after_request
def prevent_private_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response
