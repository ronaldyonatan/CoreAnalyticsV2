#!/bin/sh
# Build the experimental guard jar for review/DEV testing. Does not deploy it.
set -eu
if [ "$#" -ne 1 ]; then
  printf '%s\n' 'Usage: sh build_guard.sh /absolute/path/new-guard.jar' >&2
  exit 2
fi
case "$1" in /*) ;; *) printf '%s\n' 'Output path must be absolute.' >&2; exit 2;; esac
if [ -e "$1" ]; then printf '%s\n' 'Output already exists; refusing to overwrite.' >&2; exit 2; fi
guard_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test_build=$(mktemp -d "${TMPDIR:-/tmp}/coreanalytics-jdbc-guard-build.XXXXXXXX")
trap 'rm -rf "$test_build"' EXIT HUP INT TERM
javac --release 11 -d "$test_build" "$guard_dir/src/main/java/com/coreanalytics/jdbc/GuardedSqlServerDriver.java"
jar cf "$test_build/guard.jar" -C "$test_build" com/coreanalytics/jdbc
(set -C; cat "$test_build/guard.jar" > "$1")
printf 'Built experimental guard jar: %s\n' "$1"
