"""Dataset metadata and bounded connector discovery. No arbitrary SQL."""
import base64
import uuid
from flask import Blueprint, jsonify, request
from app.clients.core_api_client import core_api
from app.routes.studio_connections_api import _principal, _mutating, _error
from app.services.studio_connections import _cipher, _rows
from app.connectors.registry import resolve



def _connector(kind=None):
    return resolve(kind)

def _connector_for_target(target):
    # The decrypted target carries its connector identity; do not trust dataset rows
    # to always contain connector_type (legacy SQL Server metadata may omit it).
    from app.connectors.postgresql_adapter import PostgreSQLTarget
    return _connector('postgresql' if isinstance(target, PostgreSQLTarget) else 'sqlserver')

def list_sqlserver_objects(target, query='', offset=0, limit=50):
    return _connector_for_target(target).browse(target, query, offset, limit)

def sqlserver_object_exists(target, source):
    return _connector_for_target(target).object_exists(target, source)

def preview_sqlserver_object(target, source, page=1, filters=None, sort=None):
    return _connector_for_target(target).preview(target, source, page, filters, sort)

def dataset_filter_values(target, source, column, search, offset, filters):
    return _connector_for_target(target).filter_values(target, source, column, search, offset, filters)

def _dataset_connector(row):
    return _connector(str(row.get('connector_type') or row.get('connection_type') or 'sqlserver').strip().lower())

studio_datasets_bp = Blueprint('studio_datasets', __name__, url_prefix='/api/studio/datasets')


def _spark_error(exc):
    payload = {'success': False, 'code': str(exc)}
    if isinstance(getattr(exc, 'detail', None), str) and exc.detail: payload['detail'] = exc.detail[:1000]
    return jsonify(payload), getattr(exc, 'http_status', 400)


@studio_datasets_bp.route('/science-models', methods=['GET', 'POST'])
def science_models():
    try:
        user = _principal()
        from app.services.studio_science_models import list_models, train_model
        if request.method == 'POST':
            _mutating()
            data = train_model(user, request.get_json(silent=True))
        else:
            data = list_models(user)
        response = jsonify(success=True, data=data)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='DATA_SCIENCE_MODEL_UNAVAILABLE'), 503


@studio_datasets_bp.get('/ai-runtime')
def ai_runtime():
    try:
        user = _principal()
        from app.services.studio_spark_preview import _run_worker
        from app.services.studio_science_models import list_models
        result = _run_worker({'ai_status': True})
        result['trained_models'] = list_models(user)
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except Exception:
        return jsonify(success=False, code='AI_RUNTIME_UNAVAILABLE'), 503


@studio_datasets_bp.get('/script-runtime')
def script_runtime():
    try:
        _principal()
        from app.services.studio_spark_preview import scripting_status
        response = jsonify(success=True, data=scripting_status())
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except Exception:
        return jsonify(success=False, code='SCRIPT_RUNTIME_NOT_READY'), 503


@studio_datasets_bp.post('/graph-spark-preview')
def preview_graph_spark():
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        from app.services.studio_graph_preview import validate_graph_request
        validate_graph_request(body)
        from app.services.studio_ai_services import validate_ai_steps
        validate_ai_steps([step for node in body['nodes'] for step in node['steps']] if 'nodes' in body else body['steps'])
        from app.services.studio_science_models import resolve_steps
        for node in body['nodes']: node['steps'] = resolve_steps(user, node['steps'])
        definitions = {}
        if any(source['kind'] == 'dataset' for source in body['sources']):
            rows = _rows(core_api._post_mode('CoreStudioDatasetList', {'UserID': user}))
            definitions = {str(row.get('dataset_id', '')).lower(): row for row in rows}
            # Authorize every dataset before opening any source connection.
            for source in body['sources']:
                if source['kind'] != 'dataset': continue
                row = definitions.get(str(uuid.UUID(source['dataset_id'])))
                if not row: return jsonify(success=False, code='DATASET_NOT_FOUND'), 404
                if row.get('access_mode') != 'DIRECT': raise ValueError('DATASET_STORAGE_NOT_AVAILABLE')
        samples, has_more = [], False
        for source in body['sources']:
            if source['kind'] == 'fixed':
                samples.append({key: source[key] for key in ('id', 'columns', 'rows')})
            else:
                row = definitions[str(uuid.UUID(source['dataset_id']))]
                _dataset_connector(row)
                selected = {'schema': row['source_schema'], 'name': row['source_name'], 'type': row['source_type']}
                sample = preview_sqlserver_object(_target(user, row['connection_id']), selected, 1, {}, None)
                samples.append({'id': source['id'], 'columns': [column['name'] for column in sample['preview_columns']], 'rows': sample['rows']})
                has_more = has_more or sample['has_more']
        from app.services.studio_spark_preview import spark_graph_preview
        result = spark_graph_preview(samples, body['nodes'], body['outputs'])
        result['has_more'] = result.get('has_more', False) or has_more
        for output in result.get('outputs', []): output['has_more'] = output.get('has_more', False) or has_more
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='SPARK_PREVIEW_UNAVAILABLE'), 503


