#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

export STUDIO_BATCH_DRIVER_MODE=local
export STUDIO_BATCH_LOCAL_PYTHON="$ROOT/data-studio-worker/.venv/bin/python"
export STUDIO_BATCH_LOCAL_SCRIPT="$ROOT/data-studio-worker/run_batch.py"
export STUDIO_SPARK_MASTER='local[2]'
export STUDIO_BATCH_STORAGE_ROOT="$HOME/CoreAnalyticsData/parquet"
export SPARK_LOCAL_IP=127.0.0.1

# Khusus development lokal
export STUDIO_ALLOW_UNTRUSTED_CERT=true

mkdir -p "$STUDIO_BATCH_STORAGE_ROOT"

cd "$ROOT/voice-auth-backend"

exec "$ROOT/.venv/bin/python" \
  -u -m app.services.studio_dispatcher
