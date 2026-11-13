"""Bounded, read-only aggregation for Data Studio chart analysis.

All SQL identifiers come from database catalog metadata for the authorized
registered source; every user value is parameterized. No SQL text is accepted
from the browser. This module does not execute on sampled preview rows.
"""
from contextlib import closing
import decimal
import math
import re

MAX_RESULTS = 250
NUMERIC_TYPES = frozenset({'bit','tinyint','smallint','int','bigint','decimal','numeric','money','smallmoney','float','real'})
TEXT_TYPES = frozenset({'char','varchar','nchar','nvarchar','uniqueidentifier'})
DATE_TYPES = frozenset({'date','datetime','datetime2','smalldatetime','datetimeoffset'})
ALLOWED_TYPES = NUMERIC_TYPES | TEXT_TYPES | DATE_TYPES
AGGREGATIONS = frozenset({'count', 'sum', 'avg', 'min', 'max'})
CHART_TYPES = frozenset({'filter_dropdown','filter_date','bar','column','line','area','pie','donut','table','kpi','stacked','grouped','composed','treemap','radial','lollipop','waterfall','waffle','funnel','bullet','stacked100','area100','heatmap','radar','pareto','step','cumulative_line','cumulative_bar','variance','slope','combo','progress'})
ORDERED_CHART_TYPES = frozenset({'cumulative_line','cumulative_bar','variance','slope'})
FILTER_OPERATORS = frozenset({'eq','neq','contains','gt','gte','lt','lte'})

class ChartQueryError(ValueError):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.http_status = status


