"""Durable single-driver dispatcher. SQL leases fence catalog writes; Parquet is immutable."""
import json
import os
import signal
import sys
import subprocess
import threading
import time
import uuid
from pathlib import Path
from app.services.studio_pipelines import pipeline_store, validate_document, PipelineError
from app.services.studio_batch_bindings import bind_run



# Only fixed public codes are retained. Never log raw exceptions, JDBC traces, or source bindings.
PUBLIC_FAILURE_CODES=frozenset((
    'BATCH_RECOVERY_REQUIRED','BATCH_TIMEOUT','BATCH_DISPATCHER_STOPPED','BATCH_MANIFEST_INVALID','BATCH_MANIFEST_MISSING',
    'PIPELINE_NOT_READY','DATA_STUDIO_FORBIDDEN','BATCH_REQUEST_TOO_LARGE','BATCH_RESPONSE_TOO_LARGE',
    'UNTRUSTED_CERT_DISABLED','HOST_NOT_ALLOWED','SQL_HOST_INVALID','SQL_HOST_UNRESOLVABLE','SQL_HOST_BLOCKED',
    'SQL_NETWORK_NOT_ALLOWED','SQL_PRIVATE_DESTINATION_DISABLED','SQL_NETWORK_POLICY_REQUIRED','SQL_NETWORK_POLICY_INVALID','SQL_HOST_POLICY_INVALID',
    'SQL_PORT_NOT_ALLOWED','SQL_PORT_POLICY_INVALID','SQL_PORT_OR_TIMEOUT_INVALID','SQL_CREDENTIALS_INVALID',
    'SQL_CONNECTION_PARAMETER_INVALID','SQL_OPTIONS_INVALID','DATASET_NOT_FOUND','BATCH_SOURCE_NOT_AVAILABLE',
    'CONNECTION_UNAVAILABLE','CONNECTION_KEY_VERSION_UNSUPPORTED','DATASET_CONNECTION_METADATA_UNAVAILABLE',
    'BATCH_UNSUPPORTED_COMPONENT','BATCH_INVALID_PLAN','BATCH_INVALID_GRAPH','BATCH_INVALID_SOURCE','BATCH_SOURCE_NOT_FOUND',
    'BATCH_INVALID_SQL_SOURCE','BATCH_STORAGE_NOT_CONFIGURED','BATCH_STORAGE_PATH_INVALID','BATCH_OUTPUT_ALREADY_EXISTS',
    'BATCH_EXECUTION_FAILED','BATCH_DRIVER_START_FAILED',
    'PIPELINE_OUTPUT_INVALID','PIPELINE_METADATA_UNAVAILABLE','PIPELINE_STATUS_INVALID','PIPELINE_UUID_TRANSPORT_REQUIRED',
))
PHASE_FAILURE_CODES={'VALIDATE':'BATCH_GRAPH_VALIDATION_FAILED','AUTHORIZE':'BATCH_ACCESS_CHECK_FAILED',
    'RECOVER':'BATCH_RECOVERY_FAILED','BIND_SOURCE':'BATCH_SOURCE_BIND_FAILED','EXECUTE':'BATCH_EXECUTION_FAILED',
    'REGISTER_OUTPUT':'BATCH_OUTPUT_REGISTRATION_FAILED'}


def failure_code(exc,phase):
    code=str(exc)
    return code if code in PUBLIC_FAILURE_CODES else PHASE_FAILURE_CODES.get(phase,'BATCH_EXECUTION_FAILED')


def driver_environment(environment):
    allowed={'PATH','HOME','JAVA_HOME','LANG','LC_ALL','SPARK_HOME','SPARK_CONF_DIR','_SPARK_AUTH_SECRET','STUDIO_BATCH_STORAGE_ROOT','STUDIO_SQLSERVER_JDBC_JAR','STUDIO_POSTGRESQL_JDBC_JAR','STUDIO_POSTGRESQL_ALLOWED_PORTS','STUDIO_SQL_ALLOW_PRIVATE','STUDIO_SQL_ALLOWED_NETWORKS','STUDIO_SQL_ALLOWED_PORTS'}
    return {k:v for k,v in environment.items() if k in allowed or k.startswith('STUDIO_SPARK_')}