@studio_datasets_bp.post('/fixed-spark-preview')
def preview_fixed_spark():
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'columns', 'rows', 'steps'} or not isinstance(body['columns'], list) or len(body['columns']) > 30 or not isinstance(body['rows'], list) or len(body['rows']) > 50 or not isinstance(body['steps'], list) or len(body['steps']) > 30:
            raise ValueError('INVALID_REQUEST')
        columns, rows = body['columns'], body['rows']
        if not columns or any(not isinstance(name, str) or not name.strip() or len(name) > 128 for name in columns) or len({name.lower() for name in columns}) != len(columns):
            raise ValueError('INVALID_COLUMNS')
        if any(not isinstance(row, list) or len(row) != len(columns) or any(cell is not None and (not isinstance(cell, str) or len(cell) > 256) for cell in row) for row in rows):
            raise ValueError('INVALID_ROWS')
        from app.services.studio_spark_preview import spark_preview
        from app.services.studio_ai_services import validate_ai_steps
        validate_ai_steps([step for node in body['nodes'] for step in node['steps']] if 'nodes' in body else body['steps'])
        from app.services.studio_science_models import resolve_steps
        body['steps'] = resolve_steps(user, body['steps'])
        sample = {'preview_columns': [{'name': name} for name in body['columns']], 'rows': body['rows']}
        response = jsonify(success=True, data={**spark_preview(sample, body['steps']), 'has_more': False})
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='SPARK_PREVIEW_UNAVAILABLE'), 503


@studio_datasets_bp.post('/<uuid:dataset_id>/spark-preview')
def preview_dataset_spark(dataset_id):
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'filters', 'steps'} or not isinstance(body['steps'], list):
            raise ValueError('SPARK_PREVIEW_INVALID_REQUEST')
        from app.services.studio_ai_services import validate_ai_steps
        validate_ai_steps([step for node in body['nodes'] for step in node['steps']] if 'nodes' in body else body['steps'])
        from app.services.studio_science_models import resolve_steps
        body['steps'] = resolve_steps(user, body['steps'])
        rows = _rows(core_api._post_mode('CoreStudioDatasetList', {'UserID': user}))
        row = next((item for item in rows if str(item.get('dataset_id', '')).lower() == str(dataset_id)), None)
        if not row:
            return jsonify(success=False, code='DATASET_NOT_FOUND'), 404
        if row.get('access_mode') != 'DIRECT':
            raise ValueError('DATASET_STORAGE_NOT_AVAILABLE')
        from app.services.studio_spark_preview import spark_preview
        _dataset_connector(row)
        source = {'schema': row['source_schema'], 'name': row['source_name'], 'type': row['source_type']}
        sample = preview_sqlserver_object(_target(user, row['connection_id']), source, 1, body['filters'], None)
        result = spark_preview(sample, body['steps'])
        result['has_more'] = sample['has_more']
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='SPARK_PREVIEW_UNAVAILABLE'), 503


class DatasetMetadataUnavailable(ValueError):
    http_status = 503


