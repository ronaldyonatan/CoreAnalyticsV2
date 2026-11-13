
"""Call this only from an authenticated /internal/output-aggregate route.

The route MUST resolve run_id/node_id to an authorized fixed artifact directory
using the same reader-side resolution as /internal/output-page. Never use a
path from request JSON. Requires duckdb installed in the reader environment.
"""
from pathlib import Path
import duckdb

NUMERIC = {'TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT','UTINYINT','USMALLINT',
           'UINTEGER','UBIGINT','FLOAT','DOUBLE','REAL','DECIMAL'}
OPS={'eq':'=','neq':'<>','gt':'>','gte':'>=','lt':'<','lte':'<='}
AGGS={'count':'COUNT(*)','sum':'SUM','avg':'AVG','min':'MIN','max':'MAX'}

def aggregate_parquet(artifact_dir:Path, spec:dict):
    """Run a bounded aggregation over ALL files of one verified output."""
    if not isinstance(artifact_dir,Path) or not artifact_dir.is_dir():
        raise ValueError('CHART_ARTIFACT_INVALID')
    files=sorted(p for p in artifact_dir.rglob('*.parquet') if p.is_file()
                 and not p.is_symlink() and p.resolve().is_relative_to(artifact_dir.resolve()))
    if not files or len(files)>10000: raise ValueError('CHART_ARTIFACT_INVALID')
    # Reader-side path is trusted, never taken from browser input.
    con=duckdb.connect(':memory:',config={'threads':'2'})
    try:
        con.execute("SET memory_limit='512MB'")
        con.execute("SET max_temp_directory_size='1GB'")
        trusted_files='['+','.join("'"+str(f).replace("'","''")+"'" for f in files)+']'
        con.execute("CREATE TEMP VIEW source AS SELECT * FROM read_parquet("+trusted_files+", union_by_name=true)")
        cols={row[0]:str(row[1]).upper() for row in con.execute('DESCRIBE source').fetchall()}
        def q(n):
            if n not in cols:raise ValueError('CHART_COLUMN_NOT_FOUND')
            return '"'+n.replace('"','""')+'"'
        dim=spec.get('dimension') or ''
        series=spec.get('series') or ''
        measure=spec.get('measure') or ''
        agg=spec.get('aggregation','count')
        if agg not in AGGS:raise ValueError('CHART_AGG_INVALID')
        if agg!='count' and (not measure or not any(cols.get(measure,'').startswith(x) for x in NUMERIC)):
            raise ValueError('CHART_MEASURE_NOT_NUMERIC')
        limit=spec.get('limit',30)
        if type(limit)!=int or not 1<=limit<=250:raise ValueError('CHART_LIMIT_INVALID')
        if spec.get('chart_type')!='kpi' and not dim:raise ValueError('CHART_DIMENSION_REQUIRED')
        if spec.get('chart_type')=='filter_date' and not cols.get(dim,'').startswith(('DATE','TIMESTAMP')):
            raise ValueError('CHART_FILTER_DATE_COLUMN_INVALID')
        selects=[f'CAST({q(dim)} AS VARCHAR) AS dimension_value' if dim else "'Total' AS dimension_value",
                 f'CAST({q(series)} AS VARCHAR) AS series_value' if series else 'CAST(NULL AS VARCHAR) AS series_value']
        selects.append('COUNT(*) AS metric_value' if agg=='count' else f'{AGGS[agg]}({q(measure)}) AS metric_value')
        params=[];where=[]
        for f in spec.get('filters',[]):
            col=q(f['column']); op=f['operator']; value=f['value']
            if op=='contains':
                where.append(f'contains(CAST({col} AS VARCHAR), ?)');params.append(value)
            elif op in OPS:
                where.append(f'{col} {OPS[op]} ?');params.append(value)
            else:raise ValueError('CHART_FILTER_INVALID')
        group=','.join(str(i) for i in range(1,1+bool(dim)+bool(series)))
        sort=spec.get('sort','value_desc')
        order={'value_desc':'metric_value DESC','value_asc':'metric_value ASC',
               'dimension_asc':'dimension_value ASC','dimension_desc':'dimension_value DESC'}.get(sort)
        if not order:raise ValueError('CHART_SORT_INVALID')
        sql='SELECT '+', '.join(selects)+' FROM source'
        if where:sql+=' WHERE '+' AND '.join(where)
        if group:sql+=' GROUP BY '+group
        sql+=' ORDER BY '+order+f' LIMIT {limit+1}'
        result=con.execute(sql,params).fetchall()
        return {'rows':[{'dimension':str(x[0]) if x[0] is not None else '(NULL)',
                         'series':str(x[1]) if x[1] is not None else None,
                         'value':float(x[2]) if x[2] is not None else None}
                        for x in result[:limit]],
                'truncated':len(result)>limit,'source_kind':'PARQUET','is_sample':False}
    finally:con.close()