def driver_launch(environment):
    """Select a trusted, operator-configured driver; never accept shell commands."""
    mode=environment.get('STUDIO_BATCH_DRIVER_MODE','cluster')
    if mode=='cluster':
        return ['python3','/opt/coreanalytics/start_cluster.py','submit'],driver_environment(environment)
    if mode!='local':
        raise ValueError('BATCH_DRIVER_START_FAILED')
    python=Path(environment.get('STUDIO_BATCH_LOCAL_PYTHON',''))
    script=Path(environment.get('STUDIO_BATCH_LOCAL_SCRIPT',''))
    if not python.is_absolute() or not python.is_file() or not script.is_absolute() or not script.is_file() or script.name!='run_batch.py':
        raise ValueError('BATCH_DRIVER_START_FAILED')
    if not environment.get('STUDIO_SPARK_MASTER','').startswith('local[') or not environment['STUDIO_SPARK_MASTER'].endswith(']'):
        raise ValueError('BATCH_DRIVER_START_FAILED')
    env=driver_environment(environment)
    env['PYTHONPATH']=str(script.parent)
    env['PYSPARK_PYTHON']=str(python)
    env['PYSPARK_DRIVER_PYTHON']=str(python)
    env['SPARK_LOCAL_IP']='127.0.0.1'
    return [str(python),str(script)],env

def committed_outputs(root,run_id,graph):
    root=Path(root).resolve();directory=root/run_id;path=directory/'manifest.json'
    if not path.exists():return None
    if directory.is_symlink() or path.is_symlink() or path.stat().st_size>1024*1024:raise ValueError('BATCH_MANIFEST_INVALID')
    manifest=json.loads(path.read_text())
    expected={o['id']:o['name'] for o in graph['outputs']}
    if manifest.get('version')!=1 or manifest.get('run_id')!=run_id or not isinstance(manifest.get('outputs'),list) or len(manifest['outputs'])!=len(expected):raise ValueError('BATCH_MANIFEST_INVALID')
    found=set();outputs=[]
    for index,item in enumerate(manifest['outputs']):
        if item.get('id') not in expected or item['id'] in found or item.get('name')!=expected[item['id']] or item.get('path')!='output-'+str(index) or type(item.get('row_count'))is not int or item['row_count']<0 or not isinstance(item.get('schema'),dict) or item['schema'].get('type')!='struct':raise ValueError('BATCH_MANIFEST_INVALID')
        data=directory/item['path']
        if not data.is_dir() or data.is_symlink() or not data.resolve().is_relative_to(root):raise ValueError('BATCH_MANIFEST_INVALID')
        found.add(item['id']);outputs.append({**item,'path':run_id+'/'+item['path']})
    return outputs


def authorize(owner):
    from app.services.auth_service import get_user_access_profile
    profile=get_user_access_profile(owner)
    if 'data_studio' not in {str(m.get('route_key','')).lower() for m in profile.get('menus',[]) if isinstance(m,dict)}:raise PermissionError('DATA_STUDIO_FORBIDDEN')


def bind(owner,run_id,graph,heartbeat=None):
    from app.routes.studio_datasets_api import _target
    from app.clients.core_api_client import core_api
    from app.services.studio_connections import _rows
    if heartbeat:heartbeat()
    rows=_rows(core_api._post_mode('CoreStudioDatasetList',{'UserID':owner})) if any(s['kind']=='dataset' for s in graph['sources']) else []
    definitions={str(row['dataset_id']).lower():row for row in rows if row.get('dataset_id')}
    def target(user,connection):
        if heartbeat:heartbeat()
        result=_target(user,connection)
        if heartbeat:heartbeat()
        return result
    return bind_run(owner,run_id,graph,definitions,target)


