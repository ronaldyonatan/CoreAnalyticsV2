"""Private Parquet reader. Output preview and full-dataset chart aggregation."""
import hmac
import os
import re
from pathlib import Path
from flask import Flask, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge
from parquet_reader import OutputError, read_page, output_index, safe_file
from chart_aggregate_duckdb import aggregate_parquet


def create_app(root, token):
    if not re.fullmatch(r'[A-Za-z0-9]{32,256}', token):
        raise RuntimeError('Reader secret must contain 32–256 alphanumeric characters.')
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 16384

    @app.after_request
    def no_cache(response):
        response.headers['Cache-Control'] = 'no-store'
        return response

    def authenticated():
        supplied = request.headers.get('X-Studio-Reader-Token', '')
        return hmac.compare_digest(supplied.encode('utf-8'), token.encode('ascii'))

    @app.post('/internal/output-page')
    def page():
        if not authenticated():
            return jsonify(success=False, code='PARQUET_READER_AUTH_REQUIRED'), 403
        try:
            result = read_page(root, request.get_json(silent=True))
            return jsonify(success=True, data=result)
        except OutputError as exc:
            return jsonify(success=False, code=str(exc)), exc.http_status
        except RequestEntityTooLarge:
            return jsonify(success=False, code='PARQUET_REQUEST_TOO_LARGE'), 413
        except Exception:
            app.logger.exception('Parquet preview failed')
            return jsonify(success=False, code='PARQUET_READ_FAILED'), 503

    @app.post('/internal/output-aggregate')
    def aggregate():
        if not authenticated():
            return jsonify(success=False, code='PARQUET_READER_AUTH_REQUIRED'), 403
        try:
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict) or set(payload) != {'run_id','node_id','spec'}:
                raise OutputError('PARQUET_REQUEST_INVALID',400)
            run_id, node_id = payload['run_id'], payload['node_id']
            # Validate IDs through the existing immutable-output validation contract.
            from parquet_reader import validate_request
            validate_request({'run_id':run_id,'node_id':node_id,'page':1})
            spec=payload['spec']
            if not isinstance(spec,dict):
                raise OutputError('CHART_QUERY_INVALID',400)
            schema, groups, row_count = output_index(str(Path(root).resolve()),run_id,node_id)
            # output_index verified manifest, row count, _SUCCESS, and part files.
            artifact_dir=Path(root).resolve()/run_id
            manifest=artifact_dir/'manifest.json'
            import json
            outputs=json.loads(manifest.read_text(encoding='utf-8'))['outputs']
            matches=[(i,o) for i,o in enumerate(outputs) if o.get('id')==node_id]
            if len(matches)!=1:
                raise OutputError('PARQUET_OUTPUT_NOT_FOUND',404)
            directory=safe_file(Path(root).resolve(),artifact_dir/('output-'+str(matches[0][0])))
            result=aggregate_parquet(directory,spec)
            return jsonify(success=True,data=result)
        except OutputError as exc:
            return jsonify(success=False,code=str(exc)),exc.http_status
        except (ValueError,KeyError,TypeError) as exc:
            code=str(exc)
            return jsonify(success=False,code=code if code.startswith('CHART_') else 'CHART_QUERY_INVALID'),400
        except RequestEntityTooLarge:
            return jsonify(success=False,code='PARQUET_REQUEST_TOO_LARGE'),413
        except Exception:
            app.logger.exception('Parquet aggregate failed')
            return jsonify(success=False,code='PARQUET_AGGREGATE_FAILED'),503
    return app


if __name__ == '__main__':
    secret_path=Path(os.getenv('STUDIO_PARQUET_READER_TOKEN_FILE','/run/secrets/parquet_reader_secret'))
    if secret_path.stat().st_size > 257:
        raise SystemExit('Reader secret is invalid.')
    token=secret_path.read_text().strip()
    if hasattr(os,'geteuid') and os.geteuid()==0:
        os.setgroups([]);os.setgid(185);os.setuid(185)
    app=create_app(os.environ['STUDIO_BATCH_STORAGE_ROOT'],token)
    from gunicorn.app.base import BaseApplication
    class Server(BaseApplication):
        def load_config(self):
            for key,value in {'bind':'0.0.0.0:8090','workers':2,'threads':1,'timeout':60,'max_requests':200,'max_requests_jitter':20,'accesslog':None,'errorlog':'-'}.items():
                self.cfg.set(key,value)
        def load(self):return app
    Server().run()
