#!/usr/bin/env bash
# Sends requests for random nonexistent run IDs; does not claim or tick.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${STUDIO_WORKER_CONFIG_FILE:-$HOME/.config/coreanalyticsv2/worker-beam.env}"
python3 - "$CONFIG" <<'PY'
import os, stat, sys
s = os.lstat(sys.argv[1])
if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_mode & 0o077:
    raise SystemExit('ERROR: worker config must be an owner-only regular file (mode 600)')
PY
# shellcheck disable=SC1090
source "$CONFIG"
cd "$ROOT/voice-auth-backend"
exec "$ROOT/.venv/bin/python" -m app.services.studio_worker_beam_nondestructive_probe
