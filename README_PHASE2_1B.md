# CoreAnalyticsV2 — Phase 2.1B (SQL Server registry routing)

This is an incremental, SQL Server-only compatibility patch, based on the Phase 2 source ZIP and Phase 2.1A patch.

Changes:
- Extend the allowlisted ConnectorSpec with optional connection/dataset operations.
- Register existing SQL Server test, browse, preview, filter and object-check functions through the SQL Server adapter.
- Route Connections create/test and Dataset discovery/preview through registry-backed compatibility shims.
- Keep legacy SQL Server metadata shape unchanged; optional connector_type='sqlserver' on create/test is accepted and stripped before metadata RPC.
- Add authenticated GET /api/studio/connections/connector-capabilities.

No PostgreSQL/MySQL connector, frontend change, schema migration or write operation is enabled.

## Apply

Commit your current changes first. From the repository root:

    unzip -o ~/Downloads/CoreAnalyticsV2-Phase2.1B-Connections-Datasets-Patch.zip

## Test

    python -m unittest discover -s voice-auth-backend/tests -p 'test_studio_connector_registry.py' -v
    python -m unittest discover -s voice-auth-backend/tests -p 'test_studio_sql_policy.py' -v
    python -m unittest discover -s voice-auth-backend/tests -p 'test_studio_datasets.py' -v
    python -m unittest discover -s voice-auth-backend/tests -p 'test_studio_batch_bindings.py' -v

Run Test Connection, dataset browse, preview and the Appointment Baru SQL Server → Parquet pipeline manually. Do not deploy until tests pass.

## Rollback

Use git diff to review; restore these four files from the checkpoint commit if needed.
