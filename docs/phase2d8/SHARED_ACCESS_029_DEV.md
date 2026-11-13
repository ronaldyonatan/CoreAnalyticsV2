# Phase2D8 — shared access, candidate 029

This supersedes the original Viewer/Editor split for this project. The user clarified that every person shared by the primary owner may read, preview, edit, execute and manage schedules. Delete, grant/revoke and ownership transfer remain owner-only. The user reports successful installation and trial of owner-only migration 028 in DEV; 029 preserves that policy.

## Ready to run manually in DEV

Open `artifacts/CoreAnalyticsV2-Phase2D8-SHARED-ACCESS-INSTALL-AND-VERIFY.sql` in SSMS against the same DEV SQL Server. Run the entire file. It selects CoreAnalytics and updates the verified gateway in BI within one transaction on the same SQL Server instance. It is not for a different environment or production deployment.

The file is approximately 544 KB because it contains both the reviewed pre-install definitions and replacement definitions, including the full gateway to preserve its existing dashboard modes. It produces one XML result named `OPEN_AND_SAVE_THIS_XML`. Save that result using the previously established XML workflow. Expected status: `SHARED_EDIT_029_INSTALLED_DEV_TRIALS_REQUIRED`.

An unknown definition produces `OPEN_AND_SAVE_DIAGNOSTIC_XML` and error 52906, and rolls back the whole installation. Send the diagnostic XML after inspecting it for secrets. Do not bypass the guard. All comparisons normalize both Windows and Unix line endings, trim outer whitespace, and compare code using a binary collation and byte lengths. Missing definitions or functions also stop installation. First install saves previous module definitions in `studio.phase2d8_dataplane_backup`; a repeat run requires the installed definitions to match that backup registry.

No SQL was executed by the assistant. Offline tests do not establish SQL Server compilation/integration success. Installing this candidate is the next DEV validation step, not proof that the entire phase has passed.

## Changes

| Path | Policy |
|---|---|
| Connection catalog/metadata/secret | SQL filters visible connections; edit and activation require shared edit or owner |
| Dataset catalog | SQL filters before order/results; empty-catalog detection uses the same policy |
| Dataset preview/filter/source reads | Backend checks the Dataset and SQL checks its exact connection relationship; no general connection grant is implied |
| Creating Dataset | Requires shared edit/owner access to its Connection; repeats authorization in creation transaction |
| Pipeline catalog/get/jobs/outputs | SQL filters by PIPELINE access before TOP/order/counts; output permissions inherit the actual pipeline through its run |
| Pipeline save/submit/cancel | Shared edit/owner; submitted source Dataset references must be authorized; retains requester identity and version/lease behavior |
| Stored ingestion/jobs/snapshots | DATASET access, not the identity of the person who refreshed it; submit requires shared edit/owner |
| Schedule list/history/save/toggle | SCHEDULE rights can inherit shared access to its target. Target rights are also required. Changing a schedule's target must preserve the recorded creator's right to execute it |
| Scheduled dispatch | Uses the existing recorded schedule creator, rechecks current target and source permissions; invalid schedules are disabled using the existing SKIPPED_INVALID behavior |
| Chart catalog/get/query references | CHART access and referenced Dataset/Pipeline output access; SQL validates stored/new config references |
| Chart edits | Shared edit/owner; optimistic version behavior preserved |
| Chart/Parquet deletion | Primary owner only; existing tombstone, path, lease and busy-job checks retained |
| Worker publication | Pipeline and stored workers recheck recorded requester rights before SQL registers a successful output |
| Sharing popup | Same layout/theme/popup behavior. Newly added users use EDITOR and label Shared; the Viewer/Editor selector is removed because recipients now have one shared-access policy |
| Legacy VIEWER grants | Behave as shared edit too; no mass rewrite or impersonated audit attribution of existing grants |
| Governance Admin | Read-only unless separately shared or primary owner; sharing an object does not become an admin privilege |

