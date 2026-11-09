"""Preview-only model training. Artifacts are generated here, never uploaded by clients."""
import base64
import math
import pickle
import warnings
from collections import Counter
from app.data_science import fail, matrix, selected, scalar, source
from app.operation_common import fields, schema


def train(request):
    import numpy as np
    from sklearn.compose import ColumnTransformer
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import StratifiedKFold, KFold, cross_val_score
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.naive_bayes import GaussianNB
    from sklearn.linear_model import LinearRegression
    fields(request, 'columns rows target numeric categorical task')
    columns, rows = request['columns'], request['rows']; schema(columns)
    if not isinstance(rows, list) or not 6 <= len(rows) <= 50 or any(not isinstance(row, list) or len(row) != len(columns) or any(v is not None and (not isinstance(v, str) or len(v) > 256) for v in row) for row in rows): fail('INVALID_TRAINING', 'AutoML preview memerlukan 6–50 baris teks.')
    numeric = selected(request['numeric'], columns, True); categorical = selected(request['categorical'], columns, True)
    features = numeric + categorical; target = request['target']; source(target, columns)
    if not features or len(set(features)) != len(features) or target in features: fail('INVALID_FEATURES', 'Pilih fitur unik di luar kolom target.')
    def prepared():
        a = matrix(rows, columns, numeric)
        b = [[row[columns.index(c)] for c in categorical] for row in rows]
        if any(v is None for row in b for v in row): fail('MISSING_CATEGORY', 'Kategori tidak boleh NULL.')
        return np.asarray([left + [str(v) for v in right] for left, right in zip(a, b)], dtype=object)
    x = prepared(); y = [row[columns.index(target)] for row in rows]
    if request['task'] == 'classification':
        if any(v is None for v in y) or len(set(y)) < 2 or min(Counter(y).values()) < 2: fail('INVALID_TARGET', 'Training classification membutuhkan minimal dua kelas dan dua baris per kelas.')
        splits = min(3, min(Counter(y).values())); cv = StratifiedKFold(n_splits=splits, shuffle=True, random_state=0); scoring = 'accuracy'
        candidates = [('Naive Bayes', GaussianNB()), ('Random Forest', RandomForestClassifier(n_estimators=32, max_depth=10, random_state=0, n_jobs=1))]
    elif request['task'] == 'prediction':
        from app.data_science import numeric as as_number
        y = [as_number(v) for v in y]; cv = KFold(n_splits=3, shuffle=True, random_state=0); scoring = 'neg_root_mean_squared_error'
        candidates = [('Linear Regression', LinearRegression()), ('Random Forest', RandomForestRegressor(n_estimators=32, max_depth=10, random_state=0, n_jobs=1))]
    else: fail('INVALID_TASK', 'Task AutoML harus classification atau prediction.')
    transforms = []
    if numeric: transforms.append(('numeric', 'passthrough', list(range(len(numeric)))))
    if categorical: transforms.append(('categorical', OneHotEncoder(handle_unknown='ignore', sparse_output=False), list(range(len(numeric), len(features)))))
    models = []
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        for label, estimator in candidates:
            pipeline = Pipeline([('features', ColumnTransformer(transforms, sparse_threshold=0)), ('model', estimator)])
            try:
                score = float(cross_val_score(pipeline, x, y, cv=cv, scoring=scoring, error_score='raise', n_jobs=1).mean())
                if math.isfinite(score): models.append((score, label, pipeline))
            except (ValueError, FloatingPointError): pass
        if not models: fail('TRAINING_FAILED', 'Tidak ada kandidat yang berhasil divalidasi.')
        for score, label, pipeline in sorted(models, key=lambda model: model[0], reverse=True):
            pipeline.fit(x, y)
            estimator = pipeline.named_steps['model']
            if label != 'Naive Bayes' or (np.isfinite(estimator.var_).all() and np.all(estimator.var_ > 0)): break
        else: fail('TRAINING_FAILED', 'Tidak ada kandidat dengan variansi yang valid.')
    artifact = base64.b64encode(pickle.dumps(pipeline, protocol=5)).decode('ascii')
    if len(artifact) > 350000: fail('MODEL_TOO_LARGE', 'Model melebihi batas preview.')
    return {'artifact': artifact, 'task': request['task'], 'numeric': numeric, 'categorical': categorical, 'target': target, 'algorithm': label, 'score': score if scoring == 'accuracy' else -score, 'metric': 'CV accuracy' if scoring == 'accuracy' else 'CV RMSE', 'training_rows': len(rows)}


def infer(columns, rows, trusted):
    import numpy as np
    # Only the authenticated API can inject this artifact from its server-owned registry.
    # Every public preview route rejects client-provided artifacts before starting a worker.
    selected(trusted['numeric'] + trusted['categorical'], columns)
    nums = matrix(rows, columns, trusted['numeric'])
    cats = [[row[columns.index(c)] for c in trusted['categorical']] for row in rows]
    if any(v is None for row in cats for v in row): fail('MISSING_CATEGORY', 'Kategori Predict tidak boleh NULL.')
    x = np.asarray([a + [str(v) for v in b] for a, b in zip(nums, cats)], dtype=object)
    model = pickle.loads(base64.b64decode(trusted['artifact'], validate=True))
    with warnings.catch_warnings():
        warnings.simplefilter('ignore'); values = model.predict(x)
    return [scalar(v) for v in values]
