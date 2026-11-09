"""One bounded request over stdin; no database credentials or network API."""
import json
import sys
from app.preview import preview

try:
    request = json.load(sys.stdin)
    if isinstance(request, dict) and request == {'script_status': True}:
        from app.script_runner import runtime_status
        result = runtime_status()
    elif isinstance(request, dict) and request == {'ai_status': True}:
        from app.ai_services import runtime_status
        result = runtime_status()
    elif isinstance(request, dict) and set(request) == {'science_train'}:
        from app.automl import train
        result = train(request['science_train'])
    elif isinstance(request, dict) and set(request) == {'sources', 'nodes', 'outputs'}:
        from app.graph_preview import graph_preview
        result = graph_preview(request['sources'], request['nodes'], request['outputs'])
    elif isinstance(request, dict) and set(request) == {'columns', 'rows', 'steps'}:
        result = preview(request['rows'], request['columns'], request['steps'])
    else:
        raise ValueError('INVALID_REQUEST')
    json.dump({'success': True, 'data': result}, sys.stdout, ensure_ascii=False)
except ValueError as exc:
    json.dump({'success': False, 'code': str(exc), **({'detail': str(exc.detail)[:1000]} if getattr(exc, 'detail', '') else {})}, sys.stdout)
except Exception:
    json.dump({'success': False, 'code': 'SPARK_PREVIEW_FAILED'}, sys.stdout)
