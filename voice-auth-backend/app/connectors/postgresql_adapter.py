"""Bounded PostgreSQL dataset discovery and preview; SQL Server adapter untouched."""
from dataclasses import dataclass
from contextlib import closing
from app.connectors.registry import ConnectorSpec, register
from app.connectors.sqlserver import validate_sqlserver_host

@dataclass(frozen=True)
class PostgreSQLTarget:
    host: str
    port: int
    database: str
    username: str
    password: str
    encrypt: bool = True
    trust_server_certificate: bool = False
    timeout: int = 10

def make_target(body):
    return PostgreSQLTarget(body['server_host'], body.get('server_port', 5432), body['database_name'], body['login_username'], body['password'], body.get('encrypt_transport', True), body.get('trust_server_certificate', False), body.get('connection_timeout_seconds', 10))

def validate_target(target):
    if any(not isinstance(v, str) or not v.strip() or '\x00' in v for v in (target.database, target.username, target.password)):
        raise ValueError('POSTGRESQL_CREDENTIALS_INVALID')
    if target.trust_server_certificate:
        raise ValueError('POSTGRESQL_TRUST_CERT_UNSUPPORTED')
    if type(target.port) is not int or type(target.timeout) is not int or not 1 <= target.timeout <= 60:
        raise ValueError('SQL_PORT_OR_TIMEOUT_INVALID')
    # Reuse the same DNS/SSRF/private-network checks, but PostgreSQL's own
    # port allowlist (default 5432), not SQL Server's default 1433.
    return validate_sqlserver_host(target.host, target.port,
                                   port_policy_env='STUDIO_POSTGRESQL_ALLOWED_PORTS',
                                   default_ports='5432')

def _connect(target):
    try:
        import psycopg
    except ImportError:
        raise ValueError('POSTGRESQL_DRIVER_MISSING') from None
    _, address = validate_target(target)
    # Read-only session plus explicit transaction read-only for all discovery/preview queries.
    conn = psycopg.connect(host=target.host, hostaddr=address, port=target.port,
        dbname=target.database, user=target.username, password=target.password,
        connect_timeout=target.timeout, sslmode='verify-full' if target.encrypt else 'disable',
        sslrootcert='system' if target.encrypt else None,
        options=f'-c default_transaction_read_only=on -c statement_timeout={min(target.timeout, 30)*1000}')
    return conn

def test_connection(target):
    try:
        with closing(_connect(target)) as conn, conn.cursor() as cursor:
            cursor.execute('SELECT current_database(), version()')
            name, version = cursor.fetchone()
            return {'success': True, 'database': name, 'server_version': version.splitlines()[0]}
    except ValueError:
        raise
    except Exception as exc:
        import psycopg
        if not isinstance(exc, psycopg.Error):
            raise
        return {'success': False, 'code': 'POSTGRESQL_CONNECTION_FAILED', 'message': 'Unable to connect. Verify host, TLS, database and credentials.'}

def bind_source(source, metadata, target, validate):
    host, address = validate(target)
    return {'id': source['id'], 'kind': 'postgresql', 'hostname': host, 'address': address,
        'port': target.port, 'database': target.database, 'schema': metadata['source_schema'],
        'table': metadata['source_name'], 'username': target.username,
        'password': target.password, 'encrypt': target.encrypt, 'timeout': target.timeout}

_OBJECTS = """FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p','v') AND n.nspname NOT IN ('pg_catalog','information_schema')
AND n.nspname NOT LIKE 'pg_toast%%' AND n.nspname NOT LIKE 'pg_temp%%' AND has_schema_privilege(n.oid,'USAGE')
AND has_table_privilege(c.oid,'SELECT')"""
_TYPE = "CASE WHEN c.relkind IN ('r','p') THEN 'BASE TABLE' ELSE 'VIEW' END"

