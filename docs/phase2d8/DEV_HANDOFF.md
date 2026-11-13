> Historical first-batch report. Current shared-access policy and candidate 029 are documented in [SHARED_ACCESS_029_DEV.md](SHARED_ACCESS_029_DEV.md).

# Phase 2D.8 DEV candidate — partial implementation

This change adds backend enforcement and an owner-only sharing SQL correction. **The comprehensive Phase 2D.8 goal is not complete.** Do not enable production-wide sharing from this candidate. Nothing was executed against a live database; no service was restarted and no environment secrets were modified.

## Implemented policy

Actor identity comes from the authenticated Flask session and the existing Data Studio menu check. Browser actor fields are never used for authorization. Fresh signed BEAM ownership CHECK calls guard object operations; there is no new direct Flask SQL connection or authorization cache.

| Role | Read/preview | Edit/execute | Delete | Grant/revoke |
|---|---|---|---|---|
| Viewer | Yes | No | No | No |
| Editor | Yes | Yes | No | No |
| Primary owner | Yes | Yes | Yes | Yes |
| Configured governance admin | Yes | Only for own object | Only for own object | Only for own object |
| Unrelated/missing actor/unregistered object | No | No | No | No |

SQL 026 currently returns ADMIN ahead of OWNER. The backend resolves primary ownership explicitly for admin mutations; migration 028 also prioritizes OWNER. Admin membership is still determined by `object_access_admin_group`, `core_user_group`, and active `core_group`, not menu access. Direct and group grants are evaluated by existing SQL CHECK. No UI group-sharing controls were added.

Backend changes cover connection edit/activation/catalog, dataset shared helpers, pipeline edit/run/cancel/catalog/jobs/output reads, ingest submission/jobs, schedule save/toggle/catalog/history, chart read/edit/delete/catalog and dataset references, and Parquet deletion. ETL output access inherits PIPELINE access resolved through the output's server-side run record. Private data responses use `Cache-Control: no-store`.

Pipeline workers check the recorded requester’s current PIPELINE execute rights before recovery/source binding. Stored workers check DATASET execute before binding. Dataset source rights and CONNECTION read rights are checked before source credential access. Workers need the same signed authorizer configuration as Flask. This is fail-closed: missing keys/RPC availability prevent execution; there is no blanket worker access.

## SQL review and DEV sequence

1. Run `data-studio-backend/checks/phase2d8_authorization_preflight.sql` manually in CoreAnalytics. Export installed definitions; inspect the actual gateway database's `dbo.spDashboard` too. This report excludes RPC key material.
2. Compare installed code against repository sources. In particular, source ownership registration and deletion procedures differ across existing local candidates. Migration 028 requires 026/027 and the active-user schema. It refuses an unreviewed existing V2 definition rather than replacing unknown changes.
3. Review/run `028_OWNER_ONLY_SHARING.sql` manually in DEV. It transactionally saves the exact prior procedure and installs primary-owner-only GRANT/REVOKE/TRANSFER, active actor/recipient checks, and OWNER-before-ADMIN CHECK precedence. Existing sharing audit writes are preserved. ADMIN_ASSIGN remains the existing separate governance path, not an HTTP capability.
4. Run `028B_VERIFY_OWNER_ONLY_SHARING.sql`. This checks structure only; it does not prove behavioral security.
5. Perform actor trials below before activation. If rollback is needed, disable sharing mutations first, then review/run `028C_ROLLBACK_OWNER_ONLY_SHARING.sql`. It refuses to overwrite a definition changed since install. Restoring the previous definition restores its previous admin-sharing policy.

No new data-plane SQL migration is provided: the precise installed procedures and gateway still need a coordinated implementation of pre-pagination filtering, transactional mutation authorization, dependent-object checks and authenticated data-plane actor propagation. Migration 028 only fixes ownership/sharing control.

## Environment

Use the existing protected `voice-auth-backend/.env` or process secret configuration:

```dotenv
STUDIO_OBJECT_ACCESS_BEAM_ENABLED=true
STUDIO_OBJECT_ACCESS_BEAM_HMAC_KEY_HEX=<existing-32-byte-key-as-64-hex-characters>
STUDIO_OBJECT_ACCESS_MUTATIONS_ENABLED=false
STUDIO_OBJECT_ACCESS_REGISTRATION_ENABLED=false
```

These are the existing flags. No permission-enforcement bypass flag was added. Enable sharing mutations only for controlled DEV trials after SQL correction and verification. Registration flags must follow the actual creation integration; do not enable browser claiming to compensate for missing atomic ownership registration. Keep existing Fernet, gateway, session, worker, and reader settings unchanged. Do not generate a replacement Fernet/HMAC key for existing objects.

`app/config.py` calls `load_dotenv()`. HTTP and worker launches import that configuration through the Core API client. For workers launched elsewhere, ensure the protected environment is loaded and the working directory/configuration source is correct. Before restarting workers, verify authorizer configuration or scheduled jobs will fail closed.

## Exact local commands

From repository root, run validation:

