"""A scripting node exchanges bounded tables with an isolated runtime."""
from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import StructType, StructField, StringType
from app.operation_common import fields, schema, cast_column, CAST_TYPES, col
from app.script_runner import run_script, ScriptError


def apply_script(frame, current, step):
    fields(step, 'type language code outputs')
    outputs = step['outputs']
    if not isinstance(outputs, list) or not 1 <= len(outputs) <= 30: raise ScriptError('SCRIPT_COLUMNS_INVALID')
    for output in outputs:
        fields(output, 'name kind')
        if not isinstance(output['kind'], str) or output['kind'] not in CAST_TYPES: raise ScriptError('SCRIPT_OUTPUT_TYPE_INVALID')
    names = schema([output['name'] for output in outputs])
    sample = frame.select(*[F.substring(col(name).cast('string'), 1, 256).alias(name) for name in current])
    rows = [list(row) for row in sample.take(50)]
    result = run_script(step['language'], current, rows, step['code'])
    if result['columns'] != names: raise ScriptError('SCRIPT_SCHEMA_MISMATCH', 'Kolom dan urutan output harus sesuai konfigurasi kolom hasil.')
    frame = frame.sparkSession.createDataFrame(result['rows'], StructType([StructField(name, StringType(), True) for name in names])).coalesce(1)
    frame = frame.select(*[cast_column(output['name'], output['kind']).alias(output['name']) for output in outputs])
    return frame, names, result['logs']
