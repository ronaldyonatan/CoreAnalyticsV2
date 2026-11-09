"""Bounded, deterministic Data Science operations. No uploaded code/models or IO."""
import math
import warnings
from datetime import datetime
from app.operation_common import fields, schema, integer, text


class ScienceError(ValueError):
    def __init__(self, code, detail):
        super().__init__('DATA_SCIENCE_' + code)
        self.detail = detail[:1000]


def fail(code, detail):
    raise ScienceError(code, detail)


def source(name, columns):
    if not isinstance(name, str) or name not in columns: fail('INVALID_COLUMN', 'Kolom sumber tidak tersedia.')


def numeric(value):
    try:
        result = float(value)
        if math.isfinite(result): return result
    except (ValueError, TypeError, OverflowError): pass
    fail('INVALID_NUMBER', 'Kolom numerik harus berisi angka finite tanpa NULL; bersihkan data terlebih dahulu.')


def matrix(rows, columns, names):
    return [[numeric(row[columns.index(name)]) for name in names] for row in rows]


def selected(value, columns, empty=False):
    if not isinstance(value, list) or len(value) > 29 or (not value and not empty) or any(not isinstance(n, str) or n not in columns for n in value) or len(set(value)) != len(value):
        fail('INVALID_FEATURES', 'Pilih kolom fitur yang tersedia dan unik.')
    return value


def scalar(value):
    if value is None: return None
    if isinstance(value, bool): return 'true' if value else 'false'
    if hasattr(value, 'item'): value = value.item()
    if isinstance(value, float) and not math.isfinite(value): fail('NONFINITE_RESULT', 'Model menghasilkan angka tidak finite.')
    return str(value)