Four SQL helpers implement active-user, exact ownership, direct/group grants, schedule inheritance and source-reference checks. Authorization reads use HOLDLOCK so an enclosing write transaction retains the relevant permission locks. IDs of deleted/nonexistent objects deny even if an orphan ownership record remains. The existing signed ownership RPC is preserved and its GET metadata is now available to authorized recipients; management mutations and user directory remain primary-owner-only.

Atomic ownership registration, existing sharing audit writes, stored row counts, recurrence masks, Parquet deletion branches and all non-Studio gateway text are retained. The source is the user's actual DEV inventory, not older baseline migrations. Generated replacements are under `data-studio-backend/phase2d8/`; the repeatable builder is `scripts/phase2d8/build_dataplane_candidate.py`.

## Restart after SQL succeeds

Backend, in its existing terminal: stop with Ctrl+C, then:

```sh
cd /Users/ronaldyonatan/CoreAnalyticsV2/voice-auth-backend
bash ./start_coreanalytics_dev_fixed.sh
```

Frontend, in its existing terminal: stop with Ctrl+C, then:

```sh
cd /Users/ronaldyonatan/CoreAnalyticsV2/voice-dashboard
npm run dev -- --host 127.0.0.1
```

For an existing DEV Compose environment instead of local foreground processes:

```sh
cd /Users/ronaldyonatan/CoreAnalyticsV2
docker compose up -d --build voice-auth voice-dashboard
```

Restart the existing workers through their existing supervisor or local launcher after confirming they load the existing signed-authorizer configuration. No keys, flags, DSNs or `.env` values were modified by this change. Retain the existing working DEV sharing flags. No direct Flask SQL connection was introduced; the pre-existing scheduler/ingest worker SQL connections are unchanged.

## DEV actor trial

Use an Owner, a recipient and an unrelated user. Include an explicitly configured non-owner Admin. Repeat direct and group grants where used.

1. Share a Dataset with a recipient. Its preview/filter should work without separately sharing the entire Connection. The Connection itself and source browser must remain inaccessible without a Connection grant. Stored previews must include snapshots refreshed by the Owner or another authorized recipient.
2. For Pipeline/Chart workflows, also share the referenced source Datasets or output Pipeline where needed. Sharing a Chart or Pipeline does not automatically expose unrelated source objects. Test an unshared reference is rejected. Pipeline output access follows its Pipeline grant.
3. Recipient can edit and run, cancel runs, and manage target schedules. Delete and Grant/Revoke must deny, including direct API calls that bypass buttons. The popup's owner and Shared avatars should work for recipients; they cannot use the owner-only directory or mutate shares.
4. Recipient-created schedules retain that recipient as background requester. Existing owner-created schedules keep the Owner as requester. Revoke the recipient before the next scheduled dispatch and confirm recipient-created work is skipped. Editing an owner-created schedule does not silently substitute the editor as execution identity.
5. Revoke all applicable direct/group grants and repeat GET/preview/filter/query/edit/run/cancel/schedule/output calls. The next authorized operation must deny; if a separate group grant remains, removing only the direct grant is not a full revocation.
6. Check guessed IDs, wrong Dataset/Connection pairs, unrelated output/run IDs, inactive actors, missing ownership, gateway outage and authorizer outage. No secret/path/data fallback is allowed.
7. Check catalogs with more than 100 pipeline items and more than 150 schedule events. Existing caps remain, but SQL permission filters now run before those limits and output counts.
8. Confirm the recorded requester still has rights at worker pickup and publication. A driver already in progress is not forcibly killed by revocation; SQL success publication is fenced. An interrupted/denied run can leave an unpublished artifact for the existing recovery/cleanup process.
9. Recheck owner creation, active/inactive Connections, both source connectors, recurrence, stored refresh, Parquet deletion, legacy dashboards and existing theme/mobile popup behavior.

## Actor trust and deployment boundary

