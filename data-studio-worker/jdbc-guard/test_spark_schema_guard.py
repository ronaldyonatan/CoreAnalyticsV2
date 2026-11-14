"""Local Spark integration test; uses only a fake JDBC driver, never a database."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from pyspark.sql import SparkSession

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from app import batch_sources
SOURCES = [
    ROOT / 'src/main/java/com/coreanalytics/jdbc/GuardedSqlServerDriver.java',
    ROOT / 'src/test/java/com/microsoft/sqlserver/jdbc/SQLServerDriver.java',
]


def main():
    with tempfile.TemporaryDirectory(prefix='coreanalytics-spark-jdbc-') as directory:
        build = Path(directory) / 'classes'
        build.mkdir()
        jar = Path(directory) / 'guard-test.jar'
        subprocess.run(['javac', '--release', '11', '-d', str(build), *map(str, SOURCES)], check=True)
        subprocess.run(['jar', 'cf', str(jar), '-C', str(build), '.'], check=True)
        os.environ['SPARK_LOCAL_IP'] = '127.0.0.1'
        os.environ['STUDIO_DATASET_QUERY_SQLSERVER_ENABLED'] = 'true'
        os.environ['STUDIO_DATASET_QUERY_CONNECTION_ID'] = '4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3'
        os.environ['STUDIO_DATASET_QUERY_EXECUTION_LOGIN'] = 'coreanalytics_reader'
        os.environ['STUDIO_SQL_ALLOW_PRIVATE'] = 'true'
        spark = (SparkSession.builder.master('local[1]').appName('CoreAnalytics JDBC guard schema test')
                 .config('spark.ui.enabled', 'false').config('spark.jars', str(jar)).getOrCreate())
        try:
            source = {'id': 'source', 'kind': 'sqlserver_query', 'address': '10.8.0.5',
                      'hostname': 'db.internal', 'port': 1433, 'database': 'BI',
                      'username': 'synthetic', 'password': 'synthetic', 'encrypt': True,
                      'trust_server_certificate': False, 'timeout': 10,
                      'connection_id': os.environ['STUDIO_DATASET_QUERY_CONNECTION_ID'],
                      'execution_login': 'coreanalytics_reader', 'query': 'SELECT 1 AS value'}
            # Explicitly bypass the development lock in this fake-driver test;
            # this never changes the setting of the actual worker process.
            batch_sources.QUERY_SECURITY_REVIEW_COMPLETE = True
            frame = batch_sources.read_sources(spark, [source], directory)['source']
            assert frame.columns == ['value'], frame.columns
            assert [row.value for row in frame.collect()] == [42]
            events = str(spark._jvm.com.microsoft.sqlserver.jdbc.SQLServerDriver.events.toString())
            assert events.index('WITH NO REVERT') < events.index('schema-prepare') < events.index('schema-query'), events
            assert events.count('WITH NO REVERT') >= 2, events
            assert events.count('schema-prepare') >= 2, events
            print('Spark JDBC schema and data connections used the guard before preparing queries.')
        finally:
            spark.stop()


if __name__ == '__main__':
    main()
