from dataclasses import dataclass
from typing import Any, Dict, Optional

from app.clients.core_api_client import core_api
from app.services.password_service import verify_password


@dataclass
class LoginResult:
    success: bool
    code: str
    message: str
    user: Optional[Dict[str, Any]] = None


def _first_data_row(response: Any) -> Optional[Dict[str, Any]]:
    """
    Normalisasi response BEAM:
    {
        "code": 200,
        "data": [ { ... } ],
        "result": "success"
    }
    """
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


def login_with_password(username: str, password: str) -> LoginResult:
    username = (username or "").strip()

    if not username:
        return LoginResult(
            success=False,
            code="USERNAME_REQUIRED",
            message="Username wajib diisi.",
        )

    if not password:
        return LoginResult(
            success=False,
            code="PASSWORD_REQUIRED",
            message="Password wajib diisi.",
        )

    response = core_api.get_user_auth(username)
    row = _first_data_row(response)

    if not row:
        # Sengaja dibuat generik agar tidak membocorkan apakah username ada.
        return LoginResult(
            success=False,
            code="INVALID_CREDENTIALS",
            message="Username atau password salah.",
        )

    if row.get("success") is False:
        return LoginResult(
            success=False,
            code=row.get("code", "INVALID_CREDENTIALS"),
            message=row.get("message", "Username atau password salah."),
        )

    if not row.get("is_active", False):
        return LoginResult(
            success=False,
            code="USER_INACTIVE",
            message="User tidak aktif.",
        )

    password_hash = row.get("password_hash")

    if not password_hash:
        return LoginResult(
            success=False,
            code="PASSWORD_HASH_NOT_FOUND",
            message="Password hash user tidak ditemukan.",
        )

    if not verify_password(password, password_hash):
        return LoginResult(
            success=False,
            code="INVALID_CREDENTIALS",
            message="Username atau password salah.",
        )

    # Jangan pernah teruskan password_hash ke frontend.
    user = {
        "user_id": row.get("user_id"),
        "username": row.get("username"),
        "display_name": row.get("display_name"),
        "is_active": row.get("is_active"),
    }

    return LoginResult(
        success=True,
        code="LOGIN_SUCCESS",
        message="Login berhasil.",
        user=user,
    )