Data-plane UserID comes from the authenticated Flask session through existing private BEAM service calls; browser fields are not used as authority. Sharing RPCs remain HMAC-signed. This candidate does not introduce a new HMAC envelope for every legacy data-plane mode or change BEAM's authentication system. The BEAM service token, raw modes, SQL worker credentials and private reader endpoints must remain server-only. Exposure of those service credentials is outside the browser principal boundary and remains a release risk requiring deployment review.

## Rollback

`data-studio-backend/migrations/029B_ROLLBACK_SHARED_EDIT_DATAPLANE.sql` restores pre-029 module definitions and removes only the new helpers, with definition-drift checks in one transaction. It preserves the already installed 028 owner-only policy. It does not roll back Python/frontend files: restore the matching pre-029 application revision and restart the corresponding services as part of rollback. No rollback was executed by the assistant.

Production enablement and final completion require SQL installation, direct API actor trials, worker trials and resolution of outstanding baseline test failures. Dashboard Designer remains a planned module without a persistent Studio object catalog in the inspected source.

## Executed local verification

- Before this batch: 225 backend tests, 9 failures, 1 error, 12 skipped.
- After this batch: 236 backend tests, the same 9 failing test names, 1 error, 12 skipped. Those pre-existing failures remain unresolved; this is not a passing release suite.
- Focused authorization and SQL artifact contracts: 32 tests passed. These include compatibility of legacy VIEWER grants, owner-only delete/delegation denial, Dataset-scoped secret reference, policy guards, Windows/Unix baseline literals, worker publication fences, and exact preservation of the non-Studio gateway portion.
- Python compilation and `git diff --check` passed. Frontend `npm run build` passed with the existing chunk-size warning.
- SQL Server compilation, DEV installation and live actor/worker tests have not been executed by the assistant.

## Revision 2: reviewed gateway mismatch

The user supplied the 52906 diagnostic XML for BI.dbo.spDashboard. Its normalized actual body was 371414 UTF-16 bytes; the previous expected body was 371416 bytes. An exact diff showed a single empty line removed between a legacy BEGIN CATCH and SELECT, with no added lines or changed SQL commands. The original export remains intact. The reviewed current variant is `artifacts/phase2d8-dev-inventory/BI__spDashboard_reviewed_029.sql`, and builder/migration/artifact now use it. The marker is `SHARED_EDIT_DEV_REV2`. Baseline checks were not disabled or generalized to ignore internal whitespace. The failed transaction did not install 029; revision 2 is still awaiting DEV execution.

## User-confirmed DEV installation of 029 and follow-up 030

The user provided successful installation XML with status SHARED_EDIT_029_INSTALLED_DEV_TRIALS_REQUIRED at 2026-11-12T16:42:10.3377488 UTC. It lists all 14 intended objects, including BI.dbo.spDashboard, the four helpers and nine Studio procedures. This confirms the script reached its post-commit output, not that API/worker actor trials passed.

Review identified a pre-check inconsistency: V2 CHECK and signed RPC GET tested direct SCHEDULE rights before evaluating target-inherited rights. A recipient of only the target Dataset/Pipeline could therefore see SQL schedule list rows but be rejected by the backend's fresh CHECK or metadata GET. This is corrected by `artifacts/CoreAnalyticsV2-Phase2D8-SCHEDULE-CHECK-FIX.sql` (migration 030), which changes only those two pre-check expressions, keeps owner-only management guards intact, and has its own exact baseline guard, transaction, backup and single XML result. Run manually in DEV before schedule recipient trials. No database execution of 030 was performed by the assistant.

Do not rerun 029 to apply 030. 029's drift protection will correctly reject changed modules after 030. To roll back, first use `030B_ROLLBACK_SCHEDULE_CHECK.sql`, then use 029B if necessary. Restart the backend/frontend with the commands above, then trial Owner/recipient/unrelated accounts and current-permission revocation across each module.
