"""SQL Server connection tester and dynamic host security policy.

The SQL host comes from the user-supplied connection configuration, not a
hardcoded IP list. Explicit opt-in STUDIO_SQL_HOST_POLICY=dynamic allows new
routable IPs/FQDNs while refusing local/multicast/link-local infrastructure.

For backward compatibility, the default policy is 'allowlist'; operators can
opt in to dynamic once via environment configuration. Dynamic mode additionally requires STUDIO_SQL_ALLOWED_NETWORKS (CIDRs).
STUDIO_SQL_ALLOWED_PORTS defaults to 1433; '*' explicitly permits custom ports.
Use 0.0.0.0/0,::/0 for self-service destinations without per-server approvals.
Infrastructure exclusions still apply. Permissions and egress remain required.
"""
from dataclasses import dataclass
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
        if mode == 'dynamic':
            raise SqlTargetPolicyError('SQL_NETWORK_POLICY_REQUIRED', 503)
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


def _validate_port(port: int) -> None:
    # Explicit deployment-wide opt-in for user-supplied SQL Server ports.
    if os.getenv('STUDIO_SQL_ALLOWED_PORTS', '1433').strip() == '*':
        if type(port) is not int or not 1 <= port <= 65535:
            raise SqlTargetPolicyError('SQL_PORT_OR_TIMEOUT_INVALID')
        return
    try:
        allowed = {int(value.strip()) for value in
                   os.getenv('STUDIO_SQL_ALLOWED_PORTS', '1433').split(',') if value.strip()}
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


def validate_sqlserver_host(host: str, port: int = 1433) -> tuple[str, str]:
    """Return (original host, pinned resolved IP), or reject unsafe destinations.

    Resolves DNS before connecting and never forwards a hostname to the ODBC
    driver. The driver connects to the validated numeric IP to reduce DNS
    rebinding risk. HostnameInCertificate preserves TLS hostname checks.
    """
    host = _validate_host_syntax(host)
    mode = os.getenv('STUDIO_SQL_HOST_POLICY', 'allowlist').strip().lower()
    if mode not in ('dynamic', 'allowlist'):
        raise SqlTargetPolicyError('SQL_HOST_POLICY_INVALID', 503)
    networks = _configured_networks(mode)
    _validate_port(port)
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


def test_sqlserver_connection(target: SqlServerTarget, allowed_hosts: set[str] | None = None) -> dict:
    original_host, resolved_ip = validate_target(target, allowed_hosts)
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
    try:
        with pyodbc.connect(connection_string, timeout=target.timeout, autocommit=True) as connection:
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
