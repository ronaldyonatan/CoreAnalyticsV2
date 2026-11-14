"""Private gateway driver. PySpark launches spark-submit after reading credential bindings from stdin."""
import json
import os
import sys
import tempfile
import re
from pathlib import Path
from app.batch_graph import execute_graph,validate_plan,BatchError
from app.execution_policy import batch_execution
from app.batch_sources import read_sources
from app.batch_storage import storage_root,publish_outputs,uuid_id

SCRIPT_FAILURE_CODES = {'QUERY_SOURCE_DISABLED','QUERY_SOURCE_CONFIGURATION_INVALID',
    'QUERY_RESULT_COLUMN_INVALID','QUERY_RESULT_DECIMAL_UNSUPPORTED','QUERY_RESULT_TYPE_UNSUPPORTED',
    'QUERY_RESULT_INVALID','QUERY_RESULT_DUPLICATE_COLUMN','QUERY_RESULT_ROW_LIMIT',
    'QUERY_RESULT_TIMEZONE_UNSUPPORTED','QUERY_RESULT_REQUIRED'}


def is_script_request(request):
    return (isinstance(request, dict) and isinstance(request.get('sources'), list)
            and any(isinstance(source, dict) and source.get('kind') == 'sqlserver_script' for source in request['sources']))


def safe_script_failure(exc):
    code = str(exc)
    if code in SCRIPT_FAILURE_CODES:
        return code
    try:
        import pyodbc
        if isinstance(exc, pyodbc.Error):
            mapping = {'208':'QUERY_SQL_OBJECT_NOT_FOUND','207':'QUERY_SQL_COLUMN_NOT_FOUND',
                       '102':'QUERY_SQL_SYNTAX_ERROR','156':'QUERY_SQL_SYNTAX_ERROR','229':'QUERY_SQL_PERMISSION_DENIED'}
            for arg in exc.args:
                if isinstance(arg, str):
                    if arg in ('HYT00','HYT01'): return 'QUERY_SQL_TIMEOUT'
                    for number in re.findall(r'\((\d{2,5})\)', arg):
                        if number in mapping: return mapping[number]
    except ImportError:
        pass
    return 'BATCH_EXECUTION_FAILED'


def configured_jdbc_jars(environment):
    """Resolve explicitly configured drivers; query mode must have its guard."""
    jdbc = environment.get('STUDIO_SQLSERVER_JDBC_JAR')
    postgres = environment.get('STUDIO_POSTGRESQL_JDBC_JAR')
    guard = environment.get('STUDIO_SQLSERVER_QUERY_GUARD_JAR')
    if environment.get('STUDIO_DATASET_QUERY_SQLSERVER_ENABLED','').strip().lower() == 'true' and (not jdbc or not guard):
        raise BatchError('JDBC_DRIVER_NOT_CONFIGURED')
    jars = [path for path in (jdbc, postgres, guard) if path]
    for jar in jars:
        if not Path(jar).is_absolute() or not Path(jar).is_file():
            raise BatchError('JDBC_DRIVER_NOT_CONFIGURED')
    return jars


@batch_execution()
def run(request,spark=None):
    if not isinstance(request,dict) or set(request)!={'run_id','sources','nodes','outputs'}:raise BatchError('INVALID_REQUEST')
    if not isinstance(request['sources'],list) or any(not isinstance(s,dict) or not isinstance(s.get('id'),str) for s in request['sources']):raise BatchError('INVALID_REQUEST')
    uuid_id(request['run_id'])
    validate_plan([s['id'] for s in request['sources']],request['nodes'],request['outputs'])
    root=storage_root()
    if (root/request['run_id']).exists():raise BatchError('OUTPUT_ALREADY_EXISTS')
    owned=spark is None
    if spark is None:
        from pyspark.sql import SparkSession
        builder=SparkSession.builder.appName('CoreAnalytics batch '+request['run_id']).config('spark.ui.enabled','false').config('spark.sql.session.timeZone','UTC').config('spark.redaction.regex','(?i)secret|password|token|access.key|username')
        # spark-submit controls master/resources. Local mode must be explicitly configured by the operator.
        configured=os.environ.get('STUDIO_SPARK_MASTER')
        if configured:builder=builder.master(configured)
        elif not os.environ.get('PYSPARK_GATEWAY_PORT'):raise BatchError('SPARK_MASTER_NOT_CONFIGURED','Gunakan spark-submit --master ... atau STUDIO_SPARK_MASTER yang ditentukan administrator.')
        jars=configured_jdbc_jars(os.environ)
        if jars:builder=builder.config('spark.jars',','.join(jars))
        spark=builder.getOrCreate()
    try:
        # Freeze each source once. Branches and multiple outputs then read the same staged data.
        with tempfile.TemporaryDirectory(prefix='.inputs-'+request['run_id']+'-',dir=root) as staging:
            script_sources=[item for item in request['sources'] if item.get('kind')=='sqlserver_script']
            if script_sources:
                if len(request['sources'])!=1 or len(script_sources)!=1 or request['nodes'] or len(request['outputs'])!=1:
                    raise BatchError('INVALID_SOURCE')
                from app.sql_script_source import stage_source
                query_path,_ = stage_source(script_sources[0],staging)
                frames={script_sources[0]['id']:spark.read.parquet(str(query_path))}
            else:
                frames=read_sources(spark,request['sources'],root)
            snapshots={}
            for index,(identifier,frame) in enumerate(frames.items()):
                path=str(Path(staging)/('source-'+str(index)))
                frame.write.mode('errorifexists').parquet(path)
                snapshots[identifier]=spark.read.parquet(path)
            outputs=execute_graph(snapshots,request['nodes'],request['outputs'])
            return publish_outputs(root,request['run_id'],outputs)
    finally:
        if owned:spark.stop()


if __name__=='__main__':
    request=None
    try:
        raw=sys.stdin.buffer.readline(1_000_001)
        if len(raw)>1_000_000:raise BatchError('REQUEST_TOO_LARGE')
        request=json.loads(raw)
        result=run(request)
        json.dump({'success':True,'data':result},sys.stdout,ensure_ascii=False,allow_nan=False)
    except ValueError as exc:
        is_script=is_script_request(request)
        code=safe_script_failure(exc) if is_script else str(exc) if str(exc).startswith('BATCH_') else 'BATCH_INVALID_PLAN'
        json.dump({'success':False,'code':code,'detail':'' if is_script else getattr(exc,'detail','')[:1000]},sys.stdout);sys.exit(1)
    except Exception as exc:
        # JDBC exceptions and Spark plans may contain credentials; do not return them to callers.
        is_script=is_script_request(request)
        json.dump({'success':False,'code':safe_script_failure(exc) if is_script else 'BATCH_EXECUTION_FAILED'},sys.stdout);sys.exit(1)
