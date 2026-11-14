#!/usr/bin/env python3
"""Prepare private DEV worker env and one-time SQL provisioning file locally."""
from pathlib import Path
import os
import secrets
import sys


def exclusive_write(path, content):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as file:
        file.write(content)


def main():
    directory = Path.home() / '.config' / 'coreanalyticsv2'
    env = directory / 'worker-beam.env'
    sql = directory / 'worker-beam-provision-PRIVATE.sql'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if any(p.exists() or p.is_symlink() for p in (env, sql)):
        raise FileExistsError('One or both private files already exist; refusing to replace them')
    key = secrets.token_hex(32).upper()
    env_body = ("# Private worker signing key; do not share or commit.\n"
                "export STUDIO_WORKER_TRANSPORT=beam\n"
                f"export STUDIO_WORKER_BEAM_HMAC_KEY_HEX='{key}'\n")
    sql_body = ("/* PRIVATE: contains signing key. Do not share, commit, or send its contents. */\n"
                "USE [CoreAnalytics];\nSET NOCOUNT ON;\nSET XACT_ABORT ON;\n"
                "IF OBJECT_ID(N'studio.worker_beam_key',N'U') IS NULL THROW 53320,'WORKER_GATEWAY_NOT_INSTALLED',1;\n"
                "IF EXISTS(SELECT 1 FROM studio.worker_beam_key) THROW 53321,'WORKER_KEY_ALREADY_PRESENT',1;\n"
                f"INSERT studio.worker_beam_key(key_id,key_bytes,enabled) VALUES(1,0x{key},1);\n"
                "SELECT 'WORKER_KEY_PROVISIONED_DEV' AS status;\n")
    created_env = False
    try:
        exclusive_write(env, env_body)
        created_env = True
        exclusive_write(sql, sql_body)
    except Exception:
        if created_env:
            env.unlink(missing_ok=True)
        raise
    print('Private worker configuration created:', env)
    print('Private SQL provisioning file created:', sql)
    print('Do not share either file or its contents. No job has been started.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except OSError as exc:
        print('Cannot prepare key files:', type(exc).__name__, file=sys.stderr)
        sys.exit(1)