def parse_chart_spec(value):
    if not isinstance(value, dict) or set(value) - {
        'dataset_id','dataset_kind','dimension','measure','series','aggregation',
        'filters','sort','limit','chart_type','properties'
    } or not {'dataset_id','dataset_kind','dimension','aggregation','chart_type'} <= set(value):
        raise ChartQueryError('CHART_QUERY_INVALID')
    for field in ('dataset_id','dataset_kind','dimension','aggregation','chart_type'):
        if not isinstance(value[field],str):
            raise ChartQueryError('CHART_QUERY_INVALID')
    if value['dataset_kind'] not in ('DIRECT','PARQUET') or value['aggregation'] not in AGGREGATIONS or value['chart_type'] not in CHART_TYPES:
        raise ChartQueryError('CHART_QUERY_INVALID')
    if any(not isinstance(value.get(field,''),str) or len(value.get(field,''))>128 for field in ('dimension','measure','series')):
        raise ChartQueryError('CHART_QUERY_INVALID')
    if value['chart_type'] in ('filter_dropdown','filter_date') and (value['aggregation'] != 'count' or value.get('measure') or value.get('series')):
        raise ChartQueryError('CHART_FILTER_CARD_CONFIG_INVALID')
    if value['aggregation'] != 'count' and not value.get('measure'):
        raise ChartQueryError('CHART_MEASURE_REQUIRED')
    if value['chart_type'] != 'kpi' and not value['dimension']:
        raise ChartQueryError('CHART_DIMENSION_REQUIRED')
    if value['chart_type'] == 'kpi' and value['dimension']:
        raise ChartQueryError('CHART_KPI_DIMENSION_INVALID')
    if value.get('series') and value['series'] == value['dimension']:
        raise ChartQueryError('CHART_SERIES_INVALID')
    if value.get('series') and value['chart_type'] in ('pie','donut','kpi','pareto','progress'):
        raise ChartQueryError('CHART_SERIES_UNSUPPORTED')
    if value['chart_type'] in ('stacked','grouped','stacked100','area100','heatmap','combo') and not value.get('series'):
        raise ChartQueryError('CHART_SERIES_REQUIRED')
    limit = value.get('limit', 30)
    if type(limit) is not int or not 1 <= limit <= MAX_RESULTS:
        raise ChartQueryError('CHART_LIMIT_INVALID')
    sort = value.get('sort','dimension_asc' if value['chart_type'] in ORDERED_CHART_TYPES else 'value_desc')
    if sort not in ('value_desc','value_asc','dimension_asc','dimension_desc'):
        raise ChartQueryError('CHART_SORT_INVALID')
    if value['chart_type'] == 'pareto' and sort != 'value_desc':
        raise ChartQueryError('CHART_SORT_INVALID')
    if value['chart_type'] in ORDERED_CHART_TYPES and sort != 'dimension_asc':
        raise ChartQueryError('CHART_SORT_INVALID')
    filters = value.get('filters',[])
    if not isinstance(filters,list) or len(filters)>8:
        raise ChartQueryError('CHART_FILTER_INVALID')
    clean=[]
    for f in filters:
        if (not isinstance(f,dict) or set(f)!={'column','operator','value'} or
            not isinstance(f['column'],str) or len(f['column'])>128 or
            f['operator'] not in FILTER_OPERATORS or not isinstance(f['value'],str) or len(f['value'])>256):
            raise ChartQueryError('CHART_FILTER_INVALID')
        clean.append(f)
    properties=value.get('properties')
    if properties is not None:
        allowed={'showXAxis','showYAxis','showGrid','showLegend','showTooltip','showDataLabels','showTitle','xAxisLabel','yAxisLabel','legendPosition','numberFormat','currencySymbol','decimals','divideBy','negativeParentheses','fontSize','chartHeight','noDataMessage','colorDirection','gaugeTarget','fullscreen3d','orientation','trendStyle','trendMarkers','varianceMode','comboLineSeries','slopeStart','slopeEnd'}
        if not isinstance(properties,dict) or len(properties)>len(allowed) or set(properties)-allowed:
            raise ChartQueryError('CHART_PROPERTIES_INVALID')
        enums={'orientation':{'vertical','horizontal'},'trendStyle':{'linear','smooth','step'},
               'varianceMode':{'absolute','percent'}}
        for key,val in properties.items():
            if key.startswith('show') or key in ('negativeParentheses','fullscreen3d','trendMarkers'):
                valid=type(val) is bool
            elif key in ('decimals','fontSize','chartHeight','divideBy','gaugeTarget'):
                valid=type(val) is int and 0<=val<=1000000000
            elif key in enums:
                valid=isinstance(val,str) and val in enums[key]
            elif key in ('comboLineSeries','slopeStart','slopeEnd'):
                valid=isinstance(val,str) and len(val)<=256
            else:
                valid=isinstance(val,str) and len(val)<=100
            if not valid:raise ChartQueryError('CHART_PROPERTIES_INVALID')
    if value['chart_type'] == 'progress' and (not properties or not properties.get('gaugeTarget')):
        raise ChartQueryError('CHART_TARGET_REQUIRED')
    return {**value,'measure':value.get('measure',''),'series':value.get('series',''),
            'sort':sort,'limit':limit,'filters':clean}


def identifier(name):
    return '[' + name.replace(']',']]') + ']'