def compute(inputs, step):
    """Inputs are bounded (columns, rows) tables; returns the prediction table."""
    import numpy as np
    if not isinstance(step, dict) or step.get('type') != 'data_science': fail('INVALID_STEP', 'Konfigurasi tidak valid.')
    op = step.get('operation')
    common = 'type operation output'
    expected = {
        'inference_trusted': common + ' _trusted_model',
        'classification': common + ' target numeric categorical algorithm',
        'prediction': common + ' target numeric categorical algorithm',
        'clustering': common + ' features count algorithm',
        'outlier': common + ' source cutoff algorithm',
        'multivariate': common + ' features cutoff',
        'forecasting': common + ' time target periods history band frequency lower upper',
    }
    if op not in expected: fail('INVALID_OPERATION', 'Operasi Data Science tidak tersedia.')
    fields(step, expected[op])
    if not isinstance(inputs, list) or not 1 <= len(inputs) <= (2 if op in ('classification', 'prediction') else 1): fail('INVALID_INPUTS', 'Periksa koneksi input Data Science.')
    for columns, rows in inputs:
        schema(columns)
        if not isinstance(rows, list) or not 1 <= len(rows) <= 50 or any(not isinstance(row, list) or len(row) != len(columns) for row in rows): fail('INVALID_ROWS', 'Data Science memerlukan 1–50 baris per input.')
    columns, rows = inputs[0]
    output = text(step['output'], 128, True)
    predicted_columns, predicted_rows = inputs[-1]
    names = schema(predicted_columns + [output])
    if op == 'inference_trusted':
        from app.automl import infer
        values = infer(columns, rows, step['_trusted_model'])
    elif op in ('classification', 'prediction'):
        from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
        from sklearn.linear_model import LinearRegression
        from sklearn.naive_bayes import GaussianNB
        from sklearn.preprocessing import OneHotEncoder
        target = step['target']; source(target, columns)
        nums = selected(step['numeric'], columns, True); cats = selected(step['categorical'], columns, True)
        features = nums + cats
        if not features or len(set(features)) != len(features) or target in features: fail('INVALID_FEATURES', 'Target tidak boleh menjadi fitur; pilih minimal satu fitur unik.')
        selected(features, predicted_columns)
        if len(rows) < 2: fail('INSUFFICIENT_TRAINING', 'Training memerlukan minimal dua baris.')
        x = np.asarray(matrix(rows, columns, nums), dtype=float).reshape(len(rows), len(nums))
        xt = np.asarray(matrix(predicted_rows, predicted_columns, nums), dtype=float).reshape(len(predicted_rows), len(nums))
        if cats:
            def categories(table, cols):
                result = [[row[cols.index(c)] for c in cats] for row in table]
                if any(v is None for row in result for v in row): fail('MISSING_CATEGORY', 'Fitur kategori tidak boleh NULL.')
                return [[str(v) for v in row] for row in result]
            encoder = OneHotEncoder(handle_unknown='ignore', sparse_output=False)
            x = np.concatenate((x, encoder.fit_transform(categories(rows, columns))), axis=1)
            xt = np.concatenate((xt, encoder.transform(categories(predicted_rows, predicted_columns))), axis=1)
        y = [row[columns.index(target)] for row in rows]
        algorithm = step['algorithm']
        if op == 'classification':
            if any(v is None for v in y) or len(set(y)) < 2: fail('INVALID_TARGET', 'Classification memerlukan minimal dua kelas dan target tanpa NULL.')
            y = [str(v) for v in y]
            model = GaussianNB() if algorithm == 'Naive Bayes' else RandomForestClassifier(n_estimators=64, max_depth=12, random_state=0, n_jobs=1) if algorithm == 'Random Forest' else None
        else:
            y = [numeric(v) for v in y]
            model = LinearRegression() if algorithm == 'Linear Regression' else RandomForestRegressor(n_estimators=64, max_depth=12, random_state=0, n_jobs=1) if algorithm == 'Random Forest' else None
        if model is None: fail('INVALID_ALGORITHM', 'Algoritme tidak tersedia untuk operasi ini.')
        with warnings.catch_warnings():
            warnings.simplefilter('ignore'); model.fit(x, y)
            if algorithm == 'Naive Bayes' and (not np.isfinite(model.var_).all() or np.any(model.var_ <= 0)):
                fail('DEGENERATE_MODEL', 'Naive Bayes memerlukan fitur dengan variansi yang valid; pilih Random Forest atau fitur lain.')
            values = model.predict(xt)
        if op == 'classification' and any(str(v) not in set(y) for v in values): fail('MODEL_FAILED', 'Classification gagal menghasilkan kelas yang valid.')
    elif op == 'clustering':
        from sklearn.cluster import KMeans
        features = selected(step['features'], columns); x = np.asarray(matrix(rows, columns, features))
        count = integer(step['count'], 1, min(20, len(rows)))
        if len(np.unique(x, axis=0)) < count: fail('INSUFFICIENT_CLUSTERS', 'Jumlah baris fitur unik harus minimal sebanyak cluster.')
        if step['algorithm'] == 'k-means':
            values = KMeans(n_clusters=count, random_state=0, n_init=10).fit_predict(x)
        elif step['algorithm'] == 'k-medians':
            centers = x[np.random.default_rng(0).choice(len(x), count, replace=False)].copy()
            for _ in range(100):
                values = np.abs(x[:, None, :] - centers).sum(axis=2).argmin(axis=1)
                new = np.asarray([np.median(x[values == k], axis=0) if np.any(values == k) else x[np.abs(x[:, None, :] - centers).sum(axis=2).min(axis=1).argmax()] for k in range(count)])
                if np.allclose(centers, new): break
                centers = new
            values = np.abs(x[:, None, :] - centers).sum(axis=2).argmin(axis=1)
            if len(set(values)) != count: fail('CLUSTER_FAILED', 'K-medians tidak dapat membentuk seluruh cluster; gunakan data atau jumlah cluster lain.')
        else: fail('INVALID_ALGORITHM', 'Pilih k-means atau k-medians.')
        values = [int(v) + 1 for v in values]
    elif op == 'outlier':
        source(step['source'], columns); x = np.asarray([numeric(row[columns.index(step['source'])]) for row in rows])
        cutoff = numeric(step['cutoff'])
        if not 0 < cutoff <= 100: fail('INVALID_CUTOFF', 'Deviation cutoff harus lebih dari 0 dan maksimal 100.')
        if step['algorithm'] == 'Standard Deviation':
            if len(rows) < 2: fail('INSUFFICIENT_ROWS', 'Standard deviation memerlukan minimal dua baris.')
            center, deviation = np.mean(x), np.std(x, ddof=1)
        elif step['algorithm'] == 'Mean Absolute Deviation': center = np.median(x); deviation = np.median(np.abs(x - center))
        else: fail('INVALID_ALGORITHM', 'Algoritme outlier tidak tersedia.')
        values = [bool(abs(v - center) > cutoff * deviation) for v in x]
    elif op == 'multivariate':
        from scipy.stats import chi2
        features = selected(step['features'], columns); x = np.asarray(matrix(rows, columns, features))
        cutoff = numeric(step['cutoff'])
        if not 0 < cutoff < 1: fail('INVALID_CUTOFF', 'Quantile cutoff harus antara 0 dan 1.')
        if len(rows) <= len(features): fail('INSUFFICIENT_ROWS', 'Jumlah baris harus lebih besar dari jumlah fitur.')
        covariance = np.atleast_2d(np.cov(x, rowvar=False))
        if np.linalg.matrix_rank(covariance) < len(features): fail('SINGULAR_COVARIANCE', 'Fitur konstan atau saling bergantung; pilih fitur independen.')
        delta = x - x.mean(axis=0)
        distances = np.einsum('ij,jk,ik->i', delta, np.linalg.inv(covariance), delta)
        values = [int(v > chi2.ppf(cutoff, len(features))) for v in distances]
    else:
        return forecast(columns, rows, step)
    return names, [[scalar(v) for v in row] + [scalar(pred)] for row, pred in zip(predicted_rows, values)]


