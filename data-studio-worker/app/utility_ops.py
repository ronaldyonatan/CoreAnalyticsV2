"""Dates, numbers and Utility operations over bounded local Spark samples."""
import re
from datetime import date
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType
from app.operation_common import fields, text, integer, schema, source, add, col, cast_column, number, finite, literal
from app.expressions import expression, apply_query


def operand(spec, names, date_value=False):
    fields(spec, 'kind value')
    value = text(spec['value'])
    if spec['kind'] == 'column':
        source(value, names)
        return cast_column(value, 'Date') if date_value else number(col(value))
    if spec['kind'] != 'value':
        raise ValueError('INVALID_OPERAND')
    if date_value:
        try: return F.lit(date.fromisoformat(value))
        except ValueError: raise ValueError('INVALID_DATE_LITERAL') from None
    if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', value):
        raise ValueError('INVALID_NUMBER_LITERAL')
    return number(literal(value))


def apply_utility(frame, current, step):
    names = current[:]
    kind = step.get('type')
    if kind in ('calculate', 'date'):
        fields(step, 'type output op left right' + (' unit' if kind == 'date' else ''))
        op = step['op']
        left = operand(step['left'], names, kind == 'date')
        overwrite = step['left']['value'] if step['left']['kind'] == 'column' else None
        add(names, step['output'], overwrite)
        if kind == 'calculate':
            if op in ('ceiling', 'floor'):
                if step['right'] is not None: raise ValueError('INVALID_OPERAND')
                value = (F.ceil if op == 'ceiling' else F.floor)(left)
            else:
                right = operand(step['right'], current)
                if op == 'addition': value = left + right
                elif op == 'subtraction': value = left - right
                elif op == 'multiplication': value = left * right
                elif op == 'division': value = left / F.when(right != 0, right)
                elif op == 'power': value = F.pow(left, right)
                else: raise ValueError('INVALID_CALCULATOR')
                value = finite(value)
        else:
            unit = step['unit']
            if unit not in ('days', 'months', 'years'): raise ValueError('INVALID_DATE_UNIT')
            extractors = {'Year of date': F.year, 'Quarter of date': F.quarter, 'Month of date': F.month, 'Day of year': F.dayofyear, 'Day of month': F.dayofmonth, 'Day of week': F.dayofweek, 'Week of year': F.weekofyear}
            if op in extractors:
                if step['right'] is not None: raise ValueError('INVALID_OPERAND')
                value = extractors[op](left)
            elif op == 'Difference between dates':
                value = F.datediff(left, operand(step['right'], current, True))
            elif op in ('Subtract from date', 'Add to date'):
                amount = operand(step['right'], current)
                maximum = {'days': 366000, 'months': 12000, 'years': 1000}[unit]
                valid = (amount == F.floor(amount)) & (F.abs(amount) <= maximum)
                safe = F.when(valid, amount).cast('int')
                if op == 'Subtract from date': safe = -safe
                value = F.date_add(left, safe) if unit == 'days' else F.add_months(left, safe * (12 if unit == 'years' else 1))
            else: raise ValueError('INVALID_DATE_OPERATION')
        return frame.withColumn(step['output'], value), names
    if kind == 'formula':
        fields(step, 'type output expression')
        value = expression(step['expression'], names)
        add(names, step['output'])
        return frame.withColumn(step['output'], value), names
    if kind == 'query':
        return apply_query(frame, names, step)
    if kind == 'constant':
        fields(step, 'type output kind value')
        add(names, step['output'])
        frame = frame.withColumn(step['output'], F.lit(text(step['value'])))
        return frame.withColumn(step['output'], cast_column(step['output'], step['kind'])), names
    if kind == 'duplicate':
        fields(step, 'type column output')
        value = source(step['column'], names); add(names, step['output'])
        return frame.withColumn(step['output'], value), names
    if kind == 'alter':
        fields(step, 'type changes drop')
        changes, drop = step['changes'], step['drop']
        if not isinstance(changes, list) or len(changes) > 30 or not isinstance(drop, list) or len(drop) > 30 or not (changes or drop): raise ValueError('INVALID_ALTER')
        for name in drop: source(name, names)
        mapped = {}
        for change in changes:
            fields(change, 'column output kind'); source(change['column'], names)
            if change['column'] in mapped or change['column'] in drop: raise ValueError('INVALID_ALTER')
            text(change['output'], 128, True)
            mapped[change['column']] = change
        result, projections = [], []
        for name in names:
            if name in drop: continue
            change = mapped.get(name)
            output = change['output'] if change else name
            value = cast_column(name, change['kind']) if change and change['kind'] else col(name)
            result.append(output); projections.append(value.alias(output))
        return frame.select(*projections), schema(result)
    if kind == 'schema':
        fields(step, 'type names'); names = schema(step['names'])
        if len(names) != 3: raise ValueError('INVALID_SCHEMA_OUTPUT')
        rows = [(field.name, '`' + field.name.replace('`', '``') + '`', field.dataType.simpleString()) for field in frame.schema.fields]
        result = frame.sparkSession.createDataFrame(rows, StructType([StructField(name, StringType(), True) for name in names]))
        return result, names
    if kind == 'json':
        fields(step, 'type column mappings'); value = source(step['column'], names)
        mappings = step['mappings']
        if not isinstance(mappings, list) or not 1 <= len(mappings) <= 30: raise ValueError('INVALID_JSON_MAPPINGS')
        for mapping in mappings:
            fields(mapping, 'path output kind')
            path = text(mapping['path'])
            if not re.fullmatch(r'\$(?:\.[^\W\d]\w*|\[\d{1,3}\]){1,12}', path): raise ValueError('INVALID_JSON_PATH')
            add(names, mapping['output'])
            frame = frame.withColumn(mapping['output'], F.get_json_object(value.cast('string'), path))
            frame = frame.withColumn(mapping['output'], cast_column(mapping['output'], mapping['kind']))
        return frame, names
    if kind == 'limit':
        fields(step, 'type count offset')
        return frame.offset(integer(step['offset'])).limit(integer(step['count'])), names
    if kind == 'series':
        fields(step, 'type output count start step')
        names = schema([step['output']]); count = integer(step['count'], 1, 50)
        start, increment = integer(step['start'], -1000000, 1000000), integer(step['step'], -1000000, 1000000)
        return frame.sparkSession.range(count).select((F.col('id') * increment + start).alias(names[0])), names
    if kind == 'meta_select':
        fields(step, 'type columns pattern')
        selected, pattern = step['columns'], text(step['pattern'], 128, True)
        if not isinstance(selected, list) or len(selected) > 30: raise ValueError('INVALID_META_SELECT')
        for name in selected: source(name, names)
        def matches(name):
            previous = [True] + [False] * len(name)
            for token in pattern:
                next_row = [token == '*' and previous[0]]
                for i, character in enumerate(name, 1):
                    next_row.append((previous[i] or next_row[i - 1]) if token == '*' else (previous[i - 1] and (token == '?' or token == character)))
                previous = next_row
            return previous[-1]
        names = schema([name for name in names if (not selected or name in selected) and matches(name)])
        return frame.select(*[col(name) for name in names]), names
    if kind == 'order':
        fields(step, 'type items'); items = step['items']
        if not isinstance(items, list) or not 1 <= len(items) <= 30: raise ValueError('INVALID_ORDER')
        sorting = []
        for item in items:
            fields(item, 'column direction kind'); value = source(item['column'], names)
            if item['kind'] == 'Number': value = number(value)
            elif item['kind'] == 'Date': value = cast_column(item['column'], 'Date')
            elif item['kind'] != 'Text': raise ValueError('INVALID_ORDER_TYPE')
            else: value = value.cast('string')
            if item['direction'] not in ('asc', 'desc'): raise ValueError('INVALID_ORDER_DIRECTION')
            sorting.append(value.asc_nulls_last() if item['direction'] == 'asc' else value.desc_nulls_last())
        return frame.orderBy(*sorting), names
    if kind == 'mapper':
        fields(step, 'type column output kind mappings unmatched default')
        value = source(step['column'], names)
        add(names, step['output'], step['column'])
        mappings = step['mappings']
        if not isinstance(mappings, list) or not 1 <= len(mappings) <= 30: raise ValueError('INVALID_MAPPINGS')
        seen = set()
        if step['unmatched'] not in ('keep', 'default'): raise ValueError('INVALID_UNMATCHED')
        result = value.cast('string') if step['unmatched'] == 'keep' else F.lit(text(step['default']))
        for pair in reversed(mappings):
            if not isinstance(pair, list) or len(pair) != 2: raise ValueError('INVALID_MAPPING')
            original, mapped = text(pair[0]), text(pair[1])
            if original in seen: raise ValueError('DUPLICATE_MAPPING')
            seen.add(original)
            result = F.when(value.cast('string') == original, F.lit(mapped)).otherwise(result)
        original_type = frame.schema[step['column']].dataType.typeName()
        original_kind = {'string': 'Text', 'long': 'Integer', 'integer': 'Integer', 'short': 'Integer', 'byte': 'Integer', 'double': 'Floating Decimal', 'float': 'Floating Decimal', 'decimal': 'Fixed Decimal', 'date': 'Date', 'timestamp': 'Timestamp', 'boolean': 'Boolean'}.get(original_type, 'Text')
        frame = frame.withColumn(step['output'], result)
        frame = frame.withColumn(step['output'], cast_column(step['output'], step['kind'] or original_kind))
        return frame, names
    raise ValueError('UNSUPPORTED_UTILITY')
