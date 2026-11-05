#!/usr/bin/env python3
"""Local read-only SQL Server / ODBC diagnostic for CoreAnalytics Data Studio.

Run in voice-auth-backend's venv: python diagnose_sqlserver.py
Does not print credentials or connection strings. Uses getpass (no shell-history secret).
"""
from __future__ import annotations

import getpass
import re
import sys

try:
    import pyodbc
except (ImportError, OSError) as exc:
    print(f"PYODBC_LOAD_FAILED: {type(exc).__name__}. Check unixODBC and pyodbc installation.")
    sys.exit(2)


def safe_input(label: str, default: str = "") -> str:
    hint = f" [{default}]" if default else ""
    value = input(f"{label}{hint}: ").strip()
    return value or default


def odbc_quote_password(pw: str) -> str:
    return "{" + pw.replace("}", "}}") + "}"


def classify(raw: str) -> str:
    s = raw.lower()
    patterns = [
        ("TLS_CERTIFICATE", ["certificate verify failed", "certificate chain", "self signed", "self-signed", "not trusted", "unknown ca", "unable to get local issuer", "hostname mismatch", "certificate name", "target principal name is incorrect"]),
        ("LOGIN_REJECTED", ["login failed", "18456", "authentication failed"]),
        ("DATABASE_NOT_ACCESSIBLE", ["cannot open database", "4060", "database requested by the login"]),
        ("TLS_NEGOTIATION", ["ssl provider", "tls", "ssl routines", "handshake failure", "unsupported protocol", "protocol version"]),
        ("NETWORK_OR_SERVER", ["connection refused", "connection reset", "no route to host", "server does not exist", "network is unreachable", "server was not found"]),
        ("TIMEOUT", ["timeout", "timed out", "hyt00", "hyt01"]),
        ("ODBC_DRIVER", ["can't open lib", "data source name not found", "im002", "driver manager"]),
    ]
    for label, terms in patterns:
        if any(t in s for t in terms):
            return label
    return "OTHER_ODBC_FAILURE"


def redacted(raw: str, host: str, database: str, username: str, password: str) -> str:
    result = raw
    # Never echo secrets or connection parameters, including when embedded in driver diagnostics.
    for sensitive, replacement in ((password, "<PASSWORD>"), (host, "<HOST>")):
        if sensitive:
            result = re.sub(re.escape(sensitive), replacement, result, flags=re.IGNORECASE)
    for sensitive, replacement in ((username, "<USERNAME>"), (database, "<DATABASE>")):
        if sensitive:
            result = re.sub(r"(?<![\w])" + re.escape(sensitive) + r"(?![\w])", replacement, result, flags=re.IGNORECASE)
    result = re.sub(r"(?i)(PWD|PASSWORD)\s*=\s*[^;\s]+", r"\1=<REDACTED>", result)
    return result[:1400]


def connect(host: str, database: str, username: str, password: str, *, trust: bool) -> bool:
    cs = (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER=tcp:{host},1433;"
        f"DATABASE={database};"
        f"UID={username};PWD={odbc_quote_password(password)};"
        "Encrypt=yes;"
        f"TrustServerCertificate={'yes' if trust else 'no'};"
        "Connection Timeout=10;"
        "ApplicationIntent=ReadOnly;"
    )
    print(f"\nTesting ODBC Driver 18, Encrypt=yes, TrustServerCertificate={'yes' if trust else 'no'} ...")
    try:
        with pyodbc.connect(cs, timeout=10, autocommit=True) as conn:
            row = conn.cursor().execute("SELECT DB_NAME(), @@VERSION").fetchone()
            print("RESULT: CONNECTION_SUCCESS")
            print("Selected database:", row[0])
            print("SQL Server:", str(row[1]).splitlines()[0])
            return True
    except pyodbc.Error as exc:
        raw = " ".join(str(p) for p in getattr(exc, "args", ()))
        match = re.search(r"\b(?:HYT\d\d|IM\d\d\d|08\d\d\d|28\d\d\d|42\d\d\d)\b", raw, re.IGNORECASE)
        print("RESULT: CONNECTION_FAILED")
        print("SQLSTATE:", match.group(0) if match else "not found")
        print("CATEGORY:", classify(raw))
        print("ODBC DETAIL (redacted):", redacted(raw, host, database, username, password))
        return False


def main() -> None:
    print("CoreAnalytics SQL Server ODBC diagnostic (local only, no file changes)")
    print("Installed drivers:", pyodbc.drivers())
    if "ODBC Driver 18 for SQL Server" not in pyodbc.drivers():
        print("ODBC_DRIVER_18_MISSING")
        sys.exit(2)
    host = safe_input("SQL Server host", "172.16.20.174")
    database = safe_input("Database", "bi")
    username = safe_input("SQL username", "sa")
    password = getpass.getpass("SQL password (hidden): ")
    if not password:
        print("Password required; no connection attempted.")
        return
    if any(ch in v for v in (host, database, username) for ch in ";{}\r\n\x00"):
        print("Invalid delimiter in host/database/username; no connection attempted.")
        return
    ok = connect(host, database, username, password, trust=False)
    if not ok:
        print("\nOptional: TrustServerCertificate=yes skips server certificate verification.")
        print("Use ONLY for diagnosis on an authorized internal development SQL Server.")
        proceed = safe_input("Repeat once with temporary certificate trust? (y/N)", "N").lower()
        if proceed == "y":
            connect(host, database, username, password, trust=True)
    print("\nShare only RESULT, SQLSTATE, CATEGORY and redacted ODBC DETAIL; never share the password.")


if __name__ == "__main__":
    main()
