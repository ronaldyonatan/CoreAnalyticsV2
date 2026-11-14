# CoreAnalyticsV2 Phase 2.2A - PostgreSQL connection and edit

Apply only to a development/test environment first. This patch changes Connection management only; PostgreSQL browse/preview/ETL are not enabled.

1. Back up `dbo.spDashboard` and apply `spDashboard_Phase2_2A.sql` in the database **where dbo.spDashboard already exists** (do not run it in CoreAnalytics unless that is where your procedure lives). SQL Server 2016 SP2 supports CREATE OR ALTER.
2. Extract patch to CoreAnalyticsV2 root, preserving paths.
3. Install PostgreSQL driver in voice-auth backend environment: `pip install 'psycopg[binary]>=3.2,<4'`. Add the pinned dependency to your backend's dependency management before deployment.
4. Existing host validation applies to PostgreSQL. Set `STUDIO_SQL_ALLOWED_PORTS=1433,5432` (or a narrower explicit list appropriate to your environment). Keep existing `STUDIO_SQL_HOST_POLICY`, allowed networks, and private destination restrictions. PostgreSQL connections will otherwise be rejected by the default 1433-only port policy. Do NOT relax to `*` unless necessary.
5. Restart Flask backend, then Vite dev server. Open Connections and check SQL Server and PostgreSQL in catalog. PostgreSQL requires a trusted server TLS certificate if Encrypt Transport is checked; to test an internal server without TLS, uncheck Encrypt Transport in a trusted test environment. The SQL Server Trust Server Certificate option does not apply to PostgreSQL.
6. Validate SQL Server list/test/create and PostgreSQL test/create; edit existing connection and leave password blank to preserve it. Edit with password supplied replaces encrypted password. The type cannot be changed during edit.
7. Test connection must be run with a password; edit without a new password cannot test without retrieving existing secret (not implemented in this phase).

Security: never upload .env or secrets. The connection test returns sanitized failures. PostgreSQL uses pinned resolved address with original hostname for TLS verification.

Known scope: PostgreSQL adapter advertises `test` only, not `browse`, `preview`, or `read`; later phases implement these. PostgreSQL does not alter the existing SQL Server batch pipeline.