def forecast(columns, rows, step):
    import numpy as np
    from statsmodels.tsa.arima.model import ARIMA
    source(step['time'], columns); source(step['target'], columns)
    if step['time'] == step['target']: fail('INVALID_TIME', 'Kolom waktu dan target harus berbeda.')
    names = schema(columns + [step['output'], step['lower'], step['upper']])
    periods = integer(step['periods'], 1, 25); frequency = integer(step['frequency'], 1, 12)
    history = integer(step['history'], 0, 50) if step['history'] is not None else None
    band = numeric(step['band'])
    if not 1 <= band <= 99: fail('INVALID_BAND', 'Prediction band harus 1–99.')
    try:
        dates = [datetime.fromisoformat(str(row[columns.index(step['time'])]).replace('Z', '+00:00')) for row in rows]
        paired = sorted(zip(dates, rows), key=lambda pair: pair[0])
        dates, rows = [p[0] for p in paired], [p[1] for p in paired]
        intervals = [(b - a).total_seconds() for a, b in zip(dates, dates[1:])]
        if not intervals or min(intervals) <= 0: raise ValueError()
    except (ValueError, TypeError, OverflowError): fail('INVALID_TIME', 'Waktu harus berupa tanggal ISO unik dengan zona waktu yang konsisten.')
    if len(rows) < max(8, 2 * frequency): fail('INSUFFICIENT_HISTORY', 'ARIMA memerlukan minimal 8 observasi dan dua periode musiman.')
    kept = rows if history is None else rows[-history:] if history else []
    if len(kept) + periods > 50: fail('FORECAST_ROW_LIMIT', 'Kurangi baris sebelumnya agar history + periode baru maksimal 50; training tetap memakai seluruh sampel.')
    y = [numeric(row[columns.index(step['target'])]) for row in rows]
    candidates = []
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        for order in ((0, 1, 0), (1, 0, 0), (0, 1, 1), (1, 1, 0), (1, 1, 1)):
            try:
                fit = ARIMA(y, order=order, seasonal_order=(1, 0, 0, frequency) if frequency > 1 else (0, 0, 0, 0), trend='t' if order[1] else 'ct').fit(method_kwargs={'maxiter': 35})
                if math.isfinite(fit.aic) and fit.mle_retvals.get('converged', False): candidates.append(fit)
            except (ValueError, np.linalg.LinAlgError): pass
    if not candidates: fail('FORECAST_FAILED', 'Tidak ada model ARIMA yang konvergen; periksa data atau frequency.')
    forecasted = min(candidates, key=lambda fit: fit.aic).get_forecast(steps=periods)
    predictions, bounds = forecasted.predicted_mean, forecasted.conf_int(alpha=1 - band / 100)
    from datetime import timedelta
    interval = timedelta(seconds=sum(intervals) / len(intervals))
    result = [[scalar(v) for v in row] + [None, None, None] for row in kept]
    for i in range(periods):
        row = [None] * len(columns)
        stamp = dates[-1] + interval * (i + 1)
        row[columns.index(step['time'])] = stamp.date().isoformat() if all(d.time().isoformat() == '00:00:00' for d in dates) and stamp.time().isoformat() == '00:00:00' else stamp.isoformat()
        result.append(row + [scalar(predictions[i]), scalar(bounds[i][0]), scalar(bounds[i][1])])
    return names, result


def apply_science(frames, step):
    from pyspark.sql.types import StructType, StructField, StringType
    inputs = [(frame.columns, [list(row) for row in frame.take(51)]) for frame in frames]
    try:
        names, rows = compute(inputs, step)
    except ScienceError: raise
    except (ValueError, TypeError, KeyError, OverflowError) as exc:
        fail('INVALID_CONFIG', 'Konfigurasi atau data tidak valid: ' + str(exc)[:300])
    return frames[0].sparkSession.createDataFrame(rows, StructType([StructField(n, StringType(), True) for n in names])).coalesce(1)
