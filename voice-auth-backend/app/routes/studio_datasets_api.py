"""Dataset metadata and bounded connector discovery. No arbitrary SQL."""
import base64
import os
import uuid
from flask import Blueprint, current_app, jsonify, request
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

# Phase 2D.4: server-side, fail-closed ownership checks via signed BEAM RPC.
# This is a DEV candidate; all other Data Studio endpoints still require review.
from app.services.studio_object_access import execute as _access_execute, AccessError


def _require_object_access(user, kind, object_id, *, write=False):
    from app.services.studio_object_access import require_access
    return require_access(user, kind, object_id, 'execute' if write else 'read')


def _visible_datasets(user, rows):
    from app.services.studio_object_access import visible_rows
    return visible_rows(user, 'DATASET', rows, 'dataset_id')


def _access_error(exc):
    return jsonify(success=False, code=str(exc)), exc.status

studio_datasets_bp = Blueprint('studio_datasets', __name__, url_prefix='/api/studio/datasets')


def _spark_error(exc):
    payload = {'success': False, 'code': str(exc)}
    if isinstance(getattr(exc, 'detail', None), str) and exc.detail: payload['detail'] = exc.detail[:1000]
    return jsonify(payload), getattr(exc, 'http_status', 400)


def _query_feature_error(exc):
    # Database/driver exception text can contain SQL or credentials. Only
    # expose our own fixed query-validation and feature-configuration codes.
    safe = {'DATASET_QUERY_DISABLED', 'DATASET_QUERY_CONFIGURATION_INVALID',
            'DATASET_QUERY_SECURITY_REVIEW_REQUIRED',
            'QUERY_SCRIPT_DEV_DISABLED', 'QUERY_SCRIPT_DEV_CONFIGURATION_INVALID',
            'QUERY_SCRIPT_DEV_CONNECTION_DENIED', 'QUERY_SCRIPT_SOURCE_UNSUPPORTED',
            'QUERY_SCRIPT_PREVIEW_FAILED',
            'QUERY_SQL_OBJECT_NOT_FOUND', 'QUERY_SQL_COLUMN_NOT_FOUND',
            'QUERY_SQL_SYNTAX_ERROR', 'QUERY_SQL_PERMISSION_DENIED',
            'DATASET_QUERY_CONNECTION_NOT_ALLOWED', 'DATASET_QUERY_INPUT_INVALID',
            'DATASET_QUERY_NAME_INVALID', 'DATASET_QUERY_DESCRIPTION_INVALID',
            'QUERY_INPUT_INVALID', 'QUERY_INGEST_SELECT_REQUIRED',
            'QUERY_SELECT_REQUIRED', 'QUERY_UNSUPPORTED_OPERATION',
            'QUERY_MULTIPLE_STATEMENTS', 'QUERY_UNTERMINATED_COMMENT',
            'QUERY_UNTERMINATED_LITERAL', 'QUERY_TOKEN_UNSUPPORTED',
            'QUERY_PREVIEW_UNAVAILABLE', 'DATASET_QUERY_METADATA_UNAVAILABLE',
            'DATASET_QUERY_OPERATION_DENIED'}
    code = str(exc)
    return jsonify(success=False, code=code if code in safe else 'DATASET_QUERY_UNAVAILABLE'), 400


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
    except AccessError as exc:
        return _access_error(exc)
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
    except AccessError as exc:
        return _access_error(exc)
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
    except AccessError as exc:
        return _access_error(exc)
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
            definitions = {str(row.get('dataset_id', '')).lower(): row for row in _visible_datasets(user, rows)}
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
                sample = preview_sqlserver_object(_target(user, row['connection_id'], dataset_id=row['dataset_id']), selected, 1, {}, None)
                samples.append({'id': source['id'], 'columns': [column['name'] for column in sample['preview_columns']], 'rows': sample['rows']})
                has_more = has_more or sample['has_more']
        from app.services.studio_spark_preview import spark_graph_preview
        result = spark_graph_preview(samples, body['nodes'], body['outputs'])
        result['has_more'] = result.get('has_more', False) or has_more
        for output in result.get('outputs', []): output['has_more'] = output.get('has_more', False) or has_more
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
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
    except AccessError as exc:
        return _access_error(exc)
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
        _require_object_access(user, 'DATASET', dataset_id)
        if not row:
            return jsonify(success=False, code='DATASET_NOT_FOUND'), 404
        if row.get('access_mode') != 'DIRECT':
            raise ValueError('DATASET_STORAGE_NOT_AVAILABLE')
        from app.services.studio_spark_preview import spark_preview
        _dataset_connector(row)
        source = {'schema': row['source_schema'], 'name': row['source_name'], 'type': row['source_type']}
        sample = preview_sqlserver_object(_target(user, row['connection_id'], dataset_id=row['dataset_id']), source, 1, body['filters'], None)
        result = spark_preview(sample, body['steps'])
        result['has_more'] = sample['has_more']
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='SPARK_PREVIEW_UNAVAILABLE'), 503


