#!/bin/bash
# DEV-only fixed-query probe and SQL script preview for the "bi" connection.
# SQL preview uses the Connection's actual privileges and can modify data.
# This script does not modify .env or start/stop any other process.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export STUDIO_QUERY_DEV_PROBE_ENABLED=true
export STUDIO_QUERY_DEV_CONNECTION_ID=4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3
export STUDIO_SQL_SCRIPT_PREVIEW_DEV_ENABLED=true
export STUDIO_SQL_SCRIPT_PREVIEW_DEV_CONNECTION_ID="$STUDIO_QUERY_DEV_CONNECTION_ID"
export STUDIO_SQL_SCRIPT_DATASET_DEV_ENABLED=true
export STUDIO_DATASET_QUERY_METADATA_ENABLED=true
exec bash "$script_dir/../voice-auth-backend/start_coreanalytics_dev_fixed.sh"
