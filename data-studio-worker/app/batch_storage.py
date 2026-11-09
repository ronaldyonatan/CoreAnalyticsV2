"""Immutable, atomic publication of complete Parquet outputs under an administrator root."""
import json
import os
import shutil
import uuid
from pathlib import Path
from app.batch_graph import BatchError


def uuid_id(value):
    try:
        if not isinstance(value,str) or str(uuid.UUID(value)) != value:raise ValueError()
    except ValueError:raise BatchError('INVALID_RUN_ID') from None
    return value


def storage_root():
    value=os.environ.get('STUDIO_BATCH_STORAGE_ROOT')
    if not value or not Path(value).is_absolute():raise BatchError('STORAGE_NOT_CONFIGURED')
    root=Path(value).resolve();root.mkdir(parents=True,exist_ok=True,mode=0o700)
    return root


def contained(root,value):
    path=Path(value).resolve()
    if not path.is_relative_to(root.resolve()) or path==root.resolve():raise BatchError('STORAGE_PATH_INVALID')
    return path


def publish_outputs(root,run_id,outputs,progress=None):
    """The manifest becomes visible only after every output has been committed."""
    uuid_id(run_id);root=Path(root).resolve();root.mkdir(parents=True,exist_ok=True,mode=0o700)
    final=contained(root,root/run_id)
    if final.exists():raise BatchError('OUTPUT_ALREADY_EXISTS','Run ID sudah memiliki hasil; jalankan sebagai job baru untuk membuat versi baru.')
    staging=contained(root,root/('.staging-'+run_id+'-'+uuid.uuid4().hex))
    staging.mkdir(mode=0o700)
    manifest={'version':1,'run_id':run_id,'outputs':[]}
    try:
        for index,item in enumerate(outputs):
            if progress:progress(item['id'],'WRITING')
            relative='output-'+str(index);path=staging/relative;frame=item['frame']
            frame.write.mode('errorifexists').option('compression','snappy').parquet(str(path))
            # Count the persisted artifact, not a separately re-executed source query.
            persisted=frame.sparkSession.read.parquet(str(path))
            manifest['outputs'].append({'id':item['id'],'name':item['name'],'path':relative,'row_count':persisted.count(),'schema':persisted.schema.jsonValue()})
        with (staging/'manifest.json').open('x',encoding='utf-8') as file:
            json.dump(manifest,file,ensure_ascii=False,allow_nan=False);file.flush();os.fsync(file.fileno())
        # Same filesystem, unique immutable run ID; never overwrite an existing version.
        # An exclusive reservation prevents concurrent writers from replacing a completed directory.
        reservation=root/('.publish-'+run_id)
        try:fd=os.open(reservation,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        except FileExistsError:raise BatchError('OUTPUT_ALREADY_EXISTS') from None
        try:
            os.close(fd)
            if final.exists():raise BatchError('OUTPUT_ALREADY_EXISTS')
            staging.rename(final)
        finally:reservation.unlink(missing_ok=True)
        return manifest
    finally:
        if staging.exists():shutil.rmtree(staging)
