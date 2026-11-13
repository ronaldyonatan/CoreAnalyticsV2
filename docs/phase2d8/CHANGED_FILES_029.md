# Changes in shared-access batch 029

Existing staged changes and earlier batches were preserved. No database scripts were executed by the assistant.

Application:

- `voice-auth-backend/app/services/studio_object_access.py`: shared edit/execute policy, new grants use EDITOR, owner-only delete/share retained.
- `voice-auth-backend/app/routes/studio_datasets_api.py`: Dataset-scoped source credential reference, Connection edit check for creation, removal of temporary metadata debug print.
- `voice-auth-backend/app/routes/studio_charts_api.py`: Dataset-scoped query/column source resolution.
- `voice-auth-backend/app/services/studio_dispatcher.py`: binds only authorized Dataset references to source connections.
- `voice-auth-backend/app/services/studio_ingest_worker.py`: scoped source reference for stored ingestion.
- `voice-dashboard/src/dataStudio/OwnershipPicker.tsx`: same popup/layout/themes; one Shared policy and EDITOR default.

SQL and artifacts:

- `scripts/phase2d8/build_dataplane_candidate.py`: exact checked transformations of actual DEV exports; repeatable script generation, no SQL/network calls.
- `data-studio-backend/phase2d8/*.sql`: 10 procedure replacements and 4 helper functions for review.
- `data-studio-backend/migrations/029_SHARED_EDIT_DATAPLANE_DEV.sql`: guarded transaction, backups, SQL filtering/enforcement and one XML result.
- `data-studio-backend/migrations/029B_ROLLBACK_SHARED_EDIT_DATAPLANE.sql`: guarded manual rollback.
- `artifacts/CoreAnalyticsV2-Phase2D8-SHARED-ACCESS-INSTALL-AND-VERIFY.sql`: single-file copy of migration 029 for the user.

Tests/documentation:

- `voice-auth-backend/tests/test_phase2d8_authorization.py`: updated shared policy and new legacy-grant, role-normalization and scoped-credential boundary tests.
- `voice-auth-backend/tests/test_phase2d8_sql_candidate.py`: SQL deployment security/preservation contracts, including Windows line endings and legacy gateway preservation.
- `voice-auth-backend/tests/test_studio_datasets.py`: explicit authorized fixture for the existing direct-creation contract test.
- `docs/phase2d8/SHARED_ACCESS_029_DEV.md`: policy, installation, restarts, manual trials, boundaries and rollback.
- `docs/phase2d8/backend-test-results-029.txt`: full backend test output.
- `docs/phase2d8/DEV_HANDOFF.md`, `ENFORCEMENT_MATRIX.md`: historical reports now point to current 029 documentation.