def list_postgresql_objects(target, query='', offset=0, limit=50):
    if not isinstance(query, str) or len(query) > 128 or type(offset) is not int or not 0 <= offset <= 100000 or type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError('DATASET_SEARCH_INVALID')
    pattern = '%' + query.replace('\\','\\\\').replace('%','\\%').replace('_','\\_') + '%'
    with closing(_connect(target)) as conn, conn.cursor() as cur:
        cur.execute(f"SELECT n.nspname,c.relname,{_TYPE} {_OBJECTS} AND (n.nspname ILIKE %s OR c.relname ILIKE %s OR (n.nspname||'.'||c.relname) ILIKE %s) ORDER BY n.nspname,c.relname,c.relkind LIMIT %s OFFSET %s", (pattern,pattern,pattern,limit+1,offset))
        rows = cur.fetchall()
        return {'items': [{'schema': r[0], 'name': r[1], 'type': r[2]} for r in rows[:limit]], 'has_more': len(rows)>limit, 'offset': offset}

def _object_metadata(cur, source):
    if not isinstance(source, dict) or source.get('type') not in ('BASE TABLE','VIEW') or not all(isinstance(source.get(k),str) and source[k] for k in ('schema','name')):
        raise ValueError('DATASET_SOURCE_INVALID')
    cur.execute(f"SELECT c.oid,c.relkind {_OBJECTS} AND n.nspname=%s AND c.relname=%s AND {_TYPE}=%s", (source['schema'],source['name'],source['type']))
    row=cur.fetchone()
    if not row: raise ValueError('DATASET_SOURCE_INVALID')
    cur.execute("SELECT a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod), t.typcategory, t.typname FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid=a.atttypid WHERE a.attrelid=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 513", (row[0],))
    raw=cur.fetchall()
    if len(raw)>512: raise ValueError('DATASET_TOO_MANY_COLUMNS')
    columns=[{'name':r[0],'type':r[1]} for r in raw]
    # Match SQL Server's bounded scalar-only preview; omit JSON, arrays, binary, spatial, etc.
    supported=[{'name':r[0],'type':r[1]} for r in raw if r[2] in ('B','N','S','D','T','V') or r[3] in ('uuid','bool','date','timestamp','timestamptz','time','timetz','interval')]
    return row[0], columns, supported[:30]

def postgresql_object_exists(target, source):
    with closing(_connect(target)) as conn, conn.cursor() as cur:
        try:
            _object_metadata(cur, source)
            return True
        except ValueError as exc:
            if str(exc)=='DATASET_SOURCE_INVALID': return False
            raise

def _where(filters, supported):
    from psycopg import sql
    if not isinstance(filters,dict) or len(filters)>30 or not set(filters).issubset({c['name'] for c in supported}):
        raise ValueError('DATASET_FILTER_INVALID')
    clauses=[]; params=[]
    for name, spec in filters.items():
        if not isinstance(spec,dict) or set(spec)!={'mode','values'} or spec['mode'] not in ('include','exclude') or not isinstance(spec['values'],list) or not 1<=len(spec['values'])<=50:
            raise ValueError('DATASET_FILTER_INVALID')
        values=spec['values']
        if any(v is not None and (not isinstance(v,str) or len(v)>256) for v in values): raise ValueError('DATASET_FILTER_INVALID')
        col=sql.Identifier(name)
        nonnull=[v for v in values if v is not None]
        hasnull=None in values
        parts=[]
        if nonnull:
            parts.append(sql.SQL('left({}::text, 256) {} ({})').format(col,sql.SQL('IN' if spec['mode']=='include' else 'NOT IN'),sql.SQL(',').join([sql.Placeholder()]*len(nonnull))))
            params.extend(nonnull)
        if spec['mode']=='include':
            if hasnull: parts.append(sql.SQL('{} IS NULL').format(col))
            clauses.append(sql.SQL('(')+sql.SQL(' OR ').join(parts)+sql.SQL(')'))
        else:
            if hasnull:
                parts.append(sql.SQL('{} IS NOT NULL').format(col))
                clauses.append(sql.SQL('(')+sql.SQL(' AND ').join(parts)+sql.SQL(')'))
            else:
                parts.append(sql.SQL('{} IS NULL').format(col))
                clauses.append(sql.SQL('(')+sql.SQL(' OR ').join(parts)+sql.SQL(')'))
    return clauses,params

