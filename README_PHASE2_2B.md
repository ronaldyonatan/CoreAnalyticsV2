# CoreAnalyticsV2 Phase 2.2B — PostgreSQL Direct Datasets

## Installation (native Mac, no Docker)

1. Back up the two existing files before extraction.
2. From `~/CoreAnalyticsV2`, extract the patch ZIP with `unzip -o <ZIP> -d ~/CoreAnalyticsV2`.
3. Activate the existing Python virtualenv and verify `python -c 'import psycopg; print(psycopg.__version__)'`.
4. Restart the native Flask backend and refresh the React app.
5. In Datasets, select PostgreSQL connection, browse tables/views, create a **Direct access** dataset, test preview and filters. Verify an existing SQL Server dataset too.

## Scope

- Updates `app/connectors/postgresql_adapter.py` and `app/routes/studio_datasets_api.py` only.
- SQL Server adapter, SQL Server connector and ETL pipelines are unchanged.
- PostgreSQL supports browse, object validation, preview, pagination, sort, and filter values.
- Source queries run in a PostgreSQL read-only session with a bounded statement timeout; no arbitrary user SQL.
- Preview limited to 30 supported scalar columns, 50 rows/page, 256 characters/value. Object catalog and column metadata are validated before selecting data.
- SQL host policy remains active, including `STUDIO_SQL_ALLOWED_PORTS` and private network rules.
- TLS behavior is unchanged: `encrypt_transport=true` requires a trusted `verify-full` certificate; `false` disables TLS. Do not disable TLS on untrusted networks.
- Store-in-CoreAnalytics / Parquet ETL is **not** added by this patch.

## Notes

- PostgreSQL read-only permission must cover schema usage and table/view SELECT.
- `stable_order=false` is intentionally conservative: PostgreSQL preview pagination may shift if underlying rows change or ties exist.
- This patch passed Python syntax compilation. Live database/UI integration testing is required on your native runtime.
