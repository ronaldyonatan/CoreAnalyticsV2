#!/usr/bin/env python3
"""Prepare separate private key rotation files; never print key contents."""
import os
from pathlib import Path
import secrets
import sys


def write_new(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as file:
        file.write(content)


def main():
    directory = Path.home() / '.config/coreanalyticsv2'
    env = directory / 'worker-beam-next.env'
    sql = directory / 'worker-beam-rotate-PRIVATE.sql'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if any(p.exists() or p.is_symlink() for p in (env, sql)):
        raise FileExistsError('Rotation file exists; refusing to replace it')
    key = secrets.token_hex(32).upper()
    env_text = ('# Private signing key; do not share or commit.\n'
                'export STUDIO_WORKER_TRANSPORT=beam\n'
                f"export STUDIO_WORKER_BEAM_HMAC_KEY_HEX='{key}'\n")
    sql_text = ('/* PRIVATE: contains signing key. Do not share or commit. */\n'
                'USE [CoreAnalytics];\nSET NOCOUNT ON;\nSET XACT_ABORT ON;\n'
                'BEGIN TRY\n BEGIN TRAN;\n'
                f' UPDATE studio.worker_beam_key SET key_bytes=0x{key},enabled=1 WHERE key_id=1 AND enabled=1;\n'
                " IF @@ROWCOUNT<>1 THROW 53331,'WORKER_KEY_ROTATION_PRECONDITION_FAILED',1;\n"
                " COMMIT; SELECT 'WORKER_KEY_ROTATED_DEV' AS status;\n"
                'END TRY\nBEGIN CATCH\n IF XACT_STATE()<>0 ROLLBACK;\n THROW;\nEND CATCH;\n')
    created = False
    try:
        write_new(env, env_text)
        created = True
        write_new(sql, sql_text)
    except Exception:
        if created:
            env.unlink(missing_ok=True)
        raise
    print('Private next-key configuration:', env)
    print('Private rotation SQL:', sql)
    print('Do not share either file or its contents.')


if __name__ == '__main__':
    try:
        main()
    except OSError as exc:
        print('Cannot prepare rotation:', type(exc).__name__, file=sys.stderr)
        sys.exit(1)
