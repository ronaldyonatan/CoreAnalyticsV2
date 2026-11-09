"""Private gateway driver. PySpark launches spark-submit after reading credential bindings from stdin."""
import json
import os
import sys
import tempfile
from pathlib import Path
from app.batch_graph import execute_graph,validate_plan,BatchError
from app.execution_policy import batch_execution
from app.batch_sources import read_sources
from app.batch_storage import storage_root,publish_outputs,uuid_id


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
        jdbc=os.environ.get('STUDIO_SQLSERVER_JDBC_JAR')
        if jdbc:
            if not Path(jdbc).is_absolute() or not Path(jdbc).is_file():raise BatchError('JDBC_DRIVER_NOT_CONFIGURED')
            builder=builder.config('spark.jars',jdbc)
        spark=builder.getOrCreate()
    try:
        frames=read_sources(spark,request['sources'],root)
        # Freeze each source once. Branches and multiple outputs then read the same staged data.
        with tempfile.TemporaryDirectory(prefix='.inputs-'+request['run_id']+'-',dir=root) as staging:
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
    try:
        raw=sys.stdin.buffer.readline(1_000_001)
        if len(raw)>1_000_000:raise BatchError('REQUEST_TOO_LARGE')
        result=run(json.loads(raw))
        json.dump({'success':True,'data':result},sys.stdout,ensure_ascii=False,allow_nan=False)
    except ValueError as exc:
        json.dump({'success':False,'code':str(exc) if str(exc).startswith('BATCH_') else 'BATCH_INVALID_PLAN','detail':getattr(exc,'detail','')[:1000]},sys.stdout);sys.exit(1)
    except Exception:
        # JDBC exceptions and Spark plans may contain credentials; do not return them to callers.
        json.dump({'success':False,'code':'BATCH_EXECUTION_FAILED'},sys.stdout);sys.exit(1)
