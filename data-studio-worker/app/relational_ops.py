"""Bounded filtering, aggregation, window and reshape DataFrame operations."""
from pyspark.sql import functions as F, Window
from app.operation_common import fields, source, schema, text, integer, col, number, cast_column
from app.expressions import expression

AGGREGATIONS = ('sum', 'avg', 'min', 'max', 'count', 'count_distinct', 'first', 'last')


def aggregate(spec, names, condition=None):
    fields(spec, 'op column output kind' + (' label' if 'label' in spec else ''))
    op = spec['op']
    if op not in AGGREGATIONS or spec['kind'] not in ('Text', 'Number'):
        raise ValueError('INVALID_AGGREGATION')
    if op == 'count' and spec['column'] == '*':
        value = F.lit(1)
    else:
        value = source(spec['column'], names)
        if op in ('sum', 'avg') or (op in ('min', 'max') and spec['kind'] == 'Number'):
            value = number(value)
    if condition is not None: value = F.when(condition, value)
    if op == 'count_distinct': result = F.countDistinct(value)
    elif op == 'first': result = F.first(value, ignorenulls=True)
    elif op == 'last': result = F.last(value, ignorenulls=True)
    else: result = {'sum': F.sum, 'avg': F.avg, 'min': F.min, 'max': F.max, 'count': F.count}[op](value)
    return result.alias(text(spec['output'], 128, True))


def column_list(items, names):
    if not isinstance(items, list) or len(items) > 30 or len(set(items)) != len(items): raise ValueError('INVALID_COLUMN_LIST')
    for name in items: source(name, names)
    return items


def apply_relational(frame, names, step):
    kind = step.get('type')
    if kind == 'expression_filter':
        fields(step, 'type predicate')
        return frame.filter(expression(step['predicate'], names)), names
    if kind == 'deduplicate':
        fields(step, 'type keys insensitive')
        keys = column_list(step['keys'], names) or names
        if type(step['insensitive']) is not bool: raise ValueError('INVALID_CASE_MODE')
        # Preserve the first sample representative even for case-insensitive keys.
        key_columns = [F.lower(col(name).cast('string')) if step['insensitive'] else col(name) for name in keys]
        hidden = '__studio_row'
        while hidden in names: hidden += '_'
        rank = hidden + '_rank'
        while rank in names: rank += '_'
        frame = frame.withColumn(hidden, F.monotonically_increasing_id())
        window = Window.partitionBy(*key_columns).orderBy(col(hidden))
        return frame.withColumn(rank, F.row_number().over(window)).filter(col(rank) == 1).orderBy(col(hidden)).select(*[col(name) for name in names]), names
    if kind in ('group', 'pivot'):
        fields(step, 'type groups aggregates' + (' label' if kind == 'pivot' else ''))
        groups = column_list(step['groups'], names); specs = step['aggregates']
        if not isinstance(specs, list) or not 1 <= len(specs) <= 30: raise ValueError('INVALID_AGGREGATIONS')
        if kind == 'pivot': source(step['label'], names)
        output = schema(groups + [spec['output'] for spec in specs])
        calculations = []
        for spec in specs:
            condition = col(step['label']).cast('string') == F.lit(text(spec['label'])) if kind == 'pivot' else None
            calculations.append(aggregate(spec, names, condition))
        return frame.groupBy(*[col(name) for name in groups]).agg(*calculations), output
    if kind == 'window':
        fields(step, 'type partition order direction kind calculations')
        partition = column_list(step['partition'], names); ordering = source(step['order'], names)
        if step['kind'] == 'Number': ordering = number(ordering)
        elif step['kind'] == 'Date': ordering = cast_column(step['order'], 'Date')
        elif step['kind'] != 'Text': raise ValueError('INVALID_WINDOW_ORDER')
        if step['direction'] not in ('asc', 'desc'): raise ValueError('INVALID_ORDER_DIRECTION')
        ordering = ordering.asc_nulls_last() if step['direction'] == 'asc' else ordering.desc_nulls_last()
        calculations = step['calculations']
        if not isinstance(calculations, list) or not 1 <= len(calculations) <= 30: raise ValueError('INVALID_WINDOWS')
        output = schema(names + [spec['output'] for spec in calculations])
        hidden = '__studio_order'
        while hidden in names + output: hidden += '_'
        frame = frame.withColumn(hidden, F.monotonically_increasing_id())
        base = Window.partitionBy(*[col(name) for name in partition]).orderBy(ordering)
        stable = Window.partitionBy(*[col(name) for name in partition]).orderBy(ordering, col(hidden))
        for spec in calculations:
            fields(spec, 'op column output amount'); op = spec['op']
            if op in ('row_number', 'rank', 'dense_rank', 'percent_rank', 'cume_dist'):
                value = {'row_number': F.row_number, 'rank': F.rank, 'dense_rank': F.dense_rank, 'percent_rank': F.percent_rank, 'cume_dist': F.cume_dist}[op]().over(stable if op == 'row_number' else base)
            elif op == 'ntile': value = F.ntile(integer(spec['amount'], 1, 50)).over(stable)
            elif op in ('lag', 'lead'):
                value = (F.lag if op == 'lag' else F.lead)(source(spec['column'], names), integer(spec['amount'])).over(stable)
            elif op in ('running_sum', 'running_avg', 'running_count', 'running_min', 'running_max'):
                item = source(spec['column'], names)
                if op != 'running_count': item = number(item)
                value = {'running_sum': F.sum, 'running_avg': F.avg, 'running_count': F.count, 'running_min': F.min, 'running_max': F.max}[op](item).over(stable.rowsBetween(Window.unboundedPreceding, Window.currentRow))
            else: raise ValueError('INVALID_WINDOW_FUNCTION')
            frame = frame.withColumn(spec['output'], value)
        return frame.drop(hidden), output
    if kind == 'unpivot':
        fields(step, 'type keep mappings dynamic label value include_nulls')
        if type(step['dynamic']) is not bool or type(step['include_nulls']) is not bool: raise ValueError('INVALID_UNPIVOT')
        mappings = step['mappings']
        if step['dynamic']:
            keep = column_list(step['keep'], names)
            mappings = [{'column': name, 'label': name} for name in names if name not in keep]
        else:
            if not isinstance(mappings, list) or not 1 <= len(mappings) <= 30: raise ValueError('INVALID_UNPIVOT')
            keep = [name for name in names if not any(item.get('column') == name for item in mappings)]
            if step['keep'] is not None and step['keep'] != keep: raise ValueError('INVALID_UNPIVOT_KEYS')
        if not mappings: raise ValueError('INVALID_UNPIVOT')
        output = schema(keep + [step['label'], step['value']])
        pieces = []
        for mapping in mappings:
            fields(mapping, 'column label')
            pieces.append(F.struct(F.lit(text(mapping['label'], 128, True)).alias('label'), source(mapping['column'], names).cast('string').alias('value')))
        hidden = '__studio_unpivot'
        while hidden in names + output: hidden += '_'
        expanded = frame.select(*[col(name) for name in keep], F.explode(F.array(*pieces)).alias(hidden))
        frame = expanded.select(*[col(name) for name in keep], col(hidden).getField('label').alias(step['label']), col(hidden).getField('value').alias(step['value']))
        if not step['include_nulls']: frame = frame.filter(col(step['value']).isNotNull())
        return frame, output
    raise ValueError('UNSUPPORTED_RELATIONAL_STEP')
