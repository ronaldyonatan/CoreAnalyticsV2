
"""Full Parquet chart aggregation through the existing private reader service.

The reader must implement POST /internal/output-aggregate and validate the
shared token, fixed output path, schema, and query specification. No sampled
preview pages are used for calculations.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit
import requests
from app.services.studio_pipelines import pipeline_store, PipelineError, identifier
from app.services.studio_chart_query import ChartQueryError

def execute_parquet_chart(owner, record, spec):
    # Re-check ownership even when caller already resolved it.
    owned = pipeline_store.output(owner, spec['dataset_id'])
    run_id = identifier(owned['run_id'])
    node_id = owned.get('output_node_id')
    if not isinstance(node_id, str) or not 1 <= len(node_id) <= 80:
        raise ChartQueryError('CHART_PARQUET_METADATA_INVALID', 503)
    url = os.getenv('STUDIO_PARQUET_READER_URL','').rstrip('/')
    parsed = urlsplit(url)
    if (parsed.scheme not in ('http','https') or not parsed.hostname
        or parsed.username or parsed.password or parsed.query or parsed.fragment
        or parsed.path not in ('','/')):
        raise ChartQueryError('CHART_PARQUET_READER_NOT_CONFIGURED',503)
    if (parsed.scheme == 'http' and parsed.hostname not in
        ('localhost','127.0.0.1','::1') and
        os.getenv('STUDIO_PARQUET_ALLOW_HTTP','').lower() != 'true'):
        raise ChartQueryError('CHART_PARQUET_READER_TLS_REQUIRED',503)
    try:
        path=Path(os.environ['STUDIO_PARQUET_READER_TOKEN_FILE'])
        if path.stat().st_size > 257: raise ValueError()
        token=path.read_text().strip()
        if not re.fullmatch(r'[A-Za-z0-9]{32,256}',token):raise ValueError()
    except (OSError,KeyError,ValueError):
        raise ChartQueryError('CHART_PARQUET_READER_NOT_CONFIGURED',503) from None
    fields=json.loads(owned['schema_json'])['fields']
    known={f['name'] for f in fields}
    requested=[spec.get('dimension'),spec.get('measure'),spec.get('series')]
    requested += [f['column'] for f in spec['filters']]
    if any(c and c not in known for c in requested):
        raise ChartQueryError('CHART_COLUMN_NOT_FOUND')
    payload={'run_id':run_id,'node_id':node_id,'spec':spec}
    try:
        with requests.Session() as session:
            session.trust_env=False
            session.verify=os.getenv('STUDIO_PARQUET_READER_CA_FILE') or True
            with session.post(url+'/internal/output-aggregate',json=payload,
                    headers={'X-Studio-Reader-Token':token},
                    timeout=(3,40),allow_redirects=False,stream=True) as response:
                if response.status_code==404:
                    raise ChartQueryError('CHART_PARQUET_READER_UPGRADE_REQUIRED',501)
                if response.status_code!=200:
                    raise ChartQueryError('CHART_PARQUET_READER_FAILED',503)
                data=bytearray()
                for chunk in response.iter_content(65536):
                    if len(data)+len(chunk)>2*1024*1024:
                        raise ChartQueryError('CHART_PARQUET_RESPONSE_TOO_LARGE',503)
                    data.extend(chunk)
        result=json.loads(data)
        if result.get('success') is not True:
            raise ChartQueryError('CHART_PARQUET_READER_FAILED',503)
        output=result.get('data')
        if (not isinstance(output,dict) or not isinstance(output.get('rows'),list)
            or len(output['rows'])>spec['limit']
            or output.get('source_kind')!='PARQUET'
            or output.get('is_sample') is not False):
            raise ChartQueryError('CHART_PARQUET_RESPONSE_INVALID',503)
        clean=[]
        for row in output['rows']:
            if not isinstance(row,dict) or set(row)!={'dimension','series','value'}:
                raise ChartQueryError('CHART_PARQUET_RESPONSE_INVALID',503)
            if not isinstance(row['dimension'],str) or len(row['dimension'])>256:
                raise ChartQueryError('CHART_PARQUET_RESPONSE_INVALID',503)
            if row['series'] is not None and (not isinstance(row['series'],str) or len(row['series'])>256):
                raise ChartQueryError('CHART_PARQUET_RESPONSE_INVALID',503)
            if row['value'] is not None and (type(row['value']) not in (int,float)):
                raise ChartQueryError('CHART_PARQUET_RESPONSE_INVALID',503)
            clean.append(row)
        return {'rows':clean,'columns':fields,'truncated':bool(output.get('truncated')),
                'source_kind':'PARQUET','is_sample':False}
    except ChartQueryError:raise
    except (requests.RequestException,ValueError,KeyError,TypeError):
        raise ChartQueryError('CHART_PARQUET_READER_UNAVAILABLE',503) from None
