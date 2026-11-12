"""SQL Server connection tester and dynamic host security policy.

The SQL host comes from the user-supplied connection configuration, not a
hardcoded IP list. Explicit opt-in STUDIO_SQL_HOST_POLICY=dynamic allows new
routable IPs/FQDNs while refusing local/multicast/link-local infrastructure.

For backward compatibility, explicit 'allowlist' is supported. Dynamic mode is
the default; private destinations require STUDIO_SQL_ALLOW_PRIVATE=true, for
trusted single-tenant deployments only. Optional network CIDRs restrict further.
STUDIO_SQL_ALLOWED_PORTS defaults to 1433; '*' explicitly permits custom ports.
Infrastructure exclusions still apply. Permissions and network egress controls
remain mandatory, particularly for multi-tenant deployments.
"""
from dataclasses import dataclass
from contextlib import closing
import ipaddress
import os
import re
import socket
import pyodbc


class SqlTargetPolicyError(ValueError):
    """Public, non-secret diagnostic code for invalid/blocked host requests."""

    def __init__(self, code: str, http_status: int = 400):
        super().__init__(code)
        self.code = code
        self.http_status = http_status


@dataclass(frozen=True)
class SqlServerTarget:
    host: str
    port: int
    database: str
    username: str
    password: str
    encrypt: bool = True
    trust_server_certificate: bool = False
    timeout: int = 10


# Reserve well-known non-database ranges, even though Python's is_private
# classification can include special-purpose and documentation addresses.
_BLOCKED_NETWORKS = tuple(ipaddress.ip_network(net) for net in (
    '0.0.0.0/8', '100.64.0.0/10', '192.0.0.0/24', '192.0.2.0/24',
    '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
    '224.0.0.0/4', '240.0.0.0/4',
    '2001:db8::/32', '2002::/16', '2001::/32',
    '168.63.129.16/32', 'fd00:ec2::254/128',
))
_HOST_LABEL = re.compile(r'^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$')