def build_direct_query(spec, source, columns):
    """Compile a single parameterized SQL Server SELECT from trusted schema metadata."""
    by_name = {row['name']:row['type'].lower() for row in columns if row['type'].lower() in ALLOWED_TYPES}
    dim = spec['dimension']; metric = spec['measure']; series = spec['series']
    if spec['chart_type'] == 'filter_date' and by_name.get(dim) not in DATE_TYPES:
        raise ChartQueryError('CHART_FILTER_DATE_COLUMN_INVALID')
    if dim and dim not in by_name or series and series not in by_name:
        raise ChartQueryError('CHART_COLUMN_NOT_FOUND')
    if metric and metric not in by_name:
        raise ChartQueryError('CHART_COLUMN_NOT_FOUND')
    if spec['aggregation'] != 'count' and by_name.get(metric) not in NUMERIC_TYPES:
        raise ChartQueryError('CHART_MEASURE_NOT_NUMERIC')
    # Avoid floating-point precision loss for the dominant SQL Server financial types.
    if spec['aggregation'] == 'count':
        aggregate = 'COUNT_BIG(*)'
    else:
        expr = f'CONVERT(decimal(38,6), {identifier(metric)})'
        aggregate = f"{spec['aggregation'].upper()}({expr})"
    params=[]; conditions=[]
    for f in spec['filters']:
        name=f['column']; op=f['operator']; value=f['value']
        if name not in by_name:
            raise ChartQueryError('CHART_FILTER_COLUMN_INVALID')
        typ=by_name[name]
        if op=='contains':
            if typ not in TEXT_TYPES:
                raise ChartQueryError('CHART_FILTER_OPERATOR_INVALID')
            # Protect wildcard characters in user-supplied values.
            escaped = value.replace('~','~~').replace('%','~%').replace('_','~_').replace('[','~[')
            conditions.append(f"CONVERT(nvarchar(256),{identifier(name)}) LIKE ? ESCAPE '~'")
            params.append('%'+escaped+'%')
        else:
            if op in ('gt','gte','lt','lte') and typ not in (NUMERIC_TYPES | DATE_TYPES):
                raise ChartQueryError('CHART_FILTER_OPERATOR_INVALID')
            symbol={'eq':'=','neq':'<>','gt':'>','gte':'>=','lt':'<','lte':'<='}[op]
            conditions.append(f'{identifier(name)} {symbol} ?')
            params.append(value)
    select=[]; grouping=[]
    if dim:
        expression=f'CONVERT(nvarchar(256),{identifier(dim)})'
        select.append(f'{expression} AS dimension_value');grouping.append(expression)
    else:
        select.append("N'Total' AS dimension_value")
    if series:
        expression=f'CONVERT(nvarchar(256),{identifier(series)})'
        select.append(f'{expression} AS series_value'); grouping.append(expression)
    else:
        select.append('CAST(NULL AS nvarchar(256)) AS series_value')
    select.append(f'{aggregate} AS metric_value')
    clause=' WHERE '+' AND '.join(conditions) if conditions else ''
    group_by=' GROUP BY '+','.join(grouping) if grouping else ''
    ordering={'value_desc':'metric_value DESC','value_asc':'metric_value ASC',
              'dimension_asc':'dimension_value ASC','dimension_desc':'dimension_value DESC'}[spec['sort']]
    ordering+=', dimension_value ASC, series_value ASC' if not ordering.startswith('dimension_value') else ', series_value ASC'
    sql=(f'SELECT TOP ({spec["limit"] + (1 if spec["chart_type"] == "filter_dropdown" else 0)}) '+', '.join(select)+f' FROM {identifier(source["schema"])}.{identifier(source["name"])}'
         +clause+group_by+f' ORDER BY {ordering}')
    return sql,params


def execute_direct_chart(target, source, spec):
    from app.connectors.sqlserver import open_readonly_connection, _dataset_columns
    with closing(open_readonly_connection(target)) as connection:
        connection.timeout=min(target.timeout,30)
        cursor=connection.cursor()
        # _dataset_columns verifies that the persisted object is still user-owned and valid.
        _,columns,_=_dataset_columns(cursor,source)
        sql,params=build_direct_query(spec,source,columns)
        cursor.execute('SET LOCK_TIMEOUT 5000')
        cursor.execute(sql,*params)
        rows=cursor.fetchmany(spec['limit']+1)
    result=[]
    for name,series,value in rows[:spec['limit']]:
        number=float(value) if isinstance(value,(decimal.Decimal,int,float)) else None
        if number is not None and not math.isfinite(number):number=None
        result.append({'dimension': str(name) if name is not None else '(NULL)',
                       'series':str(series) if series is not None else None,'value':number})
    return {'columns':columns,'rows':result,'truncated':len(rows)>spec['limit'],
            'source_kind':'DIRECT','is_sample':False}
