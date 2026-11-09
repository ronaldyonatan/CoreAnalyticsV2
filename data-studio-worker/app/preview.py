"""Bounded Spark preview over in-memory rows; only the local AI adapter uses HTTP."""
from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import StringType, StructField, StructType
from app.text_ops import apply_text
from app.utility_ops import apply_utility
from app.operation_common import col, finite
from app.execution_policy import bound_text
from pyspark.sql.types import DoubleType, FloatType

MAX_ROWS = 50
MAX_COLUMNS = 30


def preview(rows, columns, steps, spark=None):
    if not isinstance(columns, list) or not 1 <= len(columns) <= MAX_COLUMNS or any(not isinstance(c, str) or not c or len(c) > 128 for c in columns) or len(set(c.lower() for c in columns)) != len(columns):
        raise ValueError('INVALID_COLUMNS')
    if not isinstance(rows, list) or len(rows) > MAX_ROWS or any(not isinstance(row, list) or len(row) != len(columns) or any(cell is not None and (not isinstance(cell, str) or len(cell) > 256) for cell in row) for row in rows):
        raise ValueError('INVALID_ROWS')
    if not isinstance(steps, list) or len(steps) > 30:
        raise ValueError('INVALID_STEPS')
    if sum(isinstance(step, dict) and step.get('type') == 'script' for step in steps) > 4: raise ValueError('SCRIPT_TOO_MANY_STEPS')
    own_session = spark is None
    spark = spark or SparkSession.builder.master('local[2]').appName('CoreAnalytics bounded preview').config('spark.ui.enabled', 'false').config('spark.sql.shuffle.partitions', '2').getOrCreate()
    try:
        frame = spark.createDataFrame(rows, StructType([StructField(c, StringType(), True) for c in columns]))
        current = columns[:]
        script_logs, ai_usage = [], []
        frame, current = transform(frame, current, steps, script_logs, ai_usage=ai_usage)
        frame = frame.select(*[F.substring(col(name).cast('string'), 1, 256).alias(name) for name in current])
        result = {'columns': current, 'rows': [list(row) for row in frame.take(MAX_ROWS)]}
        if script_logs: result['script_logs'] = script_logs
        if ai_usage: result['ai_usage'] = ai_usage
        return result
    finally:
        if own_session:
            spark.stop()


def transform(frame, current, steps, script_logs=None, node_id=None, ai_usage=None, ai_budget=None):
    for step in steps:
        if not isinstance(step, dict):
            raise ValueError('INVALID_STEP')
        if step.get('type') == 'filter' and set(step) == {'type', 'column', 'op', 'value'}:
            column, op, value = step['column'], step['op'], step['value']
            if column not in current or op not in ('eq', 'neq', 'null', 'notnull') or (op in ('eq', 'neq') and (not isinstance(value, str) or len(value) > 256)):
                raise ValueError('INVALID_FILTER')
            filter_column = F.col('`' + column.replace('`', '``') + '`')
            predicate = (filter_column == value) if op == 'eq' else ((filter_column != value) | filter_column.isNull()) if op == 'neq' else filter_column.isNull() if op == 'null' else filter_column.isNotNull()
            frame = frame.filter(predicate)
        elif step.get('type') == 'select' and set(step) in ({'type', 'columns'}, {'type', 'columns', 'renames'}):
            selected = step['columns']
            if not isinstance(selected, list) or not selected or any(not isinstance(c, str) or c not in current for c in selected) or len(set(selected)) != len(selected):
                raise ValueError('INVALID_SELECT')
            renames = step.get('renames', {})
            if not isinstance(renames, dict) or not set(renames).issubset(selected) or any(not isinstance(v, str) or len(v) > 128 for v in renames.values()):
                raise ValueError('INVALID_RENAMES')
            names = [renames.get(c, '').strip() or c for c in selected]
            if len(set(c.lower() for c in names)) != len(names):
                raise ValueError('DUPLICATE_OUTPUT_COLUMN')
            frame = frame.select(*[F.col('`' + c.replace('`', '``') + '`').alias(name) for c, name in zip(selected, names)])
            current = names
        elif step.get('type') in ('combine', 'replace', 'split', 'string', 'format'):
            frame, current = apply_text(frame, current, step)
        elif step.get('type') in ('calculate', 'date', 'formula', 'query', 'constant', 'duplicate', 'alter', 'schema', 'json', 'limit', 'series', 'meta_select', 'order', 'mapper'):
            frame, current = apply_utility(frame, current, step)
        elif step.get('type') in ('ai_llm', 'ai_model_trusted'):
            from app.ai_services import apply_ai, AIBudget
            ai_budget = ai_budget or AIBudget()
            frame, usage = apply_ai(frame, step, ai_budget); current = frame.columns
            if ai_usage is not None: ai_usage.append({'node': node_id, **usage})
        elif step.get('type') == 'data_science':
            from app.data_science import apply_science
            frame = apply_science([frame], step); current = frame.columns
        elif step.get('type') == 'script':
            from app.scripting import apply_script
            from app.script_runner import ScriptError
            try:
                frame, current, log = apply_script(frame, current, step)
            except ScriptError as exc:
                exc.detail = f"{step.get('language', 'script').upper()} · {node_id or 'script'}: {exc.detail or str(exc)}"[:1000]
                raise
            if script_logs is not None: script_logs.append({'node': node_id, 'language': step['language'], 'logs': log})
        elif step.get('type') in ('deduplicate', 'expression_filter', 'group', 'window', 'pivot', 'unpivot'):
            from app.relational_ops import apply_relational
            frame, current = apply_relational(frame, current, step)
        else:
            raise ValueError('UNSUPPORTED_STEP')
        # Keep intermediate strings bounded while preserving numeric/date types.
        frame = frame.select(*[(bound_text(col(field.name)) if isinstance(field.dataType, StringType) else finite(col(field.name)) if isinstance(field.dataType, (DoubleType, FloatType)) else col(field.name)).alias(field.name) for field in frame.schema.fields])
    frame = frame.select(*[(bound_text(col(field.name)) if isinstance(field.dataType, StringType) else finite(col(field.name)) if isinstance(field.dataType, (DoubleType, FloatType)) else col(field.name)).alias(field.name) for field in frame.schema.fields])
    return frame, current
