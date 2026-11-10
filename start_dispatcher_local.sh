A#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

export STUDIO_SQLSERVER_JDBC_JAR="$ROOT/data-studio-worker/drivers/mssql-jdbc-12.4.1.jre11.jar"
export STUDIO_BATCH_DRIVER_MODE=local
export STUDIO_BATCH_LOCAL_PYTHON="$ROOT/data-studio-worker/.venv/bin/python"
export STUDIO_BATCH_LOCAL_SCRIPT="$ROOT/data-studio-worker/run_batch.py"
export STUDIO_SPARK_MASTER='local[2]'
export STUDIO_BATCH_STORAGE_ROOT="$HOME/CoreAnalyticsData/parquet"
export SPARK_LOCAL_IP=127.0.0.1

# Khusus development lokal
export STUDIO_ALLOW_UNTRUSTED_CERT=true
# Trusted local development only; never enable private access on shared SaaS workers.
export STUDIO_SQL_HOST_POLICY=dynamic
export STUDIO_SQL_ALLOW_PRIVATE=true
# No per-host CIDR allowlist in local self-service mode.
unset STUDIO_SQL_ALLOWED_NETWORKS

mkdir -p "$STUDIO_BATCH_STORAGE_ROOT"

cd "$ROOT/voice-auth-backend"

exec "$ROOT/.venv/bin/python" \
  -u -m app.services.studio_dispatcher
