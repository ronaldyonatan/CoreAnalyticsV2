"""Trusted cluster bootstrap: read mounted secret, prepare private config, then drop root."""
import os
import re
import shlex
import sys
from pathlib import Path

secret_file=Path(os.environ.get('STUDIO_SPARK_AUTH_FILE','/run/secrets/spark_auth_secret'))
try:secret=os.environ.get('_SPARK_AUTH_SECRET') or secret_file.read_text().strip()
except OSError:raise SystemExit('Spark authentication secret file is missing/unreadable.')
if not re.fullmatch(r'[A-Za-z0-9]{32,256}',secret):raise SystemExit('Spark authentication secret must contain 32–256 alphanumeric characters.')
conf=Path('/tmp/coreanalytics-spark-conf');conf.mkdir(mode=0o700,exist_ok=True)
properties={
 'spark.authenticate':'true','spark.authenticate.secret':secret,
 'spark.network.crypto.enabled':'true','spark.network.crypto.authEngineVersion':'2',
 'spark.network.crypto.cipher':'AES/CTR/NoPadding','spark.network.crypto.saslFallback':'false',
 'spark.io.encryption.enabled':'true','spark.master.rest.enabled':'false',
 'spark.ui.enabled':'false','spark.sql.session.timeZone':'UTC',
 'spark.sql.shuffle.partitions':os.environ.get('STUDIO_SPARK_SHUFFLE_PARTITIONS','8'),
 'spark.redaction.regex':'(?i)secret|password|token|access.key|username',
}
file=conf/'spark-defaults.conf'
file.write_text(''.join(f'{k} {v}\n' for k,v in properties.items()))
file.chmod(0o600)
if os.geteuid()==0:
 os.chown(conf,185,185);os.chown(file,185,185)
os.environ['SPARK_CONF_DIR']=str(conf)
os.environ['_SPARK_AUTH_SECRET']=secret
os.environ['PYSPARK_PYTHON']='python3';os.environ['PYSPARK_DRIVER_PYTHON']='python3'
os.environ['STUDIO_BATCH_STORAGE_ROOT']='/var/lib/coreanalytics/parquet'
os.environ.setdefault('SPARK_DAEMON_MEMORY','256m')
# Daemons read JVM properties; authentication secret itself stays out of argv.
os.environ['SPARK_DAEMON_JAVA_OPTS']=' '.join('-D'+k+'='+v for k,v in properties.items() if k!='spark.authenticate.secret')
role=sys.argv[1] if len(sys.argv)>1 else ''
if role=='master':
 command=['/opt/spark/bin/spark-class','org.apache.spark.deploy.master.Master','--host',os.environ.get('SPARK_MASTER_HOST','spark-master'),'--port','7077','--webui-port','8080']
elif role=='worker':
 command=['/opt/spark/bin/spark-class','org.apache.spark.deploy.worker.Worker','--host',os.environ['STUDIO_SPARK_WORKER_HOST'],'--port','7078','--webui-port','8081','--cores',os.environ.get('STUDIO_SPARK_WORKER_CORES','2'),'--memory',os.environ.get('STUDIO_SPARK_WORKER_MEMORY','2g'),os.environ.get('STUDIO_SPARK_MASTER','spark://spark-master:7077')]
elif role=='gateway':command=['/bin/sleep','infinity']
elif role=='dispatcher':
 os.environ['PYTHONPATH']='/opt/control'
 os.environ['STUDIO_SPARK_DRIVER_HOST']=os.environ.get('STUDIO_SPARK_DRIVER_HOST','spark-dispatcher')
 command=['python3','-m','app.services.studio_dispatcher']
elif role=='submit':
 submit_args=['--master',os.environ.get('STUDIO_SPARK_MASTER','spark://spark-master:7077'),'--deploy-mode','client','--conf','spark.driver.host='+os.environ.get('STUDIO_SPARK_DRIVER_HOST','spark-gateway'),'--conf','spark.driver.bindAddress=0.0.0.0','--conf','spark.driver.port=39100','--conf','spark.driver.blockManager.port=39101','--conf','spark.cores.max='+os.environ.get('STUDIO_SPARK_JOB_CORES','2'),'--conf','spark.executor.cores=1','--executor-memory',os.environ.get('STUDIO_SPARK_EXECUTOR_MEMORY','1g'),'--driver-memory',os.environ.get('STUDIO_SPARK_DRIVER_MEMORY','1g'),'pyspark-shell']
 os.environ['PYTHONPATH']=os.pathsep.join([str(p) for p in Path('/opt/spark/python/lib').glob('*.zip')]+[os.environ.get('PYTHONPATH','')])
 os.environ['PYSPARK_SUBMIT_ARGS']=shlex.join(submit_args)
 os.environ['STUDIO_SPARK_MASTER']=os.environ.get('STUDIO_SPARK_MASTER','spark://spark-master:7077')
 command=['python3','/opt/coreanalytics/run_batch.py']
else:raise SystemExit('Expected master, worker, gateway, dispatcher or submit role.')
if os.geteuid()==0:
 os.setgroups([]);os.setgid(185);os.setuid(185)
os.execvpe(command[0],command,os.environ)