def _valid_ip(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return _valid_ip(address.ipv4_mapped)
    if (address.is_loopback or address.is_link_local or address.is_multicast
            or address.is_unspecified or address.is_reserved):
        return False
    if any(address in block for block in _BLOCKED_NETWORKS if address.version == block.version):
        return False
    return address.is_private or address.is_global


def _validate_host_syntax(host: str) -> str:
    if not isinstance(host, str):
        raise SqlTargetPolicyError('SQL_HOST_INVALID')
    host = host.strip()
    if not host or len(host) > 255 or any(ch in host for ch in (';', '{', '}', '\\', ',', '/', '@', '%', '\r', '\n', '\x00')):
        raise SqlTargetPolicyError('SQL_HOST_INVALID')
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        pass
    # Reject host:port, URLs, userinfo, named instances, and DNS search trickery.
    if ':' in host or len(host) > 253 or host.startswith('.') or host.endswith('.'):
        raise SqlTargetPolicyError('SQL_HOST_INVALID')
    if not all(_HOST_LABEL.fullmatch(part) for part in host.split('.')):
        raise SqlTargetPolicyError('SQL_HOST_INVALID')
    return host


def _configured_networks(mode: str):
    raw = os.getenv('STUDIO_SQL_ALLOWED_NETWORKS', '').strip()
    if not raw:
        return ()
    try:
        networks = tuple(ipaddress.ip_network(value.strip(), strict=True)
                         for value in raw.split(',') if value.strip())
        if not networks:
            raise SqlTargetPolicyError('SQL_NETWORK_POLICY_REQUIRED', 503)
        return networks
    except SqlTargetPolicyError:
        raise
    except ValueError:
        raise SqlTargetPolicyError('SQL_NETWORK_POLICY_INVALID', 503) from None


def _validate_port(port: int, *, policy_env: str = 'STUDIO_SQL_ALLOWED_PORTS', default: str = '1433') -> None:
    # Explicit deployment-wide opt-in for user-supplied SQL Server ports.
    raw_ports = os.getenv(policy_env, default).strip()
    if raw_ports == '*':
        if type(port) is not int or not 1 <= port <= 65535:
            raise SqlTargetPolicyError('SQL_PORT_OR_TIMEOUT_INVALID')
        return
    try:
        allowed = {int(value.strip()) for value in
                   raw_ports.split(',') if value.strip()}
    except ValueError:
        raise SqlTargetPolicyError('SQL_PORT_POLICY_INVALID', 503) from None
    if not allowed or any(value < 1 or value > 65535 for value in allowed):
        raise SqlTargetPolicyError('SQL_PORT_POLICY_INVALID', 503)
    if port not in allowed:
        raise SqlTargetPolicyError('SQL_PORT_NOT_ALLOWED', 403)


def _is_local_address(address, port: int) -> bool:
    # Resolve the server's own hostname; also check the OS-selected source
    # address for this route. UDP connect performs no SQL query or packet send.
    try:
        local = socket.getaddrinfo(socket.gethostname(), None, type=socket.SOCK_STREAM)
        if any(ipaddress.ip_address(row[4][0].split('%')[0]) == address for row in local):
            return True
    except (OSError, ValueError):
        pass
    family = socket.AF_INET6 if address.version == 6 else socket.AF_INET
    try:
        with socket.socket(family, socket.SOCK_DGRAM) as probe:
            probe.connect((str(address), port))
            return ipaddress.ip_address(probe.getsockname()[0].split('%')[0]) == address
    except OSError:
        return False


def validate_sqlserver_host(host: str, port: int = 1433, *,
                            port_policy_env: str = 'STUDIO_SQL_ALLOWED_PORTS',
                            default_ports: str = '1433') -> tuple[str, str]:
    """Return (original host, pinned resolved IP), or reject unsafe destinations.

    Resolves DNS before connecting and never forwards a hostname to the ODBC
    driver. The driver connects to the validated numeric IP to reduce DNS
    rebinding risk. HostnameInCertificate preserves TLS hostname checks.
    """
    host = _validate_host_syntax(host)
    mode = os.getenv('STUDIO_SQL_HOST_POLICY', 'dynamic').strip().lower()
    if mode not in ('dynamic', 'allowlist'):
        raise SqlTargetPolicyError('SQL_HOST_POLICY_INVALID', 503)
    networks = _configured_networks(mode)
    _validate_port(port, policy_env=port_policy_env, default=default_ports)
    if mode == 'allowlist':
        allowed = {part.strip().lower() for part in os.getenv('STUDIO_ALLOWED_SQL_HOSTS', '').split(',') if part.strip()}
        if not allowed or host.lower() not in allowed:
            raise SqlTargetPolicyError('HOST_NOT_ALLOWED', 403)

    try:
        literal = ipaddress.ip_address(host)
        candidates = [literal]
    except ValueError:
        try:
            records = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        except (OSError, UnicodeError):
            raise SqlTargetPolicyError('SQL_HOST_UNRESOLVABLE') from None
        candidates = []
        for record in records:
            try:
                item = ipaddress.ip_address(record[4][0])
            except (ValueError, IndexError):
                raise SqlTargetPolicyError('SQL_HOST_INVALID') from None
            if item not in candidates:
                candidates.append(item)

    if not candidates:
        raise SqlTargetPolicyError('SQL_HOST_UNRESOLVABLE')
    # Reject mixed DNS records: prevents resolving to unsafe local endpoints.
    if not all(_valid_ip(address) and not _is_local_address(address, port) for address in candidates):
        raise SqlTargetPolicyError('SQL_HOST_BLOCKED', 403)
    # Private networks require an explicit, deployment-wide trusted-runtime opt-in.
    # Never enable this for shared public SaaS workers.
    if os.getenv('STUDIO_SQL_ALLOW_PRIVATE', 'false').strip().lower() != 'true' and any(address.is_private for address in candidates):
        raise SqlTargetPolicyError('SQL_PRIVATE_DESTINATION_DISABLED', 403)
    if networks and not all(any(address in network for network in networks
                                if address.version == network.version) for address in candidates):
        raise SqlTargetPolicyError('SQL_NETWORK_NOT_ALLOWED', 403)
    if any(address.version == 4 and network.version == 4 and network.prefixlen < 31
           and address in (network.network_address, network.broadcast_address)
           for address in candidates for network in networks if address in network):
        raise SqlTargetPolicyError('SQL_HOST_BLOCKED', 403)
    # Prefer IPv4 if offered (most internal SQL Server endpoints are IPv4).
    address = next((ip for ip in candidates if ip.version == 4), candidates[0])
    return host, str(address)


def validate_target(target: SqlServerTarget, allowed_hosts: set[str] | None = None) -> tuple[str, str]:
    """Validate inputs, then resolve allowed host. `allowed_hosts` is legacy-only.

    The optional legacy argument is retained for callers from older stages;
    configuration policy remains authoritative.
    """
    if type(target.port) is not int or type(target.timeout) is not int or not (1 <= target.port <= 65535 and 1 <= target.timeout <= 60):
        raise SqlTargetPolicyError('SQL_PORT_OR_TIMEOUT_INVALID')
    if not all(isinstance(x, str) and x.strip() for x in (target.database, target.username, target.password)):
        raise SqlTargetPolicyError('SQL_CREDENTIALS_INVALID')
    if any(any(ch in x for ch in (';', '{', '}', '\r', '\n', '\x00')) for x in (target.database, target.username)):
        raise SqlTargetPolicyError('SQL_CONNECTION_PARAMETER_INVALID')
    if type(target.encrypt) is not bool or type(target.trust_server_certificate) is not bool:
        raise SqlTargetPolicyError('SQL_OPTIONS_INVALID')
    if any(ch in target.password for ch in ('\r', '\n', '\x00')):
        raise SqlTargetPolicyError('SQL_CREDENTIALS_INVALID')
    if target.trust_server_certificate and os.getenv('STUDIO_ALLOW_UNTRUSTED_CERT', 'false').lower() != 'true':
        raise SqlTargetPolicyError('UNTRUSTED_CERT_DISABLED')
    return validate_sqlserver_host(target.host, target.port)


def open_readonly_connection(target: SqlServerTarget):
    """Open a policy-validated source connection; callers must close it."""
    original_host, resolved_ip = validate_target(target)
    server = f'[{resolved_ip}]' if ':' in resolved_ip else resolved_ip
    connection_string = (
        'DRIVER={ODBC Driver 18 for SQL Server};'
        f'SERVER=tcp:{server},{target.port};'
        f'DATABASE={target.database};'
        f'UID={target.username};PWD={{{target.password.replace("}", "}}")}}};'
        f'Encrypt={"yes" if target.encrypt else "no"};'
        f'TrustServerCertificate={"yes" if target.trust_server_certificate else "no"};'
        f'Connection Timeout={target.timeout};'
        'ApplicationIntent=ReadOnly;'
    )
    if original_host != resolved_ip and target.encrypt and not target.trust_server_certificate:
        connection_string += f'HostnameInCertificate={original_host};'
    return pyodbc.connect(connection_string, timeout=target.timeout, autocommit=True)


# SQL Server's system catalog distinguishes user objects from Microsoft-shipped
# objects even when system objects happen to be in a non-system schema.
_USER_OBJECTS = "FROM sys.objects AS o JOIN sys.schemas AS s ON s.schema_id = o.schema_id WHERE o.type IN ('U', 'V') AND o.is_ms_shipped = 0 AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA')"
_SOURCE_TYPE = "CASE WHEN o.type = 'U' THEN 'BASE TABLE' ELSE 'VIEW' END"


def list_sqlserver_objects(target: SqlServerTarget, query: str = '', offset: int = 0, limit: int = 50) -> dict:
    if not isinstance(query, str) or len(query) > 128 or type(offset) is not int or not 0 <= offset <= 100000 or type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError('DATASET_SEARCH_INVALID')
    escaped = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('[', '\\[')
    pattern = f'%{escaped}%'
    with closing(open_readonly_connection(target)) as connection:
        connection.timeout = min(target.timeout, 30)
        cursor = connection.cursor()
        cursor.execute(f"SELECT s.name, o.name, {_SOURCE_TYPE} {_USER_OBJECTS} AND (s.name LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\' OR (s.name + '.' + o.name) LIKE ? ESCAPE '\\') ORDER BY s.name, o.name, o.type OFFSET ? ROWS FETCH NEXT ? ROWS ONLY", pattern, pattern, pattern, offset, limit + 1)
        rows = cursor.fetchmany(limit + 1)
        return {'items': [{'schema': str(row[0]), 'name': str(row[1]), 'type': str(row[2])} for row in rows[:limit]], 'has_more': len(rows) > limit, 'offset': offset}


def sqlserver_object_exists(target: SqlServerTarget, source: dict) -> bool:
    with closing(open_readonly_connection(target)) as connection:
        connection.timeout = min(target.timeout, 30)
        cursor = connection.cursor()
        cursor.execute(f"SELECT TOP 1 1 {_USER_OBJECTS} AND s.name = ? AND o.name = ? AND {_SOURCE_TYPE} = ?", source['schema'], source['name'], source['type'])
        return cursor.fetchone() is not None


_PREVIEW_TYPES = frozenset(('bit', 'tinyint', 'smallint', 'int', 'bigint', 'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real', 'char', 'varchar', 'nchar', 'nvarchar', 'date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset', 'time', 'uniqueidentifier'))


def _quote_identifier(name: str) -> str:
    return '[' + name.replace(']', ']]') + ']'


def _filter_sql(filters, supported):
    if not isinstance(filters, dict) or len(filters) > 30 or not set(filters).issubset({c['name'] for c in supported}):
        raise ValueError('DATASET_FILTER_INVALID')
    conditions, parameters = [], []
    for name, spec in filters.items():
        if not isinstance(spec, dict) or set(spec) != {'mode', 'values'} or spec['mode'] not in ('include', 'exclude') or not isinstance(spec['values'], list) or not 1 <= len(spec['values']) <= 50:
            raise ValueError('DATASET_FILTER_INVALID')
        values = spec['values']
        if any(value is not None and (not isinstance(value, str) or len(value) > 256) for value in values):
            raise ValueError('DATASET_FILTER_INVALID')
        nonnull = [value for value in values if value is not None]
        has_null = None in values
        column = _quote_identifier(name)
        parts = []
        if nonnull:
            expression = f"CONVERT(nvarchar(max), {column}) {'IN' if spec['mode'] == 'include' else 'NOT IN'} ({', '.join('?' for _ in nonnull)})"
            parts.append(expression)
            parameters.extend(nonnull)
        if spec['mode'] == 'include':
            if has_null: parts.append(f'{column} IS NULL')
            conditions.append('(' + ' OR '.join(parts) + ')')
        else:
            if has_null:
                parts.append(f'{column} IS NOT NULL')
                conditions.append('(' + ' AND '.join(parts) + ')')
            else:
                parts.append(f'{column} IS NULL')
                conditions.append('(' + ' OR '.join(parts) + ')')
    return conditions, parameters


def _dataset_columns(cursor, source):
    if source.get('type') not in ('BASE TABLE', 'VIEW'):
        raise ValueError('DATASET_SOURCE_INVALID')
    cursor.execute(f"SELECT o.object_id {_USER_OBJECTS} AND s.name = ? AND o.name = ? AND {_SOURCE_TYPE} = ?", source['schema'], source['name'], source['type'])
    found = cursor.fetchone()
    if not found: raise ValueError('DATASET_SOURCE_INVALID')
    cursor.execute("SELECT c.name, t.name FROM sys.columns AS c JOIN sys.types AS t ON t.user_type_id = c.user_type_id WHERE c.object_id = ? ORDER BY c.column_id", found[0])
    metadata = cursor.fetchmany(513)
    if len(metadata) > 512: raise ValueError('DATASET_TOO_MANY_COLUMNS')
    columns = [{'name': str(row[0]), 'type': str(row[1])} for row in metadata]
    return found[0], columns, [column for column in columns if column['type'].lower() in _PREVIEW_TYPES][:30]


def preview_sqlserver_object(target: SqlServerTarget, source: dict, page: int = 1, filters: dict | None = None, sort: dict | None = None) -> dict:
    """Read one bounded page from a verified table/view, never arbitrary SQL."""
    if type(page) is not int or not 1 <= page <= 42949672:
        raise ValueError('DATASET_PAGE_INVALID')
    if filters is None:
        filters = {}
    with closing(open_readonly_connection(target)) as connection:
        connection.timeout = min(target.timeout, 30)
        cursor = connection.cursor()
        object_id, columns, supported = _dataset_columns(cursor, source)
        conditions, parameters = _filter_sql(filters, supported)
        if sort is not None and (not isinstance(sort, dict) or set(sort) != {'column', 'direction'} or not isinstance(sort['column'], str) or sort['column'] not in {item['name'] for item in supported} or sort['direction'] not in ('asc', 'desc')):
            raise ValueError('DATASET_SORT_INVALID')
        if not supported:
            return {'columns': columns, 'preview_columns': [], 'rows': [], 'has_more': False, 'omitted_columns': len(columns), 'page': page, 'stable_order': False}
        quote = _quote_identifier
        # Conversion is bounded in SQL Server so large text values cannot be
        # transferred in full. Column names originate from catalog metadata.
        projection = ', '.join(f'LEFT(CONVERT(nvarchar(max), {quote(column["name"])}), 256)' for column in supported)
        where = ' WHERE ' + ' AND '.join(conditions) if conditions else ''
        cursor.execute("SELECT c.name FROM sys.indexes AS i JOIN sys.index_columns AS ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns AS c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE i.object_id=? AND i.index_id=(SELECT TOP 1 idx.index_id FROM sys.indexes AS idx WHERE idx.object_id=? AND idx.is_unique=1 AND idx.is_disabled=0 AND idx.is_hypothetical=0 AND idx.has_filter=0 ORDER BY idx.is_primary_key DESC, idx.index_id) AND ic.key_ordinal>0 ORDER BY ic.key_ordinal", object_id, object_id)
        key_columns = [str(row[0]) for row in cursor.fetchmany(33)]
        if len(key_columns) > 32:
            key_columns = []
        order_columns = key_columns or [column['name'] for column in supported]
        if sort:
            direction = 'ASC' if sort['direction'] == 'asc' else 'DESC'
            ordering = ', '.join([f'{quote(sort["column"])} {direction}'] + [quote(name) for name in order_columns if name != sort['column']])
        else:
            ordering = ', '.join(quote(name) for name in order_columns)
        cursor.execute(f'SELECT {projection} FROM {quote(source["schema"])}.{quote(source["name"])}{where} ORDER BY {ordering} OFFSET ? ROWS FETCH NEXT ? ROWS ONLY', *parameters, (page - 1) * 50, 51)
        rows = cursor.fetchmany(51)
        return {'columns': columns, 'preview_columns': supported, 'rows': [list(row) for row in rows[:50]], 'has_more': len(rows) > 50, 'omitted_columns': len(columns) - len(supported), 'page': page, 'stable_order': bool(key_columns)}


def dataset_filter_values(target: SqlServerTarget, source: dict, column: str, search: str, offset: int, filters: dict) -> dict:
    if not isinstance(column, str) or not isinstance(search, str) or len(search) > 128 or type(offset) is not int or not 0 <= offset <= 100000:
        raise ValueError('DATASET_FILTER_INVALID')
    with closing(open_readonly_connection(target)) as connection:
        connection.timeout = min(target.timeout, 30)
        cursor = connection.cursor()
        _, _, supported = _dataset_columns(cursor, source)
        if column not in {item['name'] for item in supported}: raise ValueError('DATASET_FILTER_INVALID')
        conditions, params = _filter_sql(filters, supported)
        identifier = _quote_identifier(column)
        expression = f'CONVERT(nvarchar(256), {identifier})'
        conditions.append(f'({identifier} IS NULL OR DATALENGTH(CONVERT(nvarchar(max), {identifier})) <= 512)')
        if search:
            escaped = search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('[', '\\[')
            conditions.append(f"{expression} LIKE ? ESCAPE '\\'")
            params.append(f'%{escaped}%')
        where = ' AND '.join(conditions)
        cursor.execute(f'SELECT DISTINCT {expression} AS value FROM {_quote_identifier(source["schema"])}.{_quote_identifier(source["name"])} WHERE {where} ORDER BY value OFFSET ? ROWS FETCH NEXT ? ROWS ONLY', *params, offset, 51)
        rows = cursor.fetchmany(51)
        return {'values': [row[0] for row in rows[:50]], 'has_more': len(rows) > 50}


def test_sqlserver_connection(target: SqlServerTarget, allowed_hosts: set[str] | None = None) -> dict:
    try:
        with open_readonly_connection(target) as connection:
            cursor = connection.cursor()
            cursor.execute('SELECT DB_NAME(), @@VERSION')
            row = cursor.fetchone()
            return {'success': True, 'database': str(row[0]), 'server_version': str(row[1]).splitlines()[0]}
    except pyodbc.Error as exc:
        code, message = _classify_odbc_error(exc)
        return {'success': False, 'code': code, 'message': message}


def _classify_odbc_error(exc: pyodbc.Error) -> tuple[str, str]:
    """Return non-sensitive error category rather than raw driver details."""
    raw = ' '.join(str(part) for part in getattr(exc, 'args', ())).lower()
    if any(term in raw for term in (
        'certificate verify failed', 'certificate chain', 'self-signed certificate',
        'self signed certificate', 'certificate was rejected',
        'certificate is not trusted', 'unknown ca', 'unable to get local issuer',
        'hostname mismatch', 'target principal name is incorrect',
        'certificate name mismatch',
    )):
        return ('SQL_TLS_CERTIFICATE_UNTRUSTED',
                'SQL Server TLS certificate is not trusted or does not match the server name.')
    if any(term in raw for term in ('login failed', '18456', 'authentication failed')):
        return ('SQL_LOGIN_FAILED', 'SQL Server rejected the account credentials.')
    if any(term in raw for term in ('cannot open database', '4060', 'database requested by the login')):
        return ('SQL_DATABASE_UNAVAILABLE', 'Database does not exist or the account does not have access.')
    if any(term in raw for term in (
        'connection refused', '10061', 'server does not exist', 'server was not found',
        'could not open a connection', 'name or service not known',
        'nodename nor servname provided', 'no route to host', 'network is unreachable',
    )):
        return ('SQL_HOST_UNREACHABLE',
                'SQL Server host/port is unreachable or is not accepting connections.')
    if any(term in raw for term in ('timeout', 'timed out', 'hyt00', 'hyt01', '258')):
        return ('SQL_CONNECTION_TIMEOUT', 'Timed out connecting to SQL Server.')
    if any(term in raw for term in ('ssl provider', 'tls', 'ssl routines', 'handshake failure', 'protocol version')):
        return ('SQL_TLS_NEGOTIATION_FAILED', 'TLS negotiation with SQL Server failed; review encryption settings.')
    return ('CONNECTION_FAILED',
            'SQL Server connection failed; verify network, credentials, database, and TLS.')
