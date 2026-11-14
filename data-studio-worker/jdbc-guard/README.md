# Experimental SQL Server JDBC guard

This source is **not installed or enabled**. It is a candidate for the future
query-dataset ingest path. Existing JDBC connections and table/view datasets do
not use it.

The guard returns a SQL Server JDBC connection only after executing
`EXECUTE AS LOGIN ... WITH NO REVERT` and checking the effective identity and
selected database-level permissions. Spark must explicitly select this driver
for every connection, including schema discovery and executor reads. A separate
reviewed login is still required, and object-level permissions, executable
modules, linked servers and every reachable database must be independently
audited; database-level checks alone do not establish read-only safety.

`coreanalyticsExecutionLogin` is a **server-controlled** JDBC property and must
never be accepted from a browser or dataset SQL. The guard removes this
property before forwarding options to the Microsoft JDBC driver. It must not be
globally registered, to avoid changing existing SQL Server datasets.

Run standalone mock-driver tests with:

```sh
sh data-studio-worker/jdbc-guard/test_guard.sh
```

An additional local Spark test (requires PySpark, Java and loopback sockets)
checks that Spark obtains both schema and data connections through the guard:

```sh
data-studio-worker/.venv/bin/python data-studio-worker/jdbc-guard/test_spark_schema_guard.py
```

Both tests use a fake Microsoft driver, not a real SQL Server. Before
activation, build/deployment and classpath handling must be reviewed, and
schema discovery, every partition, error/cancellation, credential redaction,
authorization and Parquet publication must be tested against SQL Server DEV.
