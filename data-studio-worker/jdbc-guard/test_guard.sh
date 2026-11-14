#!/bin/sh
set -eu
guard_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test_build=$(mktemp -d "${TMPDIR:-/tmp}/coreanalytics-jdbc-guard.XXXXXXXX")
trap 'rm -rf "$test_build"' EXIT HUP INT TERM
javac --release 11 -d "$test_build" \
  "$guard_dir/src/main/java/com/coreanalytics/jdbc/GuardedSqlServerDriver.java" \
  "$guard_dir/src/test/java/com/microsoft/sqlserver/jdbc/SQLServerDriver.java" \
  "$guard_dir/src/test/java/com/coreanalytics/jdbc/GuardedSqlServerDriverTest.java"
java -cp "$test_build" com.coreanalytics.jdbc.GuardedSqlServerDriverTest
