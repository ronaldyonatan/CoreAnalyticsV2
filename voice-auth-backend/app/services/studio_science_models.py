"""Owner-scoped, expiring preview models. No disk persistence or model uploads."""
import copy
import threading
import time
import uuid

_MODELS = {}
_LOCK = threading.Lock()
_TTL = 3600


def _prune():
    now = time.time()
    for key in [key for key, model in _MODELS.items() if model['expires'] <= now]: del _MODELS[key]


def list_models(owner):
    with _LOCK:
        _prune()
        return [{key: value for key, value in model.items() if key not in ('artifact', 'owner')} for model in _MODELS.values() if model['owner'] == str(owner)]


def train_model(owner, request):
    from app.services.studio_spark_preview import _run_worker
    if not isinstance(request, dict) or set(request) != {'columns', 'rows', 'target', 'numeric', 'categorical', 'task'}: raise ValueError('DATA_SCIENCE_INVALID_TRAINING')
    with _LOCK:
        _prune()
        if len(_MODELS) >= 100 or sum(m['owner'] == str(owner) for m in _MODELS.values()) >= 10: raise ValueError('DATA_SCIENCE_MODEL_LIMIT')
    model = _run_worker({'science_train': request})
    model.update(id=str(uuid.uuid4()), owner=str(owner), expires=time.time() + _TTL)
    with _LOCK:
        _prune()
        if len(_MODELS) >= 100 or sum(m['owner'] == str(owner) for m in _MODELS.values()) >= 10: raise ValueError('DATA_SCIENCE_MODEL_LIMIT')
        _MODELS[model['id']] = model
    return {key: value for key, value in model.items() if key not in ('artifact', 'owner')}


def resolve_steps(owner, steps):
    result = copy.deepcopy(steps)
    if not isinstance(result, list): raise ValueError('INVALID_STEPS')
    for step in result:
        if not isinstance(step, dict): raise ValueError('INVALID_STEP')
        # No public endpoint accepts executable model bytes, even under an alternative operation.
        if any(key in step for key in ('artifact', '_trusted_model')) or ('model' in step and not (step.get('type') == 'ai_llm' and isinstance(step['model'], str))): raise ValueError('DATA_SCIENCE_MODEL_UPLOAD_FORBIDDEN')
        if step.get('type') in ('ai_model', 'ai_model_trusted'):
            if step['type'] != 'ai_model' or set(step) != {'type','model_id','output','task','include_input'} or not isinstance(step['model_id'],str) or type(step['include_input']) is not bool or step['task'] not in ('classification','prediction') or not isinstance(step['output'],str) or not step['output'].strip() or len(step['output']) > 128: raise ValueError('AI_INVALID_MODEL')
            with _LOCK:
                _prune(); model = _MODELS.get(step['model_id'])
                if not model or model['owner'] != str(owner): raise ValueError('AI_MODEL_NOT_FOUND')
                if model['task'] != step['task']: raise ValueError('AI_MODEL_TASK_MISMATCH')
                trusted = {key: copy.deepcopy(model[key]) for key in ('artifact','numeric','categorical','id')}
            step.pop('model_id'); step['type'] = 'ai_model_trusted'; step['_trusted_model'] = trusted
        if step.get('type') == 'data_science' and step.get('operation') in ('inference', 'inference_trusted'):
            if set(step) != {'type', 'operation', 'model_id', 'output'} or step['operation'] != 'inference' or not isinstance(step['model_id'], str): raise ValueError('DATA_SCIENCE_INVALID_MODEL')
            with _LOCK:
                _prune(); model = _MODELS.get(step['model_id'])
                if not model or model['owner'] != str(owner): raise ValueError('DATA_SCIENCE_MODEL_NOT_FOUND')
                trusted = {key: copy.deepcopy(model[key]) for key in ('artifact', 'numeric', 'categorical')}
            step.pop('model_id'); step['operation'] = 'inference_trusted'; step['_trusted_model'] = trusted
    return result
