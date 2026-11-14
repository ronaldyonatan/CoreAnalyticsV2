#!/usr/bin/env bash
# Safe launcher: inherits the existing owner-only STORED worker environment, if present.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-check}"
[[ "$MODE" == check || "$MODE" == once || "$MODE" == serve ]] || { echo 'Usage: studio_scheduler.sh {check|once|serve}' >&2; exit 2; }
CONFIG="${STUDIO_WORKER_CONFIG_FILE:-$HOME/.config/coreanalyticsv2/stored-worker.env}"
if [[ -e "$CONFIG" || -L "$CONFIG" ]]; then
 python3 - "$CONFIG" <<'PY'
import os, stat, sys
s=os.lstat(sys.argv[1]);
if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode & 0o077:
    raise SystemExit('ERROR: worker env file must be an owner-only regular file, chmod 600')
PY
 # shellcheck disable=SC1090
 source "$CONFIG"
fi
PYTHON="${STUDIO_INGEST_BACKEND_PYTHON:-$ROOT/voice-auth-backend/.venv/bin/python}"
[[ -x "$PYTHON" ]] || PYTHON="$(command -v python3)"
if [[ "${STUDIO_WORKER_TRANSPORT:-sql}" == beam ]]; then
 if [[ -z "${STUDIO_WORKER_BEAM_HMAC_KEY_HEX:-}" ]]; then
  echo 'ERROR: worker BEAM signing key not set.' >&2
  exit 1
 fi
elif [[ -z "${STUDIO_SCHEDULER_SQL_CONNECTION_STRING:-}${STUDIO_INGEST_SQL_CONNECTION_STRING:-}" ]]; then
 echo 'ERROR: scheduler SQL DSN not set. Configure it in stored-worker.env (mode 600).' >&2
 exit 1
fi
if [[ "$MODE" == check ]]; then
 echo "Scheduler configuration: OK (${STUDIO_WORKER_TRANSPORT:-sql} transport configured; no credentials printed)"
 echo 'Existing STORED and ETL workers must run separately to execute queued jobs.'
 exit 0
fi
cd "$ROOT/voice-auth-backend"
exec "$PYTHON" -m app.services.studio_scheduler_worker "$MODE"
