"""Offline copy: mount old volume read-only at /source and an EMPTY host directory at /destination.
Never deletes source/destination files. Run with the Spark writers stopped.
"""
import hashlib
import json
import os
import shutil
import stat
from pathlib import Path


def inventory(root):
    files, directories = {}, []
    for path in sorted(root.rglob('*')):
        mode = path.lstat().st_mode
        relative = path.relative_to(root).as_posix()
        if stat.S_ISDIR(mode):
            directories.append(relative)
        elif stat.S_ISREG(mode):
            digest = hashlib.sha256()
            with path.open('rb') as file:
                for chunk in iter(lambda: file.read(1024*1024), b''):
                    digest.update(chunk)
            files[relative] = {'bytes': path.stat().st_size, 'sha256': digest.hexdigest()}
        else:
            raise RuntimeError('Storage contains a symlink or unsupported entry: ' + relative)
    return {'directories': directories, 'files': files}


def migrate(source, destination, uid=185, gid=185):
    source, destination = Path(source), Path(destination)
    if source.is_symlink() or destination.is_symlink() or not source.is_dir() or not destination.is_dir():
        raise RuntimeError('Both mount points must be existing directories, without symlinks.')
    if source.resolve() == destination.resolve() or source.resolve().is_relative_to(destination.resolve()) or destination.resolve().is_relative_to(source.resolve()):
        raise RuntimeError('Source and destination must be separate directories.')
    if any(destination.iterdir()):
        raise RuntimeError('Destination must be empty; existing data will not be overwritten.')
    before = inventory(source)
    # Bind mounts can hide physical ancestry from Path.resolve(). Compare directory inodes too.
    if source.samefile(destination) or any((source / relative).samefile(destination) for relative in before['directories']):
        raise RuntimeError('Destination overlaps the source through another mount.')
    if not before['files']:
        raise RuntimeError('Source has no files; migration stopped to avoid switching to empty storage.')
    for relative in before['directories']:
        (destination / relative).mkdir(mode=0o700)
    for relative in before['files']:
        original, target = source / relative, destination / relative
        with original.open('rb') as incoming, target.open('xb') as outgoing:
            shutil.copyfileobj(incoming, outgoing, 1024*1024)
            outgoing.flush(); os.fsync(outgoing.fileno())
        shutil.copystat(original, target)
        os.chown(target, uid, gid)
    for relative in reversed(before['directories']):
        target = destination / relative
        shutil.copystat(source / relative, target)
        os.chown(target, uid, gid)
    os.chown(destination, uid, gid)
    destination.chmod(0o700)
    after = inventory(destination)
    if before != after or before != inventory(source):
        raise RuntimeError('Verification failed or source changed. Keep the old volume and inspect the copy; nothing was deleted.')
    return {'verified': True, 'file_count': len(before['files']),
            'directory_count': len(before['directories']),
            'bytes': sum(item['bytes'] for item in before['files'].values()), 'inventory': before}


if __name__ == '__main__':
    print(json.dumps(migrate('/source', '/destination'), sort_keys=True))
