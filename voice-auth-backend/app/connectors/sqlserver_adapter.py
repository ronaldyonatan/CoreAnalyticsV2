"""Existing SQL Server binding preserved behind the Phase 2 connector interface."""
from app.connectors.registry import ConnectorSpec, register
from app.connectors import sqlserver as sql


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


def make_target(body):
    return sql.SqlServerTarget(
        host=body['server_host'], port=body.get('server_port', 1433),
        database=body['database_name'], username=body['login_username'],
        password=body['password'], encrypt=body.get('encrypt_transport', True),
        trust_server_certificate=body.get('trust_server_certificate', False),
        timeout=body.get('connection_timeout_seconds', 10),
    )

def install():
    register(ConnectorSpec(
        kind='sqlserver',
        capabilities=frozenset({'test', 'browse', 'preview', 'read'}),
        bind_source=bind_source,
        make_target=make_target,
        validate_target=sql.validate_target,
        test_connection=sql.test_sqlserver_connection,
        browse=sql.list_sqlserver_objects,
        object_exists=sql.sqlserver_object_exists,
        preview=sql.preview_sqlserver_object,
        filter_values=sql.dataset_filter_values,
    ))