class DatasetMetadataUnavailable(ValueError):
    http_status = 503


def _target(user_id, connection_id, *, dataset_id=None):
    if dataset_id is None:
        _require_object_access(user_id, 'CONNECTION', connection_id)
    else:
        _require_object_access(user_id, 'DATASET', dataset_id)
    payload = {'UserID': user_id, 'ConnectionID': connection_id}
    if dataset_id is not None:
        # SQL 029 verifies the actual dataset -> connection relationship.
        payload['DatasetID'] = str(dataset_id)
    response = core_api._post_mode('CoreStudioConnectionGetSecret', payload)
    if not isinstance(response, dict) or response.get('data') is None:
        raise DatasetMetadataUnavailable('DATASET_CONNECTION_METADATA_UNAVAILABLE')
    rows = _rows(response)
    if not rows or not rows[0].get('encrypted_password_base64'):
        raise ValueError('CONNECTION_UNAVAILABLE')
    row = rows[0]
    if row.get('encryption_key_version') != 1:
        raise ValueError('CONNECTION_KEY_VERSION_UNSUPPORTED')
    password = _cipher().decrypt(base64.b64decode(row['encrypted_password_base64'], validate=True)).decode('utf-8')
    kind = str(row.get('connector_type') or row.get('connection_type') or 'sqlserver').strip().lower()
    default_port = 5432 if kind == 'postgresql' else 1433
    return _connector(kind).make_target({**row, 'server_port': int(row['server_port'] or default_port), 'password': password, 'connection_timeout_seconds': int(row['connection_timeout_seconds'] or 10)})


@studio_datasets_bp.get('/query-dev-probe/status')
def query_dev_probe_status():
    """Expose the optional probe only for the configured authorized connection."""
    from app.services.studio_source_query_dev_probe import validate_probe_request
    try:
        user = _principal()
        connection_id = validate_probe_request(request.args.get('connection_id'))
        _require_object_access(user, 'CONNECTION', connection_id, write=True)
        return jsonify(success=True, data={'available': True})
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        reason = {
            'QUERY_DEV_PROBE_DISABLED': 'disabled',
            'QUERY_DEV_CONNECTION_NOT_ALLOWED': 'other_connection',
            'QUERY_DEV_PROBE_CONFIGURATION_INVALID': 'configuration',
        }.get(str(exc), 'unavailable')
        return jsonify(success=True, data={'available': False, 'reason': reason})
    except AccessError:
        return jsonify(success=True, data={'available': False, 'reason': 'access_denied'})
    except Exception:
        return jsonify(success=True, data={'available': False, 'reason': 'unavailable'})


@studio_datasets_bp.post('/query-dev-probe')
def query_dev_probe():
    """Opt-in DEV-only fixed query; never accepts SQL text or an execution login."""
    from app.services.studio_source_query_dev_probe import validate_probe_request, run_fixed_probe
    from app.services.studio_source_query_preview import QueryPreviewFailure, _safe_diagnostic
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'connection_id'}:
            return jsonify(success=False, code='QUERY_DEV_PROBE_INPUT_INVALID'), 400
        try:
            connection_id = validate_probe_request(body['connection_id'])
        except ValueError as exc:
            code = str(exc)
            return jsonify(success=False, code=code), 403 if code == 'QUERY_DEV_CONNECTION_NOT_ALLOWED' else 503
        _require_object_access(user, 'CONNECTION', connection_id, write=True)
        result = run_fixed_probe(_target(user, connection_id))
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except QueryPreviewFailure as exc:
        diagnostic = _safe_diagnostic(exc.diagnostic)
        current_app.logger.error('Query DEV probe failed: %s', diagnostic)
        return jsonify(success=False, code='QUERY_DEV_PROBE_UNAVAILABLE', diagnostic=diagnostic), 503
    except Exception as exc:
        # Log only execution locations and exception type; never log the
        # exception text, source password, query or server name.
        import traceback
        frames = traceback.extract_tb(exc.__traceback__)
        current_app.logger.error('Query DEV probe failed: stage=server type=%s frames=%s',
                                 type(exc).__name__, ' -> '.join(f'{frame.name}:{frame.lineno}' for frame in frames))
        last = frames[-1] if frames else None
        safe_types = {'ValueError', 'RuntimeError', 'KeyError', 'TypeError', 'ImportError', 'AttributeError'}
        return jsonify(success=False, code='QUERY_DEV_PROBE_UNAVAILABLE', diagnostic={
            'stage': 'SERVER',
            'error_type': type(exc).__name__ if type(exc).__name__ in safe_types else 'OTHER',
            'location': f'{last.name}:{last.lineno}' if last else None,
        }), 503


