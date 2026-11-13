"""Pipeline persistence and durable job submission; long jobs never run inside Flask requests."""
from app.services.studio_object_access import AccessError

from flask import Blueprint,jsonify,request
from app.routes.studio_connections_api import _principal,_mutating,_error
from app.services.studio_pipelines import pipeline_store,PipelineError

studio_pipelines_bp=Blueprint('studio_pipelines',__name__,url_prefix='/api/studio/pipelines')


def endpoint(fn):
    from functools import wraps
    @wraps(fn)
    def wrapped(*args,**kwargs):
        try:
            owner=_principal()
            if request.method!='GET':_mutating()
            result=fn(owner,*args,**kwargs)
            response=jsonify(success=True,data=result);response.headers['Cache-Control']='no-store';return response
        except AccessError as exc:return jsonify(success=False,code=str(exc)),exc.status
        except PermissionError as exc:return _error(exc)
        except ValueError as exc:
            import re
            code=str(exc)
            if not re.fullmatch(r'[A-Z][A-Z0-9_]{1,99}',code):code='PIPELINE_INPUT_INVALID'
            return jsonify(success=False,code=code),getattr(exc,'http_status',400)
        except Exception:return jsonify(success=False,code='PIPELINE_METADATA_UNAVAILABLE'),503
    return wrapped


def body(keys):
    value=request.get_json(silent=True)
    if not isinstance(value,dict) or set(value)!=set(keys.split()):raise PipelineError('PIPELINE_INPUT_INVALID')
    return value


@studio_pipelines_bp.get('/status')
@endpoint
def status(owner):return pipeline_store.status(owner)


@studio_pipelines_bp.get('')
@endpoint
def list_pipelines(owner):return pipeline_store.list(owner)


@studio_pipelines_bp.post('')
@endpoint
def save(owner):
    data=body('name document pipeline_id expected_version')
    return pipeline_store.save(owner,data['name'],data['document'],data['pipeline_id'],data['expected_version'])


@studio_pipelines_bp.get('/<uuid:pipeline_id>')
@endpoint
def get(owner,pipeline_id):
    raw=request.args.get('version');version=None
    if raw is not None:
        try:version=int(raw)
        except ValueError:raise PipelineError('PIPELINE_VERSION_INVALID') from None
        if not 1<=version<=2**31-1:raise PipelineError('PIPELINE_VERSION_INVALID')
    return pipeline_store.get(owner,str(pipeline_id),version)


@studio_pipelines_bp.post('/<uuid:pipeline_id>/runs')
@endpoint
def submit(owner,pipeline_id):
    data=body('version request_id')
    return pipeline_store.submit(owner,str(pipeline_id),data['version'],data['request_id'])


@studio_pipelines_bp.get('/jobs')
@endpoint
def jobs(owner):return pipeline_store.jobs(owner)


@studio_pipelines_bp.get('/jobs/<uuid:run_id>')
@endpoint
def job(owner,run_id):return pipeline_store.job(owner,str(run_id))


@studio_pipelines_bp.post('/jobs/<uuid:run_id>/cancel')
@endpoint
def cancel(owner,run_id):
    body('')
    return pipeline_store.cancel(owner,str(run_id))


@studio_pipelines_bp.get('/outputs')
@endpoint
def outputs(owner):
    allowed={'output_version_id','output_name','row_count','created_at','run_id','pipeline_id','pipeline_name','version'}
    return [{key:value for key,value in row.items() if key in allowed} for row in pipeline_store.outputs(owner)]


@studio_pipelines_bp.get('/outputs/<uuid:output_id>/preview')
@endpoint
def preview_output(owner,output_id):
    from app.services.studio_parquet_outputs import preview_output as read
    if set(request.args)-{'page'} or len(request.args.getlist('page'))>1:
        raise PipelineError('PARQUET_PAGE_INVALID')
    raw=request.args.get('page','1')
    if not raw.isascii() or not raw.isdecimal() or len(raw)>10:
        raise PipelineError('PARQUET_PAGE_INVALID')
    return read(owner,str(output_id),int(raw))


@studio_pipelines_bp.after_request
def no_cache(response):
    response.headers['Cache-Control']='no-store'
    return response
