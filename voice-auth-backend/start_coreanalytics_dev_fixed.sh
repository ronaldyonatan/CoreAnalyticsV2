#!/bin/bash
# CoreAnalyticsV2 - local macOS development only.
# This file is not used inside Docker containers.
set -Eeuo pipefail

trap 'status=$?; printf "[CoreAnalytics] ERROR pada baris %s (exit %s).\n" "$LINENO" "$status" >&2' ERR

log() { printf '[CoreAnalytics] %s\n' "$*"; }
fail() { printf '[CoreAnalytics] ERROR: %s\n' "$*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
log "Working directory: $SCRIPT_DIR"
[[ -f server.py ]] || fail "server.py tidak ditemukan di folder ini."

command -v brew >/dev/null 2>&1 || fail "Homebrew (brew) tidak ditemukan di PATH."
if ! OPENSSL_PREFIX="$(brew --prefix openssl@3 2>/dev/null)"; then
  fail "OpenSSL 3 belum tersedia. Jalankan: brew install openssl@3"
fi
[[ -d "$OPENSSL_PREFIX/lib" ]] || fail "Folder OpenSSL 3 tidak ditemukan: $OPENSSL_PREFIX/lib"
export DYLD_LIBRARY_PATH="$OPENSSL_PREFIX/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
log "OpenSSL 3: $OPENSSL_PREFIX"

export CORE_ALLOWED_BROWSER_ORIGINS="${CORE_ALLOWED_BROWSER_ORIGINS:-http://localhost:5173}"
# Hanya untuk development / SQL Server internal yang diverifikasi.
export STUDIO_ALLOW_UNTRUSTED_CERT="${STUDIO_ALLOW_UNTRUSTED_CERT:-true}"

# Baca hanya variabel Data Studio yang diperlukan. Jangan source .env
# sebagai shell karena file .env bukan script yang aman dieksekusi.
if [[ -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      STUDIO_FERNET_KEY=*)
        if [[ -z "${STUDIO_FERNET_KEY:-}" ]]; then STUDIO_FERNET_KEY="${line#STUDIO_FERNET_KEY=}"; fi ;;
      STUDIO_DEV_SQL_HOST_POLICY=*)
        if [[ -z "${STUDIO_DEV_SQL_HOST_POLICY:-}" ]]; then STUDIO_DEV_SQL_HOST_POLICY="${line#STUDIO_DEV_SQL_HOST_POLICY=}"; fi ;;
      STUDIO_DEV_SQL_ALLOWED_NETWORKS=*)
        if [[ -z "${STUDIO_DEV_SQL_ALLOWED_NETWORKS:-}" ]]; then STUDIO_DEV_SQL_ALLOWED_NETWORKS="${line#STUDIO_DEV_SQL_ALLOWED_NETWORKS=}"; fi ;;
      STUDIO_DEV_SQL_ALLOWED_PORTS=*)
        if [[ -z "${STUDIO_DEV_SQL_ALLOWED_PORTS:-}" ]]; then STUDIO_DEV_SQL_ALLOWED_PORTS="${line#STUDIO_DEV_SQL_ALLOWED_PORTS=}"; fi ;;
      STUDIO_SQL_HOST_POLICY=*)
        if [[ -z "${STUDIO_SQL_HOST_POLICY:-}" ]]; then STUDIO_SQL_HOST_POLICY="${line#STUDIO_SQL_HOST_POLICY=}"; fi ;;
      STUDIO_SQL_ALLOWED_NETWORKS=*)
        if [[ -z "${STUDIO_SQL_ALLOWED_NETWORKS:-}" ]]; then STUDIO_SQL_ALLOWED_NETWORKS="${line#STUDIO_SQL_ALLOWED_NETWORKS=}"; fi ;;
      STUDIO_SQL_ALLOWED_PORTS=*)
        if [[ -z "${STUDIO_SQL_ALLOWED_PORTS:-}" ]]; then STUDIO_SQL_ALLOWED_PORTS="${line#STUDIO_SQL_ALLOWED_PORTS=}"; fi ;;
      STUDIO_ALLOWED_SQL_HOSTS=*)
        if [[ -z "${STUDIO_ALLOWED_SQL_HOSTS:-}" ]]; then STUDIO_ALLOWED_SQL_HOSTS="${line#STUDIO_ALLOWED_SQL_HOSTS=}"; fi ;;
    esac
  done < .env
fi
export STUDIO_FERNET_KEY
export STUDIO_SQL_ALLOWED_NETWORKS="${STUDIO_SQL_ALLOWED_NETWORKS:-${STUDIO_DEV_SQL_ALLOWED_NETWORKS:-}}"
export STUDIO_SQL_ALLOWED_PORTS="${STUDIO_SQL_ALLOWED_PORTS:-${STUDIO_DEV_SQL_ALLOWED_PORTS:-1433}}"
export STUDIO_SQL_HOST_POLICY="${STUDIO_SQL_HOST_POLICY:-${STUDIO_DEV_SQL_HOST_POLICY:-allowlist}}"
if [[ -n "${STUDIO_ALLOWED_SQL_HOSTS:-}" ]]; then export STUDIO_ALLOWED_SQL_HOSTS; fi
log "SQL host policy: $STUDIO_SQL_HOST_POLICY"
[[ -n "${STUDIO_FERNET_KEY:-}" ]] || fail "STUDIO_FERNET_KEY belum ada di environment atau .env. Jangan buat key baru jika sudah ada koneksi tersimpan."

if [[ -x ../.venv/bin/python ]]; then
  PYTHON_BIN="../.venv/bin/python"
elif [[ -x .venv/bin/python ]]; then
  PYTHON_BIN=".venv/bin/python"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python)"
else
  fail "Python tidak ditemukan. Aktifkan virtual environment dahulu."
fi
log "Python: $PYTHON_BIN"

"$PYTHON_BIN" - <<'PY'
import os
from cryptography.fernet import Fernet
import pyodbc

Fernet(os.environ['STUDIO_FERNET_KEY'].encode('utf-8'))
drivers = pyodbc.drivers()
if 'ODBC Driver 18 for SQL Server' not in drivers:
    raise SystemExit('[CoreAnalytics] ERROR: ODBC Driver 18 for SQL Server tidak terdeteksi: ' + str(drivers))
print('[CoreAnalytics] Fernet key valid; ODBC Driver 18 terdeteksi.', flush=True)
PY

log "Memulai Flask di http://127.0.0.1:5001 (Ctrl+C untuk berhenti)..."
exec "$PYTHON_BIN" -u server.py