@studio_datasets_bp.get('/query-feature/status')
def query_feature_status():
    from app.services.studio_dataset_query_feature import check_configuration
    try:
        user = _principal()
        connection, _ = check_configuration(request.args.get('connection_id'))
        _require_object_access(user, 'CONNECTION', connection, write=True)
        response = jsonify(success=True, data={'available': True})
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except (AccessError, ValueError):
        return jsonify(success=True, data={'available': False})


@studio_datasets_bp.get('/query-script-dev/status')
def query_script_dev_status():
    from app.services.studio_source_sql_script_dev import allowed_connection
    try:
        user = _principal()
        connection = allowed_connection(request.args.get('connection_id'))
        _require_object_access(user, 'CONNECTION', connection, write=True)
        save_available = False
        if os.getenv('STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED', '').strip().lower() == 'true':
            try:
                from app.services.studio_dataset_query_metadata import script_metadata_ready
                save_available = script_metadata_ready(user)
            except Exception:
                save_available = False
        response = jsonify(success=True, data={'available': True, 'save_available': save_available})
        response.headers['Cache-Control'] = 'no-store'
        return response
    except PermissionError as exc:
        return _error(exc)
    except (AccessError, ValueError):
        return jsonify(success=True, data={'available': False})


@studio_datasets_bp.post('/query-script-dev')
def query_script_dev_create():
    from app.services.studio_source_sql_script_dev import allowed_connection
    from app.services.studio_dataset_query_metadata import create_script_definition
    try:
        user = _principal()
        _mutating()
        if os.getenv('STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED', '').strip().lower() != 'true':
            raise ValueError('DATASET_QUERY_DISABLED')
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'connection_id', 'dataset_name', 'description', 'query'}:
            raise ValueError('DATASET_QUERY_INPUT_INVALID')
        connection = allowed_connection(body['connection_id'])
        _require_object_access(user, 'CONNECTION', connection, write=True)
        data = create_script_definition(user, connection, body['dataset_name'], body['description'], body['query'])
        response = jsonify(success=True, data=data)
        response.headers['Cache-Control'] = 'no-store'
        return response, 201
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _query_feature_error(exc)
    except Exception:
        return jsonify(success=False, code='DATASET_QUERY_CREATE_UNAVAILABLE'), 503


@studio_datasets_bp.get('/<uuid:dataset_id>/query-definition')
def saved_query_definition(dataset_id):
    """Return saved SQL only to users with execute/edit access to the dataset."""
    from app.services.studio_dataset_query_metadata import read_script_definition
    try:
        user = _principal()
        _require_object_access(user, 'DATASET', dataset_id, write=True)
        data = read_script_definition(user, str(dataset_id))
        response = jsonify(success=True, data=data)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError:
        return jsonify(success=False, code='DATASET_QUERY_UNAVAILABLE'), 400
    except Exception:
        return jsonify(success=False, code='DATASET_QUERY_UNAVAILABLE'), 503


@studio_datasets_bp.post('/query-script-dev/preview')
def query_script_dev_preview():
    from app.services.studio_source_sql_script_dev import allowed_connection, preview
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'connection_id', 'query'}:
            raise ValueError('DATASET_QUERY_INPUT_INVALID')
        connection = allowed_connection(body['connection_id'])
        _require_object_access(user, 'CONNECTION', connection, write=True)
        data = preview(_target(user, connection), body['query'])
        response = jsonify(success=True, data=data)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _query_feature_error(exc)
    except Exception:
        return jsonify(success=False, code='QUERY_SCRIPT_PREVIEW_FAILED'), 503


