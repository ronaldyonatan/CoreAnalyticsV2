"""Shared validation and bounded conversions for preview operations."""
import math
import re
from app.execution_policy import policy, bound_text
from pyspark.sql import functions as F

NUMBER = r'^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$'
CAST_TYPES = {'Text': 'string', 'Floating Decimal': 'double', 'Fixed Decimal': 'decimal(38,10)', 'Integer': 'bigint', 'Date': 'date', 'Timestamp': 'timestamp', 'Boolean': 'boolean', 'Null': 'string'}


def quote(name):
    return '`' + name.replace('`', '``') + '`'


def col(name):
    return F.col(quote(name))


def text(value, limit=256, nonempty=False):
    if not isinstance(value, str) or len(value) > limit or (nonempty and not value.strip()):
        raise ValueError('INVALID_TEXT_VALUE')
    return value


def integer(value, low=0, high=None):
    high = policy().row_parameter_limit if high is None else high
    if type(value) is not int or not low <= value <= high:
        raise ValueError('INVALID_INTEGER')
    return value


def schema(names):
    if not isinstance(names, list) or not 1 <= len(names) <= policy().column_limit:
        raise ValueError('INVALID_OUTPUT_COLUMNS')
    for name in names:
        text(name, 128, True)
    if len({name.lower() for name in names}) != len(names):
        raise ValueError('DUPLICATE_OUTPUT_COLUMN')
    return names


def source(name, names):
    if not isinstance(name, str) or name not in names:
        raise ValueError('SOURCE_COLUMN_INVALID')
    return col(name)


def add(names, name, overwrite=None):
    text(name, 128, True)
    if name != overwrite:
        schema(names + [name])
        names.append(name)
    return name


def fields(step, expected):
    if not isinstance(step, dict) or set(step) != set(expected.split()):
        raise ValueError('INVALID_OPERATION_FIELDS')


def finite(expression):
    return F.when(~F.isnan(expression) & (F.abs(expression) != F.lit(float('inf'))), expression)


def number(expression):
    string = F.trim(expression.cast('string'))
    return finite(F.when(string.rlike(NUMBER), string.cast('double')))


def literal(value):
    if value is None or type(value) is bool:
        return F.lit(value)
    if isinstance(value, str):
        return F.lit(text(value))
    if type(value) in (int, float) and math.isfinite(value) and abs(value) <= 1e308:
        return F.lit(float(value))
    raise ValueError('INVALID_LITERAL')


def cast_column(name, kind):
    if kind not in CAST_TYPES:
        raise ValueError('INVALID_CAST_TYPE')
    if kind == 'Null':
        return F.lit(None).cast('string')
    if kind == 'Text':
        return bound_text(col(name).cast('string'))
    expression = F.expr(f'try_cast({quote(name)} AS {CAST_TYPES[kind]})')
    return finite(expression) if kind == 'Floating Decimal' else expression
