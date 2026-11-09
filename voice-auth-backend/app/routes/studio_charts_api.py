"""Authorized Chart Library / Analyzer API.

No browser SQL, filesystem paths or connection credentials are accepted.
"""
import json
import uuid
from flask import Blueprint, jsonify, request
from app.clients.core_api_client import core_api
from app.services.studio_connections import _rows
from app.routes.studio_connections_api import _principal, _mutating, _error
from app.routes.studio_datasets_api import _target
from app.services.studio_pipelines import pipeline_store, PipelineError
from app.services.studio_charts import ChartError, list_charts, get_chart, save_chart, delete_chart
from app.services.studio_chart_query import ChartQueryError, parse_chart_spec, execute_direct_chart
from app.services.studio_chart_parquet import execute_parquet_chart

studio_charts_bp=Blueprint('studio_charts',__name__,url_prefix='/api/studio/charts')


def _json(result,status=200):
    response=jsonify(success=True,data=result);response.headers['Cache-Control']='no-store';return response,status


def _error_response(exc):
    if isinstance(exc,PermissionError):return _error(exc)
    if isinstance(exc,(ChartError,ChartQueryError,PipelineError,ValueError)):
        code=str(exc)
        if not code.startswith(('CHART_','PIPELINE_')):code='CHART_INPUT_INVALID'
        return jsonify(success=False,code=code),getattr(exc,'http_status',400)
    return jsonify(success=False,code='CHART_SERVICE_UNAVAILABLE'),503


def endpoint(fn):
    from functools import wraps
    @wraps(fn)
    def wrapped(*args,**kwargs):
        try:
            user=_principal()
            if request.method not in ('GET','HEAD'):_mutating()
            return fn(user,*args,**kwargs)
        except Exception as exc:
            return _error_response(exc)
    return wrapped


def authorized_dataset(user,dataset_id,kind):
    if kind=='DIRECT':
        records=_rows(core_api._post_mode('CoreStudioDatasetList',{'UserID':user}))
        row=next((row for row in records if str(row.get('dataset_id','')).lower()==str(dataset_id).lower() and row.get('access_mode')=='DIRECT'),None)
        if not row:raise ChartError('CHART_DATASET_NOT_FOUND',404)
        return row
    if kind=='PARQUET':
        return pipeline_store.output(user,str(dataset_id))
    raise ChartError('CHART_DATASET_KIND_INVALID')


def validate_spec(user,body):
    if not isinstance(body,dict):raise ChartError('CHART_INPUT_INVALID')
    spec=parse_chart_spec(body)
    try:spec['dataset_id']=str(uuid.UUID(spec['dataset_id']))
    except (ValueError,TypeError):raise ChartError('CHART_DATASET_ID_INVALID') from None
    record=authorized_dataset(user,spec['dataset_id'],spec['dataset_kind'])
    return spec,record


@studio_charts_bp.get('')
@endpoint
def list_saved(user):
    return _json(list_charts(user))


@studio_charts_bp.get('/<uuid:chart_id>')
@endpoint
def get_saved(user,chart_id):
    result=get_chart(user,str(chart_id))
    authorized_dataset(user,result['config']['dataset_id'],result['config']['dataset_kind'])
    return _json(result)


@studio_charts_bp.post('')
@endpoint
def create(user):
    body=request.get_json(silent=True)
    if not isinstance(body,dict) or set(body)!={'name','config'}:raise ChartError('CHART_INPUT_INVALID')
    spec,_=validate_spec(user,body['config'])
    result=save_chart(user,body['name'],spec)
    return _json(result,201)


@studio_charts_bp.put('/<uuid:chart_id>')
@endpoint
def update(user,chart_id):
    body=request.get_json(silent=True)
    if not isinstance(body,dict) or set(body)!={'name','config','expected_version'}:
        raise ChartError('CHART_INPUT_INVALID')
    spec,_=validate_spec(user,body['config'])
    result=save_chart(user,body['name'],spec,str(chart_id),body['expected_version'])
    return _json(result)


@studio_charts_bp.delete('/<uuid:chart_id>')
@endpoint
def remove(user,chart_id):
    return _json(delete_chart(user,str(chart_id)))


@studio_charts_bp.get('/datasets/<uuid:dataset_id>/columns')
@endpoint
def columns(user,dataset_id):
    kind=request.args.get('kind','DIRECT')
    row=authorized_dataset(user,str(dataset_id),kind)
    if kind=='DIRECT':
        from app.connectors.sqlserver import open_readonly_connection,_dataset_columns
        from contextlib import closing
        with closing(open_readonly_connection(_target(user,row['connection_id']))) as cn:
            cursor=cn.cursor()
            _,fields,_=_dataset_columns(cursor,{'schema':row['source_schema'],'name':row['source_name'],'type':row['source_type']})
    else:
        try:
            fields=json.loads(row['schema_json'])['fields']
            fields=[{'name':f['name'],'type':f['type'] if isinstance(f['type'],str) else json.dumps(f['type'])} for f in fields]
        except (KeyError,ValueError,TypeError):raise ChartError('CHART_SCHEMA_UNAVAILABLE',503) from None
    return _json({'columns':fields,'dataset_id':str(dataset_id),'kind':kind})


@studio_charts_bp.post('/query')
@endpoint
def query(user):
    spec,row=validate_spec(user,request.get_json(silent=True))
    if spec['dataset_kind']=='PARQUET':
        return _json(execute_parquet_chart(user, row, spec))
    from app.connectors.sqlserver import SqlTargetPolicyError
    result=execute_direct_chart(_target(user,row['connection_id']),
            {'schema':row['source_schema'],'name':row['source_name'],'type':row['source_type']},spec)
    return _json(result)