@studio_datasets_bp.post('/query-feature/preview')
def query_feature_preview():
    from app.services.studio_dataset_query_feature import check_configuration
    from app.services.studio_source_query_validation import validate_stored_sqlserver_query
    from app.services.studio_source_query_preview import run_isolated_preview
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'connection_id', 'query'}:
            raise ValueError('DATASET_QUERY_INPUT_INVALID')
        connection, login = check_configuration(body['connection_id'])
        _require_object_access(user, 'CONNECTION', connection, write=True)
        validate_stored_sqlserver_query(body['query'])
        result = run_isolated_preview(_target(user, connection), body['query'], login)
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _query_feature_error(exc)
    except Exception:
        return jsonify(success=False, code='QUERY_PREVIEW_UNAVAILABLE'), 503


@studio_datasets_bp.post('/query-feature')
def query_feature_create():
    from app.services.studio_dataset_query_feature import check_configuration
    from app.services.studio_dataset_query_metadata import create_definition
    from app.services.studio_source_query_preview import run_isolated_preview
    from app.services.studio_source_query_validation import validate_stored_sqlserver_query
    try:
        user = _principal()
        _mutating()
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {'connection_id', 'dataset_name', 'description', 'query'}:
            raise ValueError('DATASET_QUERY_INPUT_INVALID')
        if (not isinstance(body['dataset_name'], str) or not body['dataset_name'].strip()
                or len(body['dataset_name'].strip()) > 150
                or not isinstance(body['description'], str) or len(body['description']) > 1000):
            raise ValueError('DATASET_QUERY_INPUT_INVALID')
        connection, login = check_configuration(body['connection_id'])
        _require_object_access(user, 'CONNECTION', connection, write=True)
        validate_stored_sqlserver_query(body['query'])
        # Validate the precise query immediately before saving. This does not
        # replace server permissions or bound the cost of the source query.
        run_isolated_preview(_target(user, connection), body['query'], login)
        data = create_definition(user, connection, body['dataset_name'], body['description'], body['query'])
        response = jsonify(success=True, data=data)
        response.headers['Cache-Control'] = 'no-store'
        return response, 201
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _query_feature_error(exc)
    except Exception:
        return jsonify(success=False, code='DATASET_QUERY_CREATE_UNAVAILABLE'), 503


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
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        import traceback
        traceback.print_exc()
        return jsonify(success=False, code='DATASET_SOURCE_UNAVAILABLE'), 503


@studio_datasets_bp.get('/query-script-dev/columns/<uuid:connection_id>')
def query_script_dev_columns(connection_id):
    """Read bounded SQL Server object metadata for DEV editor completion."""
    from contextlib import closing
    from app.connectors.sqlserver import SqlServerTarget, open_readonly_connection, _dataset_columns
    from app.services.studio_source_sql_script_dev import allowed_connection
    try:
        user = _principal()
        connection = allowed_connection(str(connection_id))
        _require_object_access(user, 'CONNECTION', connection, write=True)
        schema = request.args.get('schema', '')
        name = request.args.get('name', '')
        kind = request.args.get('type', '')
        if (not schema.strip() or not name.strip() or len(schema) > 128 or len(name) > 128
                or '\x00' in schema or '\x00' in name or kind not in ('BASE TABLE', 'VIEW')):
            raise ValueError('DATASET_SOURCE_INVALID')
        target = _target(user, connection)
        if not isinstance(target, SqlServerTarget):
            raise ValueError('DATASET_SOURCE_INVALID')
        with closing(open_readonly_connection(target)) as db:
            db.timeout = min(target.timeout, 30)
            cursor = db.cursor()
            try:
                _, columns, _ = _dataset_columns(cursor, {'schema':schema, 'name':name, 'type':kind})
            finally:
                cursor.close()
        response = jsonify(success=True, data={'columns':columns})
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError:
        return jsonify(success=False, code='QUERY_METADATA_UNAVAILABLE'), 400
    except Exception:
        return jsonify(success=False, code='QUERY_METADATA_UNAVAILABLE'), 503


