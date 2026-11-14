#!/usr/bin/env python3
"""Create a private local DEV worker config without displaying credentials."""
import getpass
import os
from pathlib import Path
import shlex
import sys


def value(prompt):
    answer = input(prompt).strip()
    if not answer or '\n' in answer or '\r' in answer:
        raise ValueError('Nilai wajib diisi dalam satu baris.')
    return answer


def odbc_value(text):
    return '{' + text.replace('}', '}}') + '}'


def main():
    config = Path.home() / '.config' / 'coreanalyticsv2' / 'stored-worker.env'
    if config.exists() or config.is_symlink():
        print('Konfigurasi sudah ada; tidak ditimpa:', config)
        return 1
    print('Koneksi SQL ini untuk metadata CoreAnalytics, bukan SQL sumber dataset.')
    server = value('SQL Server metadata (host atau host,port): ')
    user = value('Login SQL untuk worker: ')
    password = getpass.getpass('Password SQL (tidak ditampilkan): ')
    if not password or '\n' in password or '\r' in password:
        raise ValueError('Password wajib diisi dalam satu baris.')
    trust = input('DEV: percayai sertifikat SQL Server tanpa validasi? [y/N]: ').strip().lower() == 'y'
    private = input('Izinkan sumber data di jaringan private tepercaya? [y/N]: ').strip().lower() == 'y'
    dsn = ';'.join((
        'DRIVER={ODBC Driver 18 for SQL Server}',
        'SERVER=' + odbc_value(server),
        'DATABASE={CoreAnalytics}',
        'UID=' + odbc_value(user),
        'PWD=' + odbc_value(password),
        'Encrypt=yes',
        'TrustServerCertificate=' + ('yes' if trust else 'no'),
    )) + ';'
    lines = ['# Private DEV configuration. Do not share or commit.\n',
             'export STUDIO_INGEST_SQL_CONNECTION_STRING=' + shlex.quote(dsn) + '\n']
    if private:
        lines.append('export STUDIO_SQL_ALLOW_PRIVATE=true\n')
    config.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    fd = os.open(config, flags, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        handle.writelines(lines)
    print('Konfigurasi tersimpan secara lokal:', config)
    print('Jalankan: bash scripts/stored_dataset_worker.sh check')
    print('Pemeriksaan tersebut belum menguji koneksi ke SQL Server.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, EOFError, KeyboardInterrupt) as exc:
        print('\nKonfigurasi tidak disimpan:', type(exc).__name__, file=sys.stderr)
        sys.exit(1)