def _target(user_id, connection_id):
    response = core_api._post_mode('CoreStudioConnectionGetSecret', {'UserID': user_id, 'ConnectionID': connection_id})
    if not isinstance(response, dict) or response.get('data') is None:
        raise DatasetMetadataUnavailable('DATASET_CONNECTION_METADATA_UNAVAILABLE')
    rows = _rows(response)
    if not rows or not rows[0].get('encrypted_password_base64'):
        raise ValueError('CONNECTION_UNAVAILABLE')
    row = rows[0]
    # Temporary diagnostic: metadata keys only, never log encrypted secrets or passwords.
    print('DATASET CONNECTION METADATA:', {
        'connector_type': row.get('connector_type'),
        'connection_type': row.get('connection_type'),
        'connection_name': row.get('connection_name'),
        'server_port': row.get('server_port'),
        'available_keys': list(row.keys()),
    }, flush=True)
    if row.get('encryption_key_version') != 1:
        raise ValueError('CONNECTION_KEY_VERSION_UNSUPPORTED')
    password = _cipher().decrypt(base64.b64decode(row['encrypted_password_base64'], validate=True)).decode('utf-8')
    kind = str(row.get('connector_type') or row.get('connection_type') or 'sqlserver').strip().lower()
    default_port = 5432 if kind == 'postgresql' else 1433
    return _connector(kind).make_target({**row, 'server_port': int(row['server_port'] or default_port), 'password': password, 'connection_timeout_seconds': int(row['connection_timeout_seconds'] or 10)})


@studio_datasets_bp.get('/sources/<uuid:connection_id>')
def sources(connection_id):
    try:
        user = _principal()
        query = request.args.get('q', '').strip()
        try:
            offset = int(request.args.get('offset', '0'))
            limit = int(request.args.get('limit', '50'))
        except ValueError:
            raise ValueError('DATASET_SEARCH_INVALID') from None
        return jsonify(success=True, data=list_sqlserver_objects(_target(user, str(connection_id)), query, offset, limit))
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        import traceback
        traceback.print_exc()
        return jsonify(success=False, code='DATASET_SOURCE_UNAVAILABLE'), 503


@studio_datasets_bp.get('')
def list_datasets():
    try:
        user = _principal()
        rows = _rows(core_api._post_mode('CoreStudioDatasetList', {'UserID': user}))
        if rows and rows[0].get('success') in (False, 0):
            raise RuntimeError('Dataset metadata unavailable')
        if len(rows) == 1 and rows[0].get('code') == 'DATASET_LIST_EMPTY' and rows[0].get('success') in (True, 1):
            rows = []
        from app.services.studio_stored_preview import enrich_catalog
        return jsonify(success=True, data=enrich_catalog(user, rows))
    except PermissionError as exc:
        return _error(exc)
    except Exception:
        return jsonify(success=False, code='DATASET_METADATA_UNAVAILABLE'), 503


@studio_datasets_bp.route('/<uuid:dataset_id>/preview', methods=['GET', 'POST'])
def preview_dataset(dataset_id):
    try:
        user = _principal()
        rows = _rows(core_api._post_mode('CoreStudioDatasetList', {'UserID': user}))
        row = next((item for item in rows if str(item.get('dataset_id', '')).lower() == str(dataset_id)), None)
        if not row:
            return jsonify(success=False, code='DATASET_NOT_FOUND'), 404
        if row.get('access_mode') == 'STORED':
            if request.method != 'GET':
                raise ValueError('STORED_PREVIEW_READ_ONLY')
            if set(request.args) - {'page'} or len(request.args.getlist('page')) > 1:
                raise ValueError('DATASET_PAGE_INVALID')
            raw_page = request.args.get('page', '1')
            if not raw_page.isascii() or not raw_page.isdecimal() or len(raw_page) > 10:
                raise ValueError('DATASET_PAGE_INVALID')
            from app.services.studio_stored_preview import stored_page
            result = stored_page(user, row, int(raw_page))
            response = jsonify(success=True, data=result)
            response.headers['Cache-Control'] = 'no-store'
            return response
        if row.get('access_mode') != 'DIRECT':
            raise ValueError('DATASET_STORAGE_NOT_AVAILABLE')
        _dataset_connector(row)
        source = {'schema': row['source_schema'], 'name': row['source_name'], 'type': row['source_type']}
        filters = {}
        sort = None
        if request.method == 'POST':
            _mutating()
            body = request.get_json(silent=True)
            if not isinstance(body, dict) or not {'page', 'filters'}.issubset(body) or set(body) - {'page', 'filters', 'sort'} or type(body['page']) is not int:
                raise ValueError('DATASET_FILTER_INVALID')
            filters = body['filters']
            sort = body.get('sort')
            page = body['page']
        else:
            try:
                page = int(request.args.get('page', '1'))
            except ValueError:
                raise ValueError('DATASET_PAGE_INVALID') from None
        if not 1 <= page <= 42949672:
            raise ValueError('DATASET_PAGE_INVALID')
        result = preview_sqlserver_object(_target(user, row['connection_id']), source, page, filters, sort)
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='DATASET_PREVIEW_UNAVAILABLE'), 503


