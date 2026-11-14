"""Local Spark/Parquet integration using a fake cursor, never a database."""
import os
import sys
import tempfile
import datetime
import decimal
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'reader'))
from pyspark.sql import SparkSession
from app.sql_script_source import stage_source
from run_batch import run
from parquet_reader import read_page


class FakeCursor:
    description = [('value', int, None, None, None, None, True),
                   ('label', str, None, None, None, None, True),
                   ('amount', decimal.Decimal, None, None, 12, 2, True),
                   ('at', datetime.datetime, None, None, None, None, True)]
    def __init__(self): self.index = 0; self.executions = 0; self.closed = False
    def execute(self, script): assert script == 'SELECT 1 AS value'; self.executions += 1
    def fetchmany(self, count):
        self.index += 1
        return [(1, 'alpha', decimal.Decimal('12.30'), datetime.datetime(2026, 1, 2, 3, 4, 5)),
                (2, None, None, None)] if self.index == 1 else []
    def nextset(self): return False
    def close(self): self.closed = True


class FakeConnection:
    def __init__(self): self.instance = FakeCursor(); self.closed = False
    def cursor(self): return self.instance
    def close(self): self.closed = True


def main():
    os.environ['SPARK_LOCAL_IP'] = '127.0.0.1'
    spark = (SparkSession.builder.master('local[1]').appName('CoreAnalytics SQL script staging test')
             .config('spark.ui.enabled', 'false').getOrCreate())
    try:
        with tempfile.TemporaryDirectory(prefix='coreanalytics-query-stage-') as directory:
            root = Path(directory)
            run_id = '44444444-4444-4444-8444-444444444444'
            connection_id='4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3'
            source={'id':'source','kind':'sqlserver_script','address':'10.8.0.5','hostname':'db.internal',
                    'port':1433,'database':'BI','username':'synthetic','password':'synthetic','encrypt':True,
                    'trust_server_certificate':False,'timeout':10,'connection_id':connection_id,'script':'SELECT 1 AS value'}
            request={'run_id':run_id,'sources':[source],'nodes':[],
                     'outputs':[{'id':'output','name':'Dataset','input':{'node':'source','port':'main'}}]}
            env={'STUDIO_BATCH_STORAGE_ROOT':directory,'STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED':'true',
                 'STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID':connection_id,'STUDIO_SQL_ALLOW_PRIVATE':'true'}
            fake = FakeConnection()
            with patch.dict(os.environ, env), patch('app.sql_script_source.stage_source',
                 side_effect=lambda item, folder: stage_source(item, folder, connect=lambda *a, **kw:fake)):
                manifest = run(request, spark=spark)
            assert fake.instance.executions == 1 and fake.instance.closed and fake.closed
            assert manifest['outputs'][0]['row_count'] == 2
            page = read_page(root, {'run_id':run_id, 'node_id':'output', 'page':1})
            assert page['rows'] == [['1', 'alpha', '12.30', '2026-01-02T03:04:05'],
                                    ['2', None, None, None]], page['rows']
            print('Worker executed a simulated SQL batch once, published Parquet, and read the result.')
    finally:
        spark.stop()


if __name__ == '__main__':
    main()
