"""Existing SQL Server binding preserved behind the Phase 2 connector interface."""
from app.connectors.registry import ConnectorSpec, register


def bind_source(source, metadata, target, validate_target):
    hostname, address = validate_target(target)
    return {
        'id': source['id'], 'kind': 'sqlserver',
        'hostname': hostname, 'address': address, 'port': target.port,
        'database': target.database, 'schema': metadata['source_schema'],
        'table': metadata['source_name'], 'username': target.username,
        'password': target.password, 'encrypt': target.encrypt,
        'trust_server_certificate': target.trust_server_certificate,
        'timeout': target.timeout,
    }


def install():
    register(ConnectorSpec(
        kind='sqlserver',
        capabilities=frozenset({'test', 'browse', 'preview', 'read'}),
        bind_source=bind_source,
    ))
