"""DEV SQL Server script source; execute once with Connection credentials.

Only trusted server-produced bindings are accepted. No implicit retry: an
arbitrary SQL script may change source data, even when ingestion later fails.
"""
import ipaddress
import os
import uuid
from contextlib import closing

from app.batch_graph import BatchError
from app.operation_common import fields, text
from app.sql_script_staging import stage_sql_script


def stage_source(item, folder, *, connect=None):
    fields(item, 'id kind address hostname port database username password encrypt trust_server_certificate timeout connection_id script')
    if os.getenv('STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED', '').strip().lower() != 'true':
        raise BatchError('QUERY_SOURCE_DISABLED')
    try:
        requested = str(uuid.UUID(str(item['connection_id'])))
        allowed = str(uuid.UUID(os.getenv('STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID', '')))
    except (ValueError, TypeError, AttributeError):
        raise BatchError('QUERY_SOURCE_CONFIGURATION_INVALID') from None
    if requested != allowed or item['kind'] != 'sqlserver_script':
        raise BatchError('QUERY_SOURCE_CONFIGURATION_INVALID')
    try:
        ip = ipaddress.ip_address(item['address'])
    except (ValueError, TypeError):
        raise BatchError('INVALID_SQL_SOURCE') from None
    if (ip.version == 6 and ip.ipv4_mapped) or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved or ip in ipaddress.ip_network('100.64.0.0/10') or ip in ipaddress.ip_network('198.18.0.0/15') or ip == ipaddress.ip_address('168.63.129.16'):
        raise BatchError('INVALID_SQL_SOURCE')
    if ip.is_private and os.getenv('STUDIO_SQL_ALLOW_PRIVATE', 'false').lower() != 'true':
        raise BatchError('INVALID_SQL_SOURCE')
    networks = os.getenv('STUDIO_SQL_ALLOWED_NETWORKS', '').strip()
    if networks:
        try:
            allowed_networks = [ipaddress.ip_network(n.strip(), strict=True) for n in networks.split(',')]
        except ValueError:
            raise BatchError('INVALID_SQL_SOURCE') from None
        if not any(ip in network for network in allowed_networks if network.version == ip.version):
            raise BatchError('INVALID_SQL_SOURCE')
    if type(item['port']) is not int or not 1 <= item['port'] <= 65535 or type(item['timeout']) is not int or not 1 <= item['timeout'] <= 120 or type(item['encrypt']) is not bool or type(item['trust_server_certificate']) is not bool:
        raise BatchError('INVALID_SQL_SOURCE')
    ports = os.getenv('STUDIO_SQL_ALLOWED_PORTS', '1433').strip()
    if ports != '*':
        try:
            if item['port'] not in {int(x.strip()) for x in ports.split(',')}:
                raise BatchError('INVALID_SQL_SOURCE')
        except ValueError:
            raise BatchError('INVALID_SQL_SOURCE') from None
    for key in ('hostname', 'database', 'username', 'password'):
        text(item[key], 1024 if key == 'password' else 255, True)
    script = text(item['script'], 32000, True)
    if '\x00' in script or any(c in item['hostname'] for c in ';{}\r\n\x00'):
        raise BatchError('INVALID_SQL_SOURCE')
    if any(c in item['database'] or c in item['username'] for c in ';{}\r\n\x00') or any(c in item['password'] for c in '\r\n\x00'):
        raise BatchError('INVALID_SQL_SOURCE')
    escape = lambda value: '{' + value.replace('}', '}}') + '}'
    address = '[' + str(ip) + ']' if ip.version == 6 else str(ip)
    connstr = ('DRIVER={ODBC Driver 18 for SQL Server};SERVER=tcp:' + address + ',' + str(item['port'])
               + ';DATABASE=' + escape(item['database']) + ';UID=' + escape(item['username'])
               + ';PWD=' + escape(item['password']) + ';Encrypt=' + ('yes' if item['encrypt'] else 'no')
               + ';TrustServerCertificate=' + ('yes' if item['trust_server_certificate'] else 'no')
               + ';Connection Timeout=' + str(item['timeout']) + ';ApplicationIntent=ReadOnly;')
    if item['hostname'] != str(ip) and item['encrypt'] and not item['trust_server_certificate']:
        connstr += 'HostnameInCertificate=' + escape(item['hostname']) + ';'
    if connect is None:
        import pyodbc
        pyodbc.pooling = False
        connect = pyodbc.connect
    try:
        query_timeout = int(os.getenv('STUDIO_SQL_SCRIPT_QUERY_TIMEOUT', '300'))
        max_rows = int(os.getenv('STUDIO_SQL_SCRIPT_MAX_ROWS', '10000000'))
    except ValueError:
        raise BatchError('QUERY_SOURCE_CONFIGURATION_INVALID') from None
    if not 1 <= query_timeout <= 3600 or not 1 <= max_rows <= 100000000:
        raise BatchError('QUERY_SOURCE_CONFIGURATION_INVALID')
    with closing(connect(connstr, timeout=item['timeout'], autocommit=True)) as connection:
        connection.timeout = query_timeout
        cursor = connection.cursor()
        try:
            return stage_sql_script(cursor, script, folder, max_rows=max_rows)
        finally:
            cursor.close()
