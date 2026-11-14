"""Read-only configuration preflight. Never print the SQL catalog connection string."""
import argparse
import os
import pathlib
import sys
import zipfile

CLASSES = {
    'SQL Server': ('STUDIO_SQLSERVER_JDBC_JAR', 'com/microsoft/sqlserver/jdbc/SQLServerDriver.class'),
    'PostgreSQL': ('STUDIO_POSTGRESQL_JDBC_JAR', 'org/postgresql/Driver.class'),
}


def validate(env, require_dsn=True):
    problems = []
    for label, (key, classname) in CLASSES.items():
        value = env.get(key, '')
        if not value:
            problems.append(f'{label} JDBC is not configured ({key})')
            continue
        jar = pathlib.Path(value)
        if not jar.is_absolute() or not jar.is_file():
            problems.append(f'{label} JDBC path is invalid')
            continue
        try:
            with zipfile.ZipFile(jar) as file:
                if classname not in file.namelist():
                    problems.append(f'{label} JDBC does not contain its driver class')
        except (OSError, zipfile.BadZipFile):
            problems.append(f'{label} JDBC is not a valid JAR')
        else:
            print(f'{label} JDBC: OK ({jar.name})')

    if env.get('STUDIO_BATCH_DRIVER_MODE') != 'local':
        problems.append('STUDIO_BATCH_DRIVER_MODE must be local')
    if env.get('STUDIO_SPARK_MASTER', '').startswith('local[') is False:
        problems.append('STUDIO_SPARK_MASTER must be local[n]')
    for key in ('STUDIO_BATCH_STORAGE_ROOT', 'STUDIO_BATCH_LOCAL_PYTHON', 'STUDIO_BATCH_LOCAL_SCRIPT'):
        value = env.get(key, '')
        if not value or not pathlib.Path(value).is_absolute():
            problems.append(f'{key} must be an absolute path')
    if require_dsn and not env.get('STUDIO_INGEST_SQL_CONNECTION_STRING'):
        problems.append('STUDIO_INGEST_SQL_CONNECTION_STRING is missing in worker environment')
    if env.get('STUDIO_SQL_HOST_POLICY', 'dynamic').lower() == 'dynamic':
        print('Host policy: dynamic (no fixed IP list imposed by this patch)')
    else:
        print('Host policy: configured externally (not changed)')
    if env.get('STUDIO_SQL_ALLOW_PRIVATE', '').lower() != 'true':
        print('NOTE: private database destinations are not enabled; configure explicitly if trusted')
    print('PostgreSQL port policy:', env.get('STUDIO_POSTGRESQL_ALLOWED_PORTS', '5432'))
    if problems:
        for p in problems:
            print('ERROR:', p, file=sys.stderr)
        return False
    print('Dataset worker preflight: OK')
    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-dsn', action='store_true', help='Skip ingestion catalog DSN for offline Spark check')
    args = parser.parse_args()
    sys.exit(0 if validate(os.environ, not args.no_dsn) else 1)
