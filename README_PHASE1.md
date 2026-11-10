# CoreAnalyticsV2 Phase 1 — SQL Server dynamic policy (local pilot)

This is a **code patch**, not a production SaaS security boundary. No live database or BEAM execution was performed.

## Install
1. Back up or git commit the project.
2. Extract this ZIP at the repository root, preserving paths.
3. Restart Flask and dispatcher. Do not replace production settings with local settings.
4. Run: `cd voice-auth-backend && ../.venv/bin/python -m unittest discover -s tests -p test_studio_sql_policy.py`
5. Run pipeline `data appointment` again; review the new run ID and phase.

## Policy
- `STUDIO_SQL_HOST_POLICY=dynamic` by default: new hosts do not require static hostname entries.
- `STUDIO_SQL_ALLOW_PRIVATE=false` by default: private addresses are blocked on shared/public runtimes.
- The two included local development startup scripts explicitly opt in to private destinations. **Never use these scripts on a public shared host.**
- Optional `STUDIO_SQL_ALLOWED_NETWORKS` still restricts networks when provided.
- `STUDIO_SQL_ALLOWED_PORTS` defaults to 1433; operators may configure permitted ports globally.
- Worker revalidates pinned destination IP, port and private access before JDBC.

## Security limitations / before SaaS
This is for local trusted development only. Network-level egress firewall, worker isolation, tenant-level policy, safe destination routing, audit and signed source bindings are still needed before allowing untrusted external users. Private agent architecture is required for private customer networks. Worker validation does not independently authenticate source bindings and does not replace OS-level egress restrictions.
