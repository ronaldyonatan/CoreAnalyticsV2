"""Parquet deletion: owner-scoped SQL tombstone first, then isolated local filesystem cleanup.

Requires migration 024. Never accepts filesystem paths from the client.
"""
import json
import os
import re
import shutil
import uuid
from pathlib import Path
from app.services.studio_dataset_ingest import call as ingest_call, jobs as ingest_jobs
from app.services.studio_pipelines import pipeline_store

class DeleteError(ValueError):
    def __init__(self, code, status=409):
        super().__init__(code)
        self.http_status=status


def _uuid(value):
    try:
        if not isinstance(value,str): raise ValueError()
        return str(uuid.UUID(value))
    except (TypeError,ValueError,AttributeError):
        raise DeleteError('PARQUET_DELETE_INVALID',400) from None


def _root():
    raw=os.environ.get('STUDIO_BATCH_STORAGE_ROOT','')
    if not raw or not Path(raw).is_absolute():
        raise DeleteError('PARQUET_STORAGE_NOT_CONFIGURED',503)
    root=Path(raw).resolve(strict=True)
    if not root.is_dir() or root.is_symlink():
        raise DeleteError('PARQUET_STORAGE_INVALID',503)
    return root


def _resolve(owner,kind,target_id,run_id):
    target_id=_uuid(target_id)
    if kind=='ETL_OUTPUT':
        # Resolve immutable owner-scoped output first; use the SQL-backed run id.
        record=pipeline_store.output(owner,target_id)
        run_id=_uuid(record['run_id'])
        return run_id,target_id
    if kind=='STORED':
        run_id=_uuid(run_id)
        # Owner-scoped ingest history. Require exact matching dataset + succeeded run.
        matches=[x for x in ingest_jobs(owner) if str(x.get('dataset_id','')).lower()==target_id
                 and str(x.get('run_id','')).lower()==run_id and x.get('status')=='SUCCEEDED']
        if not matches:raise DeleteError('PARQUET_DELETE_NOT_FOUND',404)
        return run_id,None
    raise DeleteError('PARQUET_DELETE_INVALID',400)


def _rpc(owner,kind,action,target_id,run_id,output_id):
    if kind=='STORED':
        return ingest_call(action,owner,DatasetID=target_id,RunID=run_id,OutputVersionID=output_id)
    return pipeline_store.call(action,owner,RunID=run_id,OutputVersionID=output_id)


def _artifact(root,run_id,relative):
    # Both writers use run UUID / output-N. SQL is authoritative, but still validate.
    if not isinstance(relative,str) or not re.fullmatch(re.escape(run_id)+r'/output-(?:0|[1-5])',relative):
        raise DeleteError('PARQUET_DELETE_PATH_INVALID',409)
    run=root/run_id
    target=root/relative
    if run.is_symlink() or target.is_symlink() or not run.is_dir() or not target.is_dir():
        raise DeleteError('PARQUET_DELETE_ARTIFACT_MISSING',409)
    if target.resolve()!=target or run.resolve()!=run or target.parent!=run:
        raise DeleteError('PARQUET_DELETE_PATH_INVALID',409)
    manifest=run/'manifest.json'
    if manifest.is_symlink() or not manifest.is_file() or manifest.stat().st_size>1024*1024:
        raise DeleteError('PARQUET_DELETE_MANIFEST_INVALID',409)
    try:
        info=json.loads(manifest.read_text('utf-8'))
        outputs=info['outputs']
        assert info['run_id']==run_id and info['version']==1
        assert isinstance(outputs,list) and any(isinstance(x,dict) and x.get('path')==target.name for x in outputs)
    except (OSError,ValueError,KeyError,AssertionError,TypeError):
        raise DeleteError('PARQUET_DELETE_MANIFEST_INVALID',409) from None
    # Reject symlinks anywhere inside target (shutil.rmtree would otherwise be a poor policy).
    for directory, dirs, files in os.walk(target,followlinks=False):
        for name in dirs+files:
            if (Path(directory)/name).is_symlink():
                raise DeleteError('PARQUET_DELETE_SYMLINK_REJECTED',409)
    return target


def capability(owner,kind,target_id,run_id):
    try:
        root=_root()
        run_id,output_id=_resolve(owner,kind,target_id,run_id)
        row=_rpc(owner,kind,'CheckDelete',target_id,run_id,output_id)
        path=_artifact(root,run_id,row['storage_relative_path'])
        size=sum(p.stat().st_size for p in path.rglob('*') if p.is_file())
        return {'allowed':True,'size_bytes':size}
    except Exception as exc:
        # Diagnostic only: keep API response generic and deletion disabled.
        import logging
        logging.getLogger(__name__).exception(
            "Parquet delete capability check failed: %s",
            type(exc).__name__
        )
        return {'allowed':False,'reason':'PARQUET_DELETE_UNAVAILABLE'}


def delete(owner,kind,target_id,run_id):
    root=_root()
    run_id,output_id=_resolve(owner,kind,target_id,run_id)
    check=_rpc(owner,kind,'CheckDelete',target_id,run_id,output_id)
    target=_artifact(root,run_id,check['storage_relative_path'])
    # No client-supplied path; exclusive SQL tombstone blocks new metadata readers.
    begun=_rpc(owner,kind,'BeginDelete',target_id,run_id,output_id)
    output_id=begun['output_version_id']
    staged=target.parent/('.parquet-delete-'+output_id)
    if staged.exists() or staged.is_symlink():
        raise DeleteError('PARQUET_DELETE_RECOVERY_REQUIRED',409)
    renamed=False
    try:
        target.rename(staged)
        renamed=True
        # Record irreversible deletion before removing staged bytes: a crash leaves
        # a tombstone (fail closed), and orphan cleanup can be done after review.
        _rpc(owner,kind,'FinishDelete',target_id,run_id,output_id)
    except Exception:
        if renamed:
            try:staged.rename(target)
            except OSError:pass
        try:_rpc(owner,kind,'AbortDelete',target_id,run_id,output_id)
        except Exception:pass
        raise DeleteError('PARQUET_DELETE_FAILED',503) from None
    try:
        shutil.rmtree(staged)
        return {'deleted':True,'run_id':run_id,'output_version_id':output_id}
    except OSError:
        # Metadata remains deleted; data is quarantined, not visible to readers.
        return {'deleted':True,'cleanup_pending':True,'run_id':run_id,'output_version_id':output_id}