```sh
(cd voice-auth-backend && ../.venv/bin/python -m unittest discover -s tests -p test_phase2d8_authorization.py)
.venv/bin/python -m compileall -q voice-auth-backend/app
(cd voice-dashboard && npm run build)
```

For local development, stop the existing foreground backend/frontend with Ctrl+C in their terminals, then restart each in a separate terminal:

```sh
cd /Users/ronaldyonatan/CoreAnalyticsV2/voice-auth-backend
bash ./start_coreanalytics_dev_fixed.sh
```

```sh
cd /Users/ronaldyonatan/CoreAnalyticsV2/voice-dashboard
npm run dev -- --host 127.0.0.1
```

For an existing **DEV Compose** deployment built from this checkout, the rebuild/recreate command is:

```sh
docker compose up -d --build voice-auth voice-dashboard
```

Do not use that command against production for this incomplete candidate. Restart existing workers with their existing supervisor/configuration after checking authorizer configuration; local launchers are `bash ./start_dispatcher_local.sh`, `bash ./scripts/stored_dataset_worker.sh serve`, and `bash ./scripts/studio_scheduler.sh serve`. The scheduler and stored worker retain their existing isolated SQL worker architecture; no worker DSN was added to Flask.

## Manual actor trial checklist

Use six identities: primary owner, direct Viewer, direct Editor, unrelated user, explicitly configured admin who is not owner, and recorded background requester. Repeat with active group grants and revoked group membership. Use direct HTTP requests with real session/CSRF credentials; do not rely on hidden buttons.

- Owner grants Viewer/Editor; each recipient can read only allowed objects. Neither recipient nor unrelated admin can grant/revoke. Forged actor/owner fields never change authority. Confirm audit entries for successful grant/change/revoke and unchanged grants for denied attempts.
- Viewer cannot edit connections, update charts, save/toggle schedules, run/cancel pipelines, ingest or delete Parquet. Editor can edit/run authorized objects but cannot delete/share. Admin non-owner is read-only under this candidate policy.
- Guess object/run/output IDs belonging to another user; ensure no metadata, rows, paths, counts or schema leak. Check denied previews never contact source DB/private reader. Check chart and schedule cross-object references.
- Check catalogs at more than 100 pipelines/jobs/outputs and more than 150 schedule events. This currently exposes completeness gaps from legacy SQL limits; SQL filtering before limits remains a release blocker.
- Revoke access and repeat every read/mutation. Confirm the next request denies. Repeat with disabled/unavailable authorizer, malformed RPC results, absent ownership and missing worker configuration; all must fail closed. SQL authorization/mutation race remains a release blocker.
- Queue work, revoke requester rights before pickup and confirm no driver/source access. Scheduled runs must use the recorded identity, not a worker-wide admin. Verify unchanged owner schedules still run with correctly configured ownership and authorizer. Mid-run cancellation on revocation remains unimplemented.
- Verify ETL output identity/inheritance and stored snapshot selection; shared recipients must not receive raw storage paths. Existing legacy SQL may deny shared recipients even when CHECK permits them; that is a release blocker, not a successful sharing test.
- Check approved avatar/popup behavior, themes and mobile views. No UI source was changed in this batch. Legacy dashboards, voice commands, login and group menus were not edited.

## Remaining blockers

See ENFORCEMENT_MATRIX.md for route-specific SQL status. Full SQL data-plane enforcement, authenticated gateway dispatch, atomic ownership for every creation path, shared catalogs before pagination/counts, shared-user metadata hydration, deletion SQL (referenced migration 024 absent), scheduler dispatch authorization, dependent connection metadata policy, and integrated DEV actor trials remain unresolved. The Dashboard Designer entry is planned; no persistent catalog integration is supplied.

These are actual gaps, not authorization to use frontend filtering or permission fallbacks. Existing broad gateway modes must remain private and unavailable to browser callers.

## Executed validation

- Baseline frontend: `npm run build` passed (existing large-chunk warning).
- Baseline backend: 204 tests, 9 failures, 1 error, 12 skipped.
- New security tests: 21 passed, including direct API actor forgery/delegation, role matrix, current-grant revocation, malformed metadata, signed authorizer outage, guessed output parent, cross-object scheduler target, owner-only deletion and worker denial before binding/driver launch.
- Final complete backend suite: 225 tests, 9 failures, 1 error, 12 skipped. The same failing cases remain: PostgreSQL registry expectation, Dataset/Graph fixtures and one SQL host-resolution batch-binding case. See `backend-test-results.txt` for exact names and tracebacks. This is not a passing release suite.
- Existing business fixtures now explicitly mock an authorized actor. The stored-preview test's fake ingest module is scoped to its import rather than leaking globally; dedicated security tests exercise authorization denial separately.
- Python `compileall` and `git diff --check` passed. Final frontend build passed. No UI source was edited by this task.
- SQL scripts were prepared and reviewed against repository source only; no SQL parser, SQL Server integration tests or live actor trials were executed.

Changed files are listed in `CHANGED_FILES.md`. The next implementation batch must replace legacy data-plane authorization/filtering inside the actual deployed gateway/procedures, using the preflight definitions and existing source-ownership/deletion contracts. This candidate must not be labeled complete or production-ready.