@studio_datasets_bp.post('/<uuid:dataset_id>/filter-values')
def filter_values(dataset_id):
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'column', 'search', 'offset', 'filters'}:
            raise ValueError('DATASET_FILTER_INVALID')
        rows = _rows(core_api._post_mode('CoreStudioDatasetList', {'UserID': user}))
        row = next((item for item in rows if str(item.get('dataset_id', '')).lower() == str(dataset_id)), None)
        if not row:
            return jsonify(success=False, code='DATASET_NOT_FOUND'), 404
        if row.get('access_mode') != 'DIRECT':
            raise ValueError('DATASET_STORAGE_NOT_AVAILABLE')
        _dataset_connector(row)
        source = {'schema': row['source_schema'], 'name': row['source_name'], 'type': row['source_type']}
        result = dataset_filter_values(_target(user, row['connection_id']), source, body['column'], body['search'], body['offset'], body['filters'])
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='DATASET_FILTER_VALUES_UNAVAILABLE'), 503


@studio_datasets_bp.post('')
def create_dataset():
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        required = {'connection_id', 'dataset_name', 'description', 'source_schema', 'source_name', 'source_type', 'access_mode'}
        if not isinstance(body, dict) or set(body) != required:
            raise ValueError('DATASET_INPUT_INVALID')
        for name, limit in (('dataset_name',150), ('description',1000), ('source_schema',128), ('source_name',128), ('connection_id',36)):
            if not isinstance(body[name], str) or len(body[name]) > limit or (name != 'description' and not body[name].strip()):
                raise ValueError('DATASET_INPUT_INVALID')
        uuid.UUID(body['connection_id'])
        if body['access_mode'] not in ('DIRECT', 'STORED'):
            raise ValueError('DATASET_STORAGE_NOT_AVAILABLE')
        source = {'schema': body['source_schema'], 'name': body['source_name'], 'type': body['source_type']}
        if not sqlserver_object_exists(_target(user, body['connection_id']), source):
            raise ValueError('DATASET_SOURCE_INVALID')
        result = _rows(core_api._post_mode('CoreStudioStoredDatasetCreate' if body['access_mode'] == 'STORED' else 'CoreStudioDatasetCreate', {'UserID': user, 'ConnectionID': body['connection_id'], 'DatasetName': body['dataset_name'].strip(), 'Description': body['description'].strip(), 'SourceSchema': source['schema'], 'SourceName': source['name'], 'SourceType': source['type']}))
        if not result or result[0].get('code') != 'DATASET_CREATED' or result[0].get('success') not in (True, 1):
            raise ValueError('DATASET_CREATE_FAILED')
        return jsonify(success=True, data=result[0]), 201
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='DATASET_CREATE_UNAVAILABLE'), 503


@studio_datasets_bp.post('/<uuid:dataset_id>/ingest')
def submit_stored_ingest(dataset_id):
    try:
        user = _principal()
        _mutating()
        from app.services.studio_dataset_ingest import submit
        # Server generates idempotency key, not supplied by browser.
        result = submit(user, str(dataset_id), str(uuid.uuid4()))
        return jsonify(success=True, data=result), 202
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='INGEST_METADATA_UNAVAILABLE'), 503


@studio_datasets_bp.get('/ingest/jobs')
def stored_ingest_jobs():
    try:
        user = _principal()
        from app.services.studio_dataset_ingest import jobs
        response = jsonify(success=True, data=jobs(user))
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='INGEST_METADATA_UNAVAILABLE'), 503