def preview_postgresql_object(target, source, page=1, filters=None, sort=None):
    from psycopg import sql
    if type(page) is not int or not 1<=page<=42949672: raise ValueError('DATASET_PAGE_INVALID')
    with closing(_connect(target)) as conn, conn.cursor() as cur:
        oid, columns, supported=_object_metadata(cur,source)
        clauses,params=_where({} if filters is None else filters,supported)
        if sort is not None and (not isinstance(sort,dict) or set(sort)!={'column','direction'} or sort['column'] not in {c['name'] for c in supported} or sort['direction'] not in ('asc','desc')):
            raise ValueError('DATASET_SORT_INVALID')
        if not supported:
            return {'columns':columns,'preview_columns':[],'rows':[],'has_more':False,'omitted_columns':len(columns),'page':page,'stable_order':False}
        # Ordering by visible scalar columns is deterministic only if values are unique.
        projections=sql.SQL(',').join(sql.SQL('left({}::text,256)').format(sql.Identifier(c['name'])) for c in supported)
        ordering=[sql.SQL('{} {}').format(sql.Identifier(sort['column']),sql.SQL(sort['direction'].upper()))] if sort else []
        ordering += [sql.Identifier(c['name']) for c in supported if not sort or c['name']!=sort['column']]
        statement=sql.SQL('SELECT {} FROM {}.{}').format(projections,sql.Identifier(source['schema']),sql.Identifier(source['name']))
        if clauses: statement+=sql.SQL(' WHERE ')+sql.SQL(' AND ').join(clauses)
        statement+=sql.SQL(' ORDER BY ')+sql.SQL(',').join(ordering)+sql.SQL(' LIMIT %s OFFSET %s')
        cur.execute(statement,params+[51,(page-1)*50])
        rows=cur.fetchall()
        return {'columns':columns,'preview_columns':supported,'rows':[list(r) for r in rows[:50]],'has_more':len(rows)>50,'omitted_columns':len(columns)-len(supported),'page':page,'stable_order':False}

def postgresql_filter_values(target,source,column,search,offset,filters):
    from psycopg import sql
    if not isinstance(column,str) or not isinstance(search,str) or len(search)>128 or type(offset) is not int or not 0<=offset<=100000:
        raise ValueError('DATASET_FILTER_INVALID')
    with closing(_connect(target)) as conn,conn.cursor() as cur:
        _,_,supported=_object_metadata(cur,source)
        if column not in {c['name'] for c in supported}: raise ValueError('DATASET_FILTER_INVALID')
        clauses,params=_where(filters,supported)
        ident=sql.Identifier(column)
        expression=sql.SQL('left({}::text,256)').format(ident)
        clauses.append(sql.SQL('({} IS NULL OR length({}::text)<=256)').format(ident,ident))
        if search:
            escaped=search.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
            clauses.append(sql.SQL("{} ILIKE %s ESCAPE '\\'").format(expression))
            params.append('%'+escaped+'%')
        statement=sql.SQL('SELECT DISTINCT {} AS value FROM {}.{} WHERE {} ORDER BY value LIMIT %s OFFSET %s').format(expression,sql.Identifier(source['schema']),sql.Identifier(source['name']),sql.SQL(' AND ').join(clauses))
        cur.execute(statement,params+[51,offset]); rows=cur.fetchall()
        return {'values':[r[0] for r in rows[:50]],'has_more':len(rows)>50}

def install():
    register(ConnectorSpec(kind='postgresql',capabilities=frozenset({'test','browse','preview','read'}),
        bind_source=bind_source,make_target=make_target,validate_target=validate_target,
        test_connection=test_connection,browse=list_postgresql_objects,
        object_exists=postgresql_object_exists,preview=preview_postgresql_object,
        filter_values=postgresql_filter_values))
