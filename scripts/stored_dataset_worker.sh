#!/usr/bin/env bash
# Local Data Studio ingestion entrypoint for SQL Server + PostgreSQL.
# No repo .env is read, and no database secrets are printed.
set -euo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="${1:-check}"
case "$ACTION" in check|once|serve|spark-check) ;; *)
  echo "Usage: $0 {check|once|serve|spark-check}" >&2
  exit 2 ;;
esac

# Optional operator-owned, mode-0600 local config OUTSIDE the repository.
CONFIG_FILE="${STUDIO_WORKER_CONFIG_FILE:-$HOME/.config/coreanalyticsv2/stored-worker.env}"
if [[ -e "$CONFIG_FILE" || -L "$CONFIG_FILE" ]]; then
  python3 - "$CONFIG_FILE" <<'PY'
from pathlib import Path
import os, stat, sys
p = Path(sys.argv[1])
st = p.lstat()
if not stat.S_ISREG(st.st_mode) or (st.st_mode & 0o077) or st.st_uid != os.getuid():
    raise SystemExit('ERROR: stored-worker.env must be a regular owner-only file (chmod 600), not a symlink')
PY
  # This is a trusted operator-managed shell configuration, not an arbitrary uploaded .env.
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

export STUDIO_BATCH_DRIVER_MODE="${STUDIO_BATCH_DRIVER_MODE:-local}"
[[ "$STUDIO_BATCH_DRIVER_MODE" == local ]] || fail 'STORED worker requires STUDIO_BATCH_DRIVER_MODE=local'
export STUDIO_BATCH_STORAGE_ROOT="${STUDIO_BATCH_STORAGE_ROOT:-$HOME/CoreAnalyticsData/parquet}"
export STUDIO_BATCH_LOCAL_PYTHON="${STUDIO_BATCH_LOCAL_PYTHON:-$ROOT/data-studio-worker/.venv/bin/python}"
export STUDIO_BATCH_LOCAL_SCRIPT="${STUDIO_BATCH_LOCAL_SCRIPT:-$ROOT/data-studio-worker/run_batch.py}"
if [[ "${STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED:-false}" == true ]]; then
  # Explicit local DEV opt-in. Scripts use the saved Connection privileges.
  export STUDIO_DATASET_QUERY_METADATA_ENABLED=true
  export STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID="${STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID:-4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3}"
fi
BACKEND_PYTHON="${STUDIO_INGEST_BACKEND_PYTHON:-}"
if [[ -z "$BACKEND_PYTHON" ]]; then
  if [[ -x "$ROOT/voice-auth-backend/.venv/bin/python" ]]; then
    BACKEND_PYTHON="$ROOT/voice-auth-backend/.venv/bin/python"
  elif [[ -x "$ROOT/.venv/bin/python" ]]; then
    BACKEND_PYTHON="$ROOT/.venv/bin/python"
  else
    BACKEND_PYTHON="$(command -v python3)"
  fi
fi
export STUDIO_SPARK_MASTER="${STUDIO_SPARK_MASTER:-local[2]}"
export STUDIO_POSTGRESQL_ALLOWED_PORTS="${STUDIO_POSTGRESQL_ALLOWED_PORTS:-5432}"

DRIVERS="$ROOT/data-studio-worker/drivers"
find_jar() {
  local pattern="$1" file
  for file in "$DRIVERS"/$pattern; do
    [[ -f "$file" ]] && { printf '%s\n' "$file"; return 0; }
  done
  return 1
}
if [[ -z "${STUDIO_SQLSERVER_JDBC_JAR:-}" ]]; then
  export STUDIO_SQLSERVER_JDBC_JAR="$(find_jar 'mssql-jdbc-12.4.1.jre11.jar' || find_jar 'mssql-jdbc-*.jar' || true)"
fi
if [[ -z "${STUDIO_POSTGRESQL_JDBC_JAR:-}" ]]; then
  export STUDIO_POSTGRESQL_JDBC_JAR="$(find_jar 'postgresql-42.7.14.jar' || find_jar 'postgresql-*.jar' || true)"
fi

# ODBC Driver 18 on some Apple Silicon installations requires Homebrew OpenSSL 3.
# Only affects this process, does not alter global settings.
if [[ "$(uname -s)" == Darwin ]] && command -v brew >/dev/null 2>&1; then
  ssl_prefix="$(brew --prefix openssl@3 2>/dev/null || true)"
  if [[ -n "$ssl_prefix" && -d "$ssl_prefix/lib" ]]; then
    case ":${DYLD_LIBRARY_PATH:-}:" in
      *":$ssl_prefix/lib:"*) ;;
      *) export DYLD_LIBRARY_PATH="$ssl_prefix/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}" ;;
    esac
  fi
fi
if [[ -z "${JAVA_HOME:-}" && "$(uname -s)" == Darwin && -x /usr/libexec/java_home ]]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  [[ -z "$JAVA_HOME" ]] || export JAVA_HOME
fi

[[ -f "$ROOT/voice-auth-backend/app/services/studio_dispatcher.py" ]] || fail 'Not a CoreAnalyticsV2 project root'
[[ -d "$ROOT/data-studio-worker" ]] || fail 'Data Studio Worker directory missing'
[[ -x "$STUDIO_BATCH_LOCAL_PYTHON" ]] || fail 'data-studio-worker/.venv/bin/python not found/executable'
[[ -x "$BACKEND_PYTHON" ]] || fail 'Backend python interpreter not found/executable'
[[ -f "$STUDIO_BATCH_LOCAL_SCRIPT" ]] || fail 'run_batch.py not found'

# The preflight validates driver environment, paths, JAR content and avoids printing credentials.
# Spark-check deliberately does not need the ingest catalog DSN.
if [[ "$ACTION" == spark-check ]]; then
  python3 "$ROOT/scripts/stored_dataset_preflight.py" --no-dsn
  "$STUDIO_BATCH_LOCAL_PYTHON" "$ROOT/scripts/stored_dataset_spark_check.py"
  exit 0
fi
if [[ "${STUDIO_WORKER_TRANSPORT:-sql}" == beam ]]; then
  python3 "$ROOT/scripts/stored_dataset_preflight.py" --no-dsn
  [[ -n "${STUDIO_WORKER_BEAM_HMAC_KEY_HEX:-}" ]] || fail 'STUDIO_WORKER_BEAM_HMAC_KEY_HEX is missing'
else
  python3 "$ROOT/scripts/stored_dataset_preflight.py"
fi
[[ "$ACTION" == check ]] && exit 0

cd "$ROOT/voice-auth-backend"
case "$ACTION" in
  once) exec "$BACKEND_PYTHON" -m app.services.studio_ingest_worker --once ;;
  serve) exec "$BACKEND_PYTHON" -m app.services.studio_ingest_worker ;;
esac
