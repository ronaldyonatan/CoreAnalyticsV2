import json
from dataclasses import dataclass
from typing import Any, Dict, Optional

from app.clients.core_api_client import core_api
from app.services.password_service import verify_password


MAX_FAILED_LOGIN_ATTEMPTS = 3


@dataclass
class LoginResult:
    success: bool
    code: str
    message: str
    user: Optional[Dict[str, Any]] = None
    access: Optional[Dict[str, Any]] = None
    failed_login_count: int = 0
    is_locked: bool = False


def _first_data_row(response: Any) -> Optional[Dict[str, Any]]:
    """Normalize the BEAM Mode + Payload response."""
    if not isinstance(response, dict):
        return None

    data = response.get("data")

    if isinstance(data, list):
        if not data:
            return None
        if isinstance(data[0], dict):
            return data[0]

    if isinstance(data, dict):
        return data

    return None


def _json_object_list(value: Any) -> list[Dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]

    if not isinstance(value, str) or not value.strip():
        return []

    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return []

    if not isinstance(parsed, list):
        return []

    return [item for item in parsed if isinstance(item, dict)]


def get_user_access_profile(user_id: str) -> Dict[str, Any]:
    response = core_api.get_user_access(str(user_id))
    row = _first_data_row(response)

    if not row:
        raise RuntimeError("Core API tidak mengembalikan access profile.")

    if row.get("success") is False:
        raise RuntimeError(
            str(row.get("message") or "User access tidak dapat dibaca.")
        )

    return {
        "groups": _json_object_list(row.get("groups_json")),
        "menus": _json_object_list(row.get("menus_json")),
    }


def _safe_login_log(
    *,
    username: Optional[str],
    is_success: bool,
    user_id: Optional[str] = None,
    failure_code: Optional[str] = None,
    failure_detail: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Audit must never expose password/token and should not crash auth."""
    try:
        core_api.add_login_log(
            username=username,
            auth_method="PASSWORD",
            is_success=is_success,
            user_id=user_id,
            failure_code=failure_code,
            failure_detail=failure_detail,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except Exception as exc:
        print("LOGIN AUDIT ERROR:", exc)


def login_with_password(
    username: str,
    password: str,
    *,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> LoginResult:
    username = (username or "").strip()

    if not username:
        _safe_login_log(
            username=None,
            is_success=False,
            failure_code="USERNAME_REQUIRED",
            failure_detail="Username kosong.",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(
            False,
            "USERNAME_REQUIRED",
            "Username wajib diisi.",
        )

    if not password:
        _safe_login_log(
            username=username,
            is_success=False,
            failure_code="PASSWORD_REQUIRED",
            failure_detail="Password kosong.",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(
            False,
            "PASSWORD_REQUIRED",
            "Password wajib diisi.",
        )

    response = core_api.get_user_auth(username)
    row = _first_data_row(response)

    if not row:
        # Generic response intentionally avoids username enumeration.
        _safe_login_log(
            username=username,
            is_success=False,
            failure_code="INVALID_CREDENTIALS",
            failure_detail="Username tidak ditemukan atau credential tidak valid.",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(
            False,
            "INVALID_CREDENTIALS",
            "Username atau password salah.",
        )

    if row.get("success") is False:
        code = str(row.get("code") or "INVALID_CREDENTIALS")
        message = str(row.get("message") or "Username atau password salah.")
        _safe_login_log(
            username=username,
            is_success=False,
            failure_code=code,
            failure_detail=message,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(False, code, message)

    user_id = row.get("user_id")

    if not row.get("is_active", False):
        _safe_login_log(
            username=username,
            user_id=user_id,
            is_success=False,
            failure_code="USER_INACTIVE",
            failure_detail="User inactive.",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(
            False,
            "USER_INACTIVE",
            "User tidak aktif.",
        )

    if bool(row.get("is_locked", False)):
        failed_count = int(row.get("failed_login_count") or MAX_FAILED_LOGIN_ATTEMPTS)
        _safe_login_log(
            username=username,
            user_id=user_id,
            is_success=False,
            failure_code="ACCOUNT_LOCKED",
            failure_detail="Login ditolak karena account terkunci.",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(
            False,
            "ACCOUNT_LOCKED",
            "Account terkunci. Hubungi administrator untuk unlock.",
            failed_login_count=failed_count,
            is_locked=True,
        )

    password_hash = row.get("password_hash")

    if not password_hash:
        _safe_login_log(
            username=username,
            user_id=user_id,
            is_success=False,
            failure_code="PASSWORD_HASH_NOT_FOUND",
            failure_detail="Password hash user tidak ditemukan.",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(
            False,
            "PASSWORD_HASH_NOT_FOUND",
            "Password user belum tersedia.",
        )

    if not verify_password(password, password_hash):
        state_response = core_api.record_login_failure(
            user_id=str(user_id),
        )
        state = _first_data_row(state_response) or {}
        failed_count = int(state.get("failed_login_count") or 0)
        is_locked = bool(state.get("is_locked", False))

        if is_locked:
            code = "ACCOUNT_LOCKED"
            message = (
                "Account terkunci setelah 3 percobaan login gagal. "
                "Hubungi administrator untuk unlock."
            )
        else:
            code = "INVALID_CREDENTIALS"
            remaining = max(0, MAX_FAILED_LOGIN_ATTEMPTS - failed_count)
            message = "Username atau password salah."
            if remaining > 0:
                message += f" Sisa percobaan: {remaining}."

        _safe_login_log(
            username=username,
            user_id=user_id,
            is_success=False,
            failure_code=code,
            failure_detail=(
                f"Password verification failed; attempt={failed_count}; "
                f"locked={is_locked}."
            ),
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return LoginResult(
            False,
            code,
            message,
            failed_login_count=failed_count,
            is_locked=is_locked,
        )

    # Successful password login resets consecutive failures.
    state_response = core_api.record_login_success(
        user_id=str(user_id),
    )
    state = _first_data_row(state_response) or {}

    if state.get("success") is False:
        return LoginResult(
            False,
            "AUTH_STATE_ERROR",
            "Status keamanan login tidak dapat diperbarui.",
        )

    # Load effective RBAC only after credentials are verified.
    # Empty groups/menus are valid; an API failure is not.
    try:
        access = get_user_access_profile(str(user_id))
    except Exception as exc:
        _safe_login_log(
            username=username,
            user_id=user_id,
            is_success=False,
            failure_code="AUTH_ACCESS_ERROR",
            failure_detail=str(exc),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(
            False,
            "AUTH_ACCESS_ERROR",
            "Hak akses user tidak dapat dimuat.",
        )

    user = {
        "user_id": user_id,
        "username": row.get("username"),
        "display_name": row.get("display_name"),
        "email": row.get("email"),
        "is_active": row.get("is_active"),
    }

    _safe_login_log(
        username=username,
        user_id=user_id,
        is_success=True,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return LoginResult(
        True,
        "LOGIN_SUCCESS",
        "Login berhasil.",
        user=user,
        access=access,
        failed_login_count=0,
        is_locked=False,
    )
