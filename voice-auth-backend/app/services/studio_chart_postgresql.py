"""Bounded chart aggregation against an authorized PostgreSQL dataset."""
from contextlib import closing
import decimal
import math
import re

from psycopg import sql
from app.connectors.postgresql_adapter import _connect, _object_metadata
from app.services.studio_chart_query import ChartQueryError


def _category(type_name):
    value = type_name.lower()
    if re.match(r'^(smallint|integer|bigint|numeric|decimal|real|double precision|money)(\b|\()', value):
        return 'number'
    if re.match(r'^(date|timestamp)(\b|\()', value):
        return 'date'
    return 'text'


def execute_postgresql_chart(target, source, spec):
    with closing(_connect(target)) as connection, connection.cursor() as cursor:
        _, columns, supported = _object_metadata(cursor, source)
        fields = {column['name']: column['type'] for column in supported}
        dim, metric, series = spec['dimension'], spec['measure'], spec['series']
        if any(name and name not in fields for name in (dim, metric, series)):
            raise ChartQueryError('CHART_COLUMN_NOT_FOUND')
        if spec['chart_type'] == 'filter_date' and _category(fields[dim]) != 'date':
            raise ChartQueryError('CHART_FILTER_DATE_COLUMN_INVALID')
        if spec['aggregation'] != 'count' and _category(fields[metric]) != 'number':
            raise ChartQueryError('CHART_MEASURE_NOT_NUMERIC')
        def text_column(name):
            return sql.SQL('left({}::text, 256)').format(sql.Identifier(name))
        dim_expr = text_column(dim) if dim else sql.SQL("'Total'")
        series_expr = text_column(series) if series else sql.SQL('NULL::text')
        aggregate = (sql.SQL('COUNT(*)') if spec['aggregation'] == 'count' else
                     sql.SQL('{}({}::numeric)').format(sql.SQL(spec['aggregation'].upper()), sql.Identifier(metric)))
        statement = sql.SQL('SELECT {} AS dimension_value, {} AS series_value, {} AS metric_value FROM {}.{}').format(
            dim_expr, series_expr, aggregate, sql.Identifier(source['schema']), sql.Identifier(source['name']))
        conditions, params = [], []
        operators = {'eq': '=', 'neq': '<>', 'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<='}
        for item in spec['filters']:
            name, op, value = item['column'], item['operator'], item['value']
            if name not in fields:
                raise ChartQueryError('CHART_FILTER_COLUMN_INVALID')
            category = _category(fields[name])
            if op == 'contains':
                if category != 'text': raise ChartQueryError('CHART_FILTER_OPERATOR_INVALID')
                escaped = value.replace('~', '~~').replace('%', '~%').replace('_', '~_')
                conditions.append(sql.SQL("{} LIKE %s ESCAPE '~'").format(text_column(name)))
                params.append('%' + escaped + '%')
            else:
                if op in ('gt', 'gte', 'lt', 'lte') and category == 'text':
                    raise ChartQueryError('CHART_FILTER_OPERATOR_INVALID')
                conditions.append(sql.SQL('{} {} %s').format(sql.Identifier(name), sql.SQL(operators[op])))
                params.append(value)
        if conditions: statement += sql.SQL(' WHERE ') + sql.SQL(' AND ').join(conditions)
        groups = ([dim_expr] if dim else []) + ([series_expr] if series else [])
        if groups: statement += sql.SQL(' GROUP BY ') + sql.SQL(', ').join(groups)
        order = {'value_desc': 'metric_value DESC', 'value_asc': 'metric_value ASC',
                 'dimension_asc': 'dimension_value ASC', 'dimension_desc': 'dimension_value DESC'}[spec['sort']]
        statement += sql.SQL(' ORDER BY ' + order + (', series_value ASC' if order.startswith('dimension_value') else ', dimension_value ASC, series_value ASC') + ' LIMIT %s')
        cursor.execute(statement, params + [spec['limit'] + 1])
        rows = cursor.fetchall()
    result = []
    for name, group, value in rows[:spec['limit']]:
        number = float(value) if isinstance(value, (decimal.Decimal, int, float)) else None
        if number is not None and not math.isfinite(number): number = None
        result.append({'dimension': str(name) if name is not None else '(NULL)',
                       'series': str(group) if group is not None else None, 'value': number})
    return {'columns': columns, 'rows': result, 'truncated': len(rows) > spec['limit'],
            'source_kind': 'DIRECT', 'is_sample': False}
