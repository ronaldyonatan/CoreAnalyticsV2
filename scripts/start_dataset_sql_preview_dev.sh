#!/bin/bash
# Backward-compatible alias for the combined DEV query launcher.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$script_dir/start_dataset_query_probe_dev.sh"