@studio_datasets_bp.get('/query-script-dev/column-search/<uuid:connection_id>')
def query_script_dev_column_search(connection_id):
    """Search visible SQL Server column names without executing user SQL."""
    from contextlib import closing
    from app.connectors.sqlserver import SqlServerTarget, open_readonly_connection
    from app.services.studio_source_sql_script_dev import allowed_connection
    try:
        user = _principal()
        connection = allowed_connection(str(connection_id))
        _require_object_access(user, 'CONNECTION', connection, write=True)
        query = request.args.get('q', '')
        if not 1 <= len(query) <= 128 or '\x00' in query:
            raise ValueError('QUERY_METADATA_INVALID')
        target = _target(user, connection)
        if not isinstance(target, SqlServerTarget):
            raise ValueError('QUERY_METADATA_INVALID')
        escaped = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('[', '\\[')
        with closing(open_readonly_connection(target)) as db:
            db.timeout = min(target.timeout, 30)
            cursor = db.cursor()
            try:
                cursor.execute("SELECT TOP (50) s.name,o.name,c.name FROM sys.columns AS c "
                    "JOIN sys.objects AS o ON o.object_id=c.object_id "
                    "JOIN sys.schemas AS s ON s.schema_id=o.schema_id "
                    "WHERE o.type IN ('U','V') AND o.is_ms_shipped=0 "
                    "AND s.name NOT IN ('sys','INFORMATION_SCHEMA') AND c.name LIKE ? ESCAPE '\\' "
                    "ORDER BY c.name,s.name,o.name,c.column_id", escaped + '%')
                rows = cursor.fetchmany(50)
            finally:
                cursor.close()
        response = jsonify(success=True, data={'items':[{'schema':str(r[0]),'table':str(r[1]),'name':str(r[2])} for r in rows]})
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError:
        return jsonify(success=False, code='QUERY_METADATA_UNAVAILABLE'), 400
    except Exception:
        return jsonify(success=False, code='QUERY_METADATA_UNAVAILABLE'), 503


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
        return jsonify(success=True, data=enrich_catalog(user, _visible_datasets(user, rows)))
    except AccessError as exc:
        return _access_error(exc)
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
        _require_object_access(user, 'DATASET', dataset_id)
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
        result = preview_sqlserver_object(_target(user, row['connection_id'], dataset_id=row['dataset_id']), source, page, filters, sort)
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
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
        _require_object_access(user, 'DATASET', dataset_id)
        if not row:
            return jsonify(success=False, code='DATASET_NOT_FOUND'), 404
        if row.get('access_mode') != 'DIRECT':
            raise ValueError('DATASET_STORAGE_NOT_AVAILABLE')
        _dataset_connector(row)
        source = {'schema': row['source_schema'], 'name': row['source_name'], 'type': row['source_type']}
        result = dataset_filter_values(_target(user, row['connection_id'], dataset_id=row['dataset_id']), source, body['column'], body['search'], body['offset'], body['filters'])
        response = jsonify(success=True, data=result)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except AccessError as exc:
        return _access_error(exc)
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
        from app.services.studio_object_access import require_access
        require_access(user, 'CONNECTION', body['connection_id'], 'edit')
        source = {'schema': body['source_schema'], 'name': body['source_name'], 'type': body['source_type']}
        if not sqlserver_object_exists(_target(user, body['connection_id']), source):
            raise ValueError('DATASET_SOURCE_INVALID')
        result = _rows(core_api._post_mode('CoreStudioStoredDatasetCreate' if body['access_mode'] == 'STORED' else 'CoreStudioDatasetCreate', {'UserID': user, 'ConnectionID': body['connection_id'], 'DatasetName': body['dataset_name'].strip(), 'Description': body['description'].strip(), 'SourceSchema': source['schema'], 'SourceName': source['name'], 'SourceType': source['type']}))
        if not result or result[0].get('code') != 'DATASET_CREATED' or result[0].get('success') not in (True, 1):
            raise ValueError('DATASET_CREATE_FAILED')
        return jsonify(success=True, data=result[0]), 201
    except AccessError as exc:
        return _access_error(exc)
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
        _require_object_access(user, 'DATASET', dataset_id, write=True)
        result = submit(user, str(dataset_id), str(uuid.uuid4()))
        return jsonify(success=True, data=result), 202
    except AccessError as exc:
        return _access_error(exc)
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
    except AccessError as exc:
        return _access_error(exc)
    except PermissionError as exc:
        return _error(exc)
    except ValueError as exc:
        return _spark_error(exc)
    except Exception:
        return jsonify(success=False, code='INGEST_METADATA_UNAVAILABLE'), 503


@studio_datasets_bp.after_request
def prevent_private_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response
