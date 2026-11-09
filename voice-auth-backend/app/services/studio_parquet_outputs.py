"""Owner-authorized catalog reads delegated to a fixed, private read-only service."""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit
import requests
from app.services.studio_pipelines import PipelineError, identifier, pipeline_store

MAX_PAGE = 2**31 - 1


def preview_output(owner, output_version_id, page):
    if type(page) is not int or not 1 <= page <= MAX_PAGE:
        raise PipelineError('PARQUET_PAGE_INVALID')
    # Resolve the owned SUCCEEDED output before reading secrets or contacting storage.
    record = pipeline_store.output(owner, output_version_id)
    run_id = identifier(record['run_id'])
    node_id = record.get('output_node_id')
    if not isinstance(node_id, str) or not 1 <= len(node_id) <= 80:
        raise PipelineError('PARQUET_METADATA_INVALID', 503)
    url = os.getenv('STUDIO_PARQUET_READER_URL', '').rstrip('/')
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise PipelineError('PARQUET_READER_NOT_CONFIGURED', 503)
    if parsed.scheme == 'http' and parsed.hostname not in ('127.0.0.1', '::1', 'localhost') and os.getenv('STUDIO_PARQUET_ALLOW_HTTP', '').lower() != 'true':
        raise PipelineError('PARQUET_READER_TLS_REQUIRED', 503)
    try:
        path = Path(os.environ['STUDIO_PARQUET_READER_TOKEN_FILE'])
        if path.stat().st_size > 257:
            raise ValueError()
        token = path.read_text().strip()
        if not re.fullmatch(r'[A-Za-z0-9]{32,256}', token):
            raise ValueError()
    except (OSError, KeyError, ValueError):
        raise PipelineError('PARQUET_READER_NOT_CONFIGURED', 503) from None
    try:
        with requests.Session() as session:
            session.trust_env = False
            session.verify = os.getenv('STUDIO_PARQUET_READER_CA_FILE') or True
            with session.post(url + '/internal/output-page', json={'run_id': run_id, 'node_id': node_id, 'page': page},
                              headers={'X-Studio-Reader-Token': token}, timeout=(3, 20), allow_redirects=False, stream=True) as response:
                data = bytearray()
                for chunk in response.iter_content(65536):
                    if len(data) + len(chunk) > 4*1024*1024:
                        raise PipelineError('PARQUET_READER_RESPONSE_INVALID', 503)
                    data.extend(chunk)
                payload = json.loads(data)
                if response.status_code != 200 or payload.get('success') is not True:
                    code = payload.get('code')
                    if code in ('PARQUET_OUTPUT_NOT_FOUND', 'PARQUET_ARTIFACT_INVALID'):
                        raise PipelineError(code, 404 if code.endswith('NOT_FOUND') else 409)
                    raise PipelineError('PARQUET_READER_UNAVAILABLE', 503)
                result = payload['data']
        # Match the immutable catalog version, not just a file having the same name.
        expected_schema = json.loads(record['schema_json'])
        if result['total_rows'] != record['row_count'] or result['schema'] != expected_schema:
            raise PipelineError('PARQUET_VERSION_MISMATCH', 409)
        fields=expected_schema['fields']
        columns=[{'name':f['name'],'type':f['type'] if isinstance(f['type'],str) else json.dumps(f['type'],ensure_ascii=False)} for f in fields]
        rows=result.get('rows')
        valid_rows=isinstance(rows,list) and len(rows)==min(50,max(0,record['row_count']-(page-1)*50))
        if valid_rows:
            valid_rows=all(isinstance(row,list) and len(row)==min(30,len(fields)) and all(cell is None or isinstance(cell,str) and len(cell)<=256 for cell in row) for row in rows)
        if (result.get('page') != page or result.get('page_size') != 50 or type(result.get('total_rows')) is not int or not valid_rows or
            result.get('columns') != columns or result.get('preview_columns') != columns[:30] or
            result.get('omitted_columns') != max(0,len(fields)-30) or result.get('has_more') is not (page*50 < record['row_count']) or
            result.get('stable_order') is not True or type(result.get('truncated_cells')) is not bool):
            raise PipelineError('PARQUET_READER_RESPONSE_INVALID', 503)
        public={key:result[key] for key in ('columns','preview_columns','rows','page','page_size','has_more','total_rows','omitted_columns','stable_order','truncated_cells')}
        return {**public, 'output_version_id': identifier(record['output_version_id']), 'dataset_name': record['output_name']}
    except PipelineError:
        raise
    except Exception:
        raise PipelineError('PARQUET_READER_UNAVAILABLE', 503) from None
