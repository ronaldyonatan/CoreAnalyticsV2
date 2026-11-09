> Implementasi aktif Data Studio sekarang berada di `voice-auth-backend/app/routes/studio_*` dengan session/CSRF server. Bagian di bawah adalah catatan fondasi awal. Untuk mengaktifkan pipeline Spark, gunakan [panduan aktivasi](ACTIVATION.md); script pemeriksaan SQL hanya-baca tersedia di `checks/`.

# CoreAnalytics Data Studio - Stage 2 (safe foundation)

This package contains a SQL Server connection tester, password encryption helper, and a server-side RBAC contract. **No HTTP API is exposed yet**: the existing CoreAnalytics login currently returns user/access to React, but the supplied files do not establish a server-verifiable session/token for subsequent requests. Adding an unprotected Connections API would be unsafe.

## Configuration
- `STUDIO_ALLOWED_SQL_HOSTS`: implement as a trusted server-side exact host allowlist; never accept arbitrary network destinations from the browser.
- `STUDIO_FERNET_KEY`: generate once using `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and store in a secrets manager or protected environment, outside the DB and repository. Back up securely; losing it makes saved credentials unrecoverable.
- ODBC Driver 18 for SQL Server must be installed in the eventual Docker image.

## Security notes
- Source SQL logins should be read-only. `ApplicationIntent=ReadOnly` is advisory and **does not grant or enforce read-only permissions**.
- The test connector only performs a fixed `SELECT DB_NAME(), @@VERSION`; it does not accept arbitrary SQL.
- TLS certificate validation is enabled by default; only allow `TrustServerCertificate=yes` for explicitly approved internal testing.
- When adding HTTP routes, validate a server-issued session on every request, fetch current effective permissions server-side, and enforce `data_studio` before any network connection or DB operation. Do not accept `user_id`, `menus`, or `created_by` from the request body as authority.
- The connection table migration is unchanged and must be applied separately in SQL Server 2016.
