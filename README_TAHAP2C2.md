# Tahap 2C.2 — Metadata API preparation ONLY

This patch does NOT execute Spark or write Parquet. It provides a database queue, status listing and authenticated API skeleton. DO NOT submit jobs until a worker is installed: jobs will remain QUEUED.

1. Back up database and project files. Apply migration `017_dataset_ingest_control.sql` to CoreAnalytics development SQL Server.
2. Add the IF block from `017_spDashboard_hook_INSTRUCTIONS.sql` into the actual `dbo.spDashboard` after `SET NOCOUNT ON;` (this snippet is not standalone executable SQL).
3. Register `studio_ingest_bp` in `voice-auth-backend/server.py` using the same pattern as `studio_datasets_bp` (do not register twice).
4. Check `python3 -m py_compile voice-auth-backend/app/services/studio_dataset_ingest.py voice-auth-backend/app/routes/studio_ingest_api.py` and `git diff --check`.
5. API: POST `/api/studio/ingest/submit` body `{ "dataset_id":"<uuid>", "request_id":"<new uuid>" }`; GET `/api/studio/ingest/jobs`; GET `/api/studio/ingest/jobs/<uuid>`.

Important: submission is currently restricted to owner-created DIRECT datasets; this is a safe staging contract, not the final STORED workflow. No automatic run is started. Next patch: lease/claim/heartbeat/complete + local Spark worker + Parquet publish + STORED UI.