def terminate(process):
    # A dead Python launcher can leave its JVM alive; fence the entire driver group.
    try:os.killpg(process.pid,signal.SIGTERM)
    except ProcessLookupError:
        process.wait(timeout=5);return
    try:process.wait(timeout=3)
    except subprocess.TimeoutExpired:pass
    try:os.killpg(process.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    process.wait(timeout=5)


class Dispatcher:
    def __init__(self,store=pipeline_store,root=None,command=None,authorize_owner=authorize,binder=None,timeout=3600,heartbeat_seconds=5):
        self.store=store;self.root=Path(root or os.environ['STUDIO_BATCH_STORAGE_ROOT'])
        self.command=command
        self.driver_env=None
        self.authorize=authorize_owner;self.worker_id=str(uuid.uuid4());self.stopping=False
        self.bind=binder or (lambda owner,run_id,graph:bind(owner,run_id,graph,lambda:self.store.heartbeat(self.worker_id,run_id)))
        self.timeout=max(1,min(int(timeout),86400));self.heartbeat_seconds=heartbeat_seconds

    def once(self):
        job=self.store.claim(self.worker_id)
        if not job.get('has_job'):return False
        run_id=str(uuid.UUID(job['run_id']));process=None;lease=True;phase='VALIDATE'
        try:
            graph=validate_document(json.loads(job['graph_json']))['graph']
            if graph is None:raise ValueError('PIPELINE_NOT_READY')
            phase='AUTHORIZE'
            self.authorize(job['requested_by'])
            if job.get('cancel_requested'):
                self.store.complete(self.worker_id,run_id,'CANCELLED');return True
            phase='RECOVER'
            outputs=committed_outputs(self.root,run_id,graph)
            if outputs is not None:
                self.store.complete(self.worker_id,run_id,'SUCCEEDED',outputs);return True
            # An expired driver might still be running. Never rerun the same immutable run ID.
            if job.get('is_recovery'):raise ValueError('BATCH_RECOVERY_REQUIRED')
            phase='BIND_SOURCE'
            request=self.bind(job['requested_by'],run_id,graph)
            payload=(json.dumps(request,ensure_ascii=False,allow_nan=False)+'\n').encode()
            if len(payload)>1024*1024:raise ValueError('BATCH_REQUEST_TOO_LARGE')
            heartbeat=self.store.heartbeat(self.worker_id,run_id)
            if heartbeat.get('cancel_requested'):
                self.store.complete(self.worker_id,run_id,'CANCELLED');return True
            phase='EXECUTE'
            command,child_env=driver_launch(os.environ) if self.command is None else (self.command,driver_environment(os.environ))
            process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=child_env,start_new_session=True,cwd='/tmp')
            # Drain both streams without retaining logs or credentials, or risking pipe deadlock.
            output=bytearray();overflow=threading.Event()
            def drain(stream,retain=False):
                while True:
                    chunk=stream.read(65536)
                    if not chunk:break
                    if retain:
                        if len(output)+len(chunk)>3*1024*1024:overflow.set()
                        elif not overflow.is_set():output.extend(chunk)
                stream.close()
            readers=[threading.Thread(target=drain,args=(process.stdout,True),daemon=True),threading.Thread(target=drain,args=(process.stderr,),daemon=True)]
            for thread in readers:thread.start()
            def send():
                try:process.stdin.write(payload)
                except (BrokenPipeError,OSError):pass
                finally:
                    try:process.stdin.close()
                    except (BrokenPipeError,OSError):pass
            writer=threading.Thread(target=send,daemon=True);writer.start()
            started=time.monotonic();next_heartbeat=started
            while process.poll() is None:
                if self.stopping:raise ValueError('BATCH_DISPATCHER_STOPPED')
                if overflow.is_set():raise ValueError('BATCH_RESPONSE_TOO_LARGE')
                now=time.monotonic()
                if now-started>self.timeout:raise ValueError('BATCH_TIMEOUT')
                if now>=next_heartbeat:
                    try:heartbeat=self.store.heartbeat(self.worker_id,run_id)
                    except Exception:lease=False;raise
                    if heartbeat.get('cancel_requested'):
                        terminate(process);self.store.complete(self.worker_id,run_id,'CANCELLED');return True
                    next_heartbeat=now+self.heartbeat_seconds
                time.sleep(0.1)
            for thread in readers:thread.join(timeout=3)
            writer.join(timeout=1)
            if overflow.is_set():raise ValueError('BATCH_RESPONSE_TOO_LARGE')
            try:result=json.loads(output)
            except (ValueError,UnicodeError):raise ValueError('BATCH_DRIVER_START_FAILED') from None
            if process.returncode!=0 or not isinstance(result,dict) or result.get('success') is not True:
                code=result.get('code') if isinstance(result,dict) else None
                raise ValueError(code if isinstance(code,str) and code in PUBLIC_FAILURE_CODES else 'BATCH_EXECUTION_FAILED')
            phase='REGISTER_OUTPUT'
            outputs=committed_outputs(self.root,run_id,graph)
            if outputs is None:raise ValueError('BATCH_MANIFEST_MISSING')
            self.store.complete(self.worker_id,run_id,'SUCCEEDED',outputs)
        except Exception as exc:
            if process is not None:terminate(process)
            if isinstance(exc,PipelineError) and str(exc)=='PIPELINE_LEASE_LOST':lease=False
            if lease:
                code=failure_code(exc,phase)
                print('PIPELINE_JOB_FAILED '+json.dumps({'run_id':run_id,'stage':phase,'code':code}),flush=True)
                try:self.store.complete(self.worker_id,run_id,'FAILED',error_code=code)
                except Exception:pass  # Lease expiry and committed manifest reconcile after restart.
        return True

    def run(self):
        for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,lambda *_:setattr(self,'stopping',True))
        queue_ready=None
        while not self.stopping:
            try:
                worked=self.once();ready=True
            except Exception:
                worked=False;ready=False
            if ready!=queue_ready:
                # Operational state only: no request payload, source data, or credential logging.
                print('PIPELINE_QUEUE_CONNECTED' if ready else 'PIPELINE_QUEUE_UNAVAILABLE',flush=True)
                queue_ready=ready
            if not worked:
                for _ in range(30):
                    if self.stopping:break
                    time.sleep(.1)


if __name__=='__main__':
    Dispatcher(timeout=os.getenv('STUDIO_BATCH_JOB_TIMEOUT','3600')).run()
