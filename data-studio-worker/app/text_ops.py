"""Literal, bounded text transforms. Never evaluate SQL or user expressions."""
import re
from app.execution_policy import bound_text, policy
from pyspark.sql import functions as F


def _col(name):
    return F.col('`' + name.replace('`', '``') + '`')


def _text(value, *, nonempty=False, limit=256):
    return isinstance(value, str) and len(value) <= limit and (not nonempty or bool(value))


def _integer(value):
    return type(value) is int and 1 <= value <= 256


def apply_text(frame, current, step):
    """Apply one validated operation and return its exact output schema."""
    kind = step.get('type')
    fields = {
        'combine': {'type', 'columns', 'output', 'delimiter', 'remove_sources'},
        'replace': {'type', 'column', 'find', 'replacement'},
        'split': {'type', 'column', 'outputs', 'delimiter', 'keep_extra', 'remove_source'},
        'format': {'type', 'column', 'case', 'numbers'},
    }
    if kind != 'string' and (kind not in fields or set(step) != fields[kind]):
        raise ValueError('INVALID_TEXT_STEP')
    names = current[:]

    def source(name):
        if not isinstance(name, str) or name not in names:
            raise ValueError('TEXT_SOURCE_INVALID')
        return _col(name)

    def add(name, overwrite=None):
        if not _text(name, nonempty=True, limit=128) or not name.strip() or (name != overwrite and name.lower() in {c.lower() for c in names}):
            raise ValueError('TEXT_OUTPUT_INVALID')
        if name != overwrite:
            names.append(name)
        if len(names) > policy().column_limit:
            raise ValueError('TOO_MANY_OUTPUT_COLUMNS')

    if kind == 'combine':
        columns = step['columns']
        if not isinstance(columns, list) or not 2 <= len(columns) <= 30 or any(not isinstance(c, str) for c in columns) or len(set(columns)) != len(columns) or not _text(step['delimiter']) or type(step['remove_sources']) is not bool:
            raise ValueError('INVALID_COMBINE')
        expressions = [source(name) for name in columns]
        if not isinstance(step['output'], str) or step['output'].lower() in {c.lower() for c in names}:
            raise ValueError('TEXT_OUTPUT_INVALID')
        if step['remove_sources']:
            names = [name for name in names if name not in columns]
        add(step['output'])
        # A null input is an empty field, so column positions and delimiters remain visible.
        expression = F.concat_ws(step['delimiter'], *[F.coalesce(col, F.lit('')) for col in expressions])
        frame = frame.withColumn(step['output'], bound_text(expression))
        if step['remove_sources']:
            frame = frame.drop(*columns)
    elif kind == 'replace':
        col = source(step['column'])
        if not _text(step['find'], nonempty=True) or not _text(step['replacement']):
            raise ValueError('INVALID_REPLACE')
        replacement = step['replacement'].replace('\\', '\\\\').replace('$', '\\$')
        frame = frame.withColumn(step['column'], bound_text(F.regexp_replace(col, re.escape(step['find']), replacement)))
    elif kind == 'split':
        col = source(step['column'])
        outputs = step['outputs']
        if not isinstance(outputs, list) or not 1 <= len(outputs) <= 30 or any(not _text(name, nonempty=True, limit=128) for name in outputs) or len({name.lower() for name in outputs}) != len(outputs) or not _text(step['delimiter'], nonempty=True) or type(step['keep_extra']) is not bool or type(step['remove_source']) is not bool:
            raise ValueError('INVALID_SPLIT')
        if any(name.lower() in {c.lower() for c in names} for name in outputs):
            raise ValueError('TEXT_OUTPUT_INVALID')
        if step['remove_source']:
            names.remove(step['column'])
        for name in outputs:
            add(name)
        parts = F.split(col, re.escape(step['delimiter']), len(outputs) if step['keep_extra'] else -1)
        for index, name in enumerate(outputs):
            frame = frame.withColumn(name, F.when(F.size(parts) > index, parts[index]).otherwise(F.lit(None).cast('string')))
        if step['remove_source']:
            frame = frame.drop(step['column'])
    elif kind == 'format':
        col = source(step['column'])
        case, numbers = step['case'], step['numbers']
        if case not in ('', 'lower', 'upper', 'capitalize_first') or numbers not in ('', 'remove_numbers', 'only_numbers') or not (case or numbers):
            raise ValueError('INVALID_FORMAT')
        if numbers:
            col = F.regexp_replace(col, r'\p{Nd}' if numbers == 'remove_numbers' else r'[^\p{Nd}]', '')
        if case == 'lower':
            col = F.lower(col)
        elif case == 'upper':
            col = F.upper(col)
        elif case == 'capitalize_first':
            col = F.concat(F.upper(F.substring(col, 1, 1)), F.substring(col, 2, 256 if policy().text_limit is not None else 2_147_483_647))
        frame = frame.withColumn(step['column'], bound_text(col))
    elif kind == 'string':
        op = step.get('op')
        extra = {'substring': {'start', 'length'}, 'right_left_substring': {'side', 'length'}, 'trim_spaces': {'trim'}, 'pad_with_space': {'side', 'width'}}
        if not isinstance(op, str) or op not in extra or set(step) != {'type', 'column', 'output', 'op'} | extra[op]:
            raise ValueError('INVALID_STRING_OPERATION')
        col = source(step['column'])
        add(step['output'], step['column'])
        if op == 'substring':
            if not _integer(step['start']) or not _integer(step['length']):
                raise ValueError('INVALID_SUBSTRING')
            col = F.substring(col, step['start'], step['length'])
        elif op == 'right_left_substring':
            if step['side'] not in ('left', 'right') or not _integer(step['length']):
                raise ValueError('INVALID_SUBSTRING')
            col = F.substring(col, 1 if step['side'] == 'left' else -step['length'], step['length'])
        elif op == 'trim_spaces':
            if step['trim'] not in ('both', 'left', 'right'):
                raise ValueError('INVALID_TRIM')
            col = {'both': F.trim, 'left': F.ltrim, 'right': F.rtrim}[step['trim']](col)
        elif op == 'pad_with_space':
            if step['side'] not in ('left', 'right') or not _integer(step['width']):
                raise ValueError('INVALID_PADDING')
            padded = (F.lpad if step['side'] == 'left' else F.rpad)(col, step['width'], ' ')
            col = F.when(F.length(col) < step['width'], padded).otherwise(col)
        frame = frame.withColumn(step['output'], bound_text(col))
    return frame, names
