from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from typing import Any
from urllib.parse import urlsplit

from flask import request

from app.clients.core_api_client import core_api

SESSION_COOKIE = 'core_session'
CSRF_COOKIE = 'core_csrf'


def _secure_cookie() -> bool:
    # Explicit production setting required; HTTP localhost may use false.
    return os.environ.get('CORE_SESSION_COOKIE_SECURE', 'true').lower() == 'true'


def _ttl_minutes() -> int:
    try:
        value = int(os.environ.get('CORE_SESSION_TTL_MINUTES', '480'))
    except ValueError:
        value = 480
    return max(5, min(value, 480))


def _row(response: Any) -> dict[str, Any] | None:
    if not isinstance(response, dict):
        return None
    data = response.get('data')
    if isinstance(data, list):
        return data[0] if data and isinstance(data[0], dict) else None
    if isinstance(data, dict):
        return data
    return response if 'success' in response else None


def _ok(response: Any, code: str) -> dict[str, Any] | None:
    row = _row(response)
    return row if row and row.get('success') in (True, 1) and row.get('code') == code else None


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode('ascii')).hexdigest()


def _client_ip() -> str | None:
    # Only trust X-Forwarded-For when requests arrive from a trusted reverse proxy.
    return request.remote_addr


def issue_session(response, user_id: str, method: str) -> bool:
    token = secrets.token_urlsafe(48)
    result = core_api.create_user_session(
        user_id=user_id, token_hash=_digest(token), auth_method=method,
        ip_address=_client_ip(), user_agent=(request.user_agent.string or '')[:1000],
        ttl_minutes=_ttl_minutes(),
    )
    if not _ok(result, 'SESSION_CREATED'):
        return False
    csrf = secrets.token_urlsafe(32)
    response.set_cookie(SESSION_COOKIE, token, max_age=_ttl_minutes() * 60,
                        httponly=True, secure=_secure_cookie(), samesite='Lax', path='/')
    response.set_cookie(CSRF_COOKIE, csrf, max_age=_ttl_minutes() * 60,
                        httponly=False, secure=_secure_cookie(), samesite='Lax', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return True


def clear_session(response):
    response.delete_cookie(SESSION_COOKIE, path='/', secure=_secure_cookie(), samesite='Lax')
    response.delete_cookie(CSRF_COOKIE, path='/', secure=_secure_cookie(), samesite='Lax')
    response.headers['Cache-Control'] = 'no-store'
    return response


def current_session() -> dict[str, Any] | None:
    token = request.cookies.get(SESSION_COOKIE, '')
    if not token or len(token) > 256:
        return None
    return _ok(core_api.validate_user_session(token_hash=_digest(token)), 'SESSION_VALID')


def _canonical_origin(value: str) -> str | None:
    """Normalize a browser Origin; reject paths, credentials, and malformed values."""
    try:
        parsed = urlsplit(value.strip())
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname
                or parsed.username is not None or parsed.password is not None
                or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            return None
        # This also validates numeric port values.
        port = parsed.port
        host = parsed.hostname.lower()
        if ':' in host:  # IPv6 literal
            host = f'[{host}]'
        default = 80 if parsed.scheme == 'http' else 443
        suffix = f':{port}' if port is not None and port != default else ''
        return f'{parsed.scheme.lower()}://{host}{suffix}'
    except (TypeError, ValueError):
        return None


def _same_origin() -> bool:
    """Accept the current origin or a specifically configured browser origin.

    Vite and reverse proxies may expose a different Host to Flask. We require
    an explicit allowlist in that situation; never accept arbitrary Origin or
    wildcard CORS values as substitutes for the CSRF protection.
    """
    origin = _canonical_origin(request.headers.get('Origin', ''))
    if not origin:
        return False
    if origin == _canonical_origin(request.host_url):
        return True
    permitted = os.environ.get('CORE_ALLOWED_BROWSER_ORIGINS', '')
    allowed = {
        normalized
        for item in permitted.split(',')
        if (normalized := _canonical_origin(item)) is not None
    }
    return origin in allowed


def valid_csrf() -> bool:
    cookie = request.cookies.get(CSRF_COOKIE, '')
    header = request.headers.get('X-CSRF-Token', '')
    return bool(cookie and header and _same_origin() and hmac.compare_digest(cookie, header))


def revoke_current_session(reason='LOGOUT') -> bool:
    token = request.cookies.get(SESSION_COOKIE, '')
    if not token:
        return True
    result = core_api.revoke_user_session(token_hash=_digest(token), reason=reason)
    return bool(_ok(result, 'SESSION_REVOKED'))
