import hashlib
import hmac
import json
import os
import secrets
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr
from typing import Any, Dict, Optional
import certifi
import html
from pathlib import Path

from app.clients.core_api_client import core_api
from app.services.password_service import (
    hash_password,
    validate_password_policy,
    verify_password,
)


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


@dataclass
class ChangePasswordResult:
    success: bool
    code: str
    message: str


@dataclass
class PasswordResetResult:
    success: bool
    code: str
    message: str
    reset_token: Optional[str] = None


PASSWORD_RESET_GENERIC_MESSAGE = (
    "Jika akun terdaftar dan memenuhi syarat, kode verifikasi akan dikirim "
    "ke email yang terdaftar."
)


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

def change_password(
    username: str,
    current_password: str,
    new_password: str,
) -> ChangePasswordResult:
    """Change a user's password after re-verifying the current password.

    The frontend session/localStorage is not trusted as proof of identity.
    The current password is always verified against the stored Argon2 hash
    before the new hash is sent to the Core API.
    """
    username = (username or "").strip()

    if not username:
        return ChangePasswordResult(
            False,
            "USERNAME_REQUIRED",
            "Username wajib diisi.",
        )

    if not current_password:
        return ChangePasswordResult(
            False,
            "CURRENT_PASSWORD_REQUIRED",
            "Password saat ini wajib diisi.",
        )

    is_valid, policy_code, policy_message = validate_password_policy(
        new_password
    )
    if not is_valid:
        return ChangePasswordResult(
            False,
            policy_code,
            policy_message,
        )

    try:
        response = core_api.get_user_auth(username)
        row = _first_data_row(response)
    except Exception:
        return ChangePasswordResult(
            False,
            "CHANGE_PASSWORD_ERROR",
            "Password tidak dapat diubah saat ini.",
        )

    # Keep this generic so the endpoint does not reveal whether a username exists.
    if not row or row.get("success") is False:
        return ChangePasswordResult(
            False,
            "CURRENT_PASSWORD_INVALID",
            "Username atau password saat ini tidak valid.",
        )

    if not row.get("is_active", False):
        return ChangePasswordResult(
            False,
            "USER_INACTIVE",
            "User tidak aktif.",
        )

    if bool(row.get("is_locked", False)):
        return ChangePasswordResult(
            False,
            "ACCOUNT_LOCKED",
            "Account terkunci. Hubungi administrator untuk unlock.",
        )

    user_id = row.get("user_id")
    password_hash = row.get("password_hash")

    if not user_id or not password_hash:
        return ChangePasswordResult(
            False,
            "CHANGE_PASSWORD_ERROR",
            "Password tidak dapat diubah saat ini.",
        )

    if not verify_password(current_password, password_hash):
        return ChangePasswordResult(
            False,
            "CURRENT_PASSWORD_INVALID",
            "Username atau password saat ini tidak valid.",
        )

    if verify_password(new_password, password_hash):
        return ChangePasswordResult(
            False,
            "NEW_PASSWORD_SAME",
            "Password baru harus berbeda dari password saat ini.",
        )

    try:
        new_password_hash = hash_password(new_password)
        change_response = core_api.change_user_password(
            user_id=str(user_id),
            password_hash=new_password_hash,
        )
        change_row = _first_data_row(change_response)
    except Exception:
        return ChangePasswordResult(
            False,
            "CHANGE_PASSWORD_ERROR",
            "Password tidak dapat diubah saat ini.",
        )

    if not change_row:
        return ChangePasswordResult(
            False,
            "CHANGE_PASSWORD_ERROR",
            "Core API tidak mengembalikan hasil perubahan password.",
        )

    if change_row.get("success") is False:
        return ChangePasswordResult(
            False,
            str(change_row.get("code") or "CHANGE_PASSWORD_ERROR"),
            str(
                change_row.get("message")
                or "Password tidak dapat diubah saat ini."
            ),
        )

    return ChangePasswordResult(
        True,
        str(change_row.get("code") or "PASSWORD_CHANGED"),
        str(change_row.get("message") or "Password berhasil diubah."),
    )


# =========================================================
# PASSWORD RESET / EMAIL OTP
# =========================================================

def _env_bool(name: str, default: bool = False) -> bool:
    value = str(os.getenv(name, "")).strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


def _reset_secret() -> bytes:
    secret = str(os.getenv("CORE_PASSWORD_RESET_SECRET") or "").strip()
    if len(secret) < 32:
        raise RuntimeError(
            "CORE_PASSWORD_RESET_SECRET wajib diisi minimal 32 karakter."
        )
    return secret.encode("utf-8")


def _reset_digest(purpose: str, value: str, user_id: str = "") -> str:
    message = f"{purpose}:{user_id}:{value}".encode("utf-8")
    return hmac.new(_reset_secret(), message, hashlib.sha256).hexdigest()


def _generate_otp() -> str:
    # secrets is cryptographically secure; keep leading zeroes.
    return "".join(secrets.choice("0123456789") for _ in range(6))


def _send_password_reset_email(
    *,
    recipient: str,
    display_name: str,
    code: str,
    ttl_minutes: int,
) -> None:
    # =========================================================
    # SMTP CONFIGURATION
    # =========================================================
    host = str(os.getenv("CORE_SMTP_HOST") or "").strip()
    username = str(os.getenv("CORE_SMTP_USERNAME") or "").strip()
    password = str(os.getenv("CORE_SMTP_PASSWORD") or "")
    sender = str(os.getenv("CORE_SMTP_FROM") or username).strip()

    if not host or not sender:
        raise RuntimeError(
            "SMTP belum dikonfigurasi. "
            "Isi CORE_SMTP_HOST dan CORE_SMTP_FROM."
        )

    try:
        port = int(os.getenv("CORE_SMTP_PORT") or "587")
    except ValueError:
        port = 587

    use_ssl = _env_bool("CORE_SMTP_USE_SSL", False)
    use_tls = _env_bool("CORE_SMTP_USE_TLS", not use_ssl)

    # =========================================================
    # SAFE VALUES FOR HTML
    # =========================================================
    recipient = str(recipient or "").strip()
    display_name = str(display_name or "").strip()
    code = str(code or "").strip()

    if not recipient:
        raise RuntimeError("Recipient email tidak tersedia.")

    if not display_name:
        display_name = "Core Analytics User"

    safe_name = html.escape(display_name)
    safe_code = html.escape(code)
    safe_ttl = html.escape(str(ttl_minutes))

    # =========================================================
    # CORE ANALYTICS LOGO
    #
    # auth_service.py:
    # CoreAnalyticsV2/
    # ├── voice-auth-backend/
    # │   └── app/services/auth_service.py
    # └── voice-dashboard/
    #     └── img/logowithname.png
    # =========================================================
    project_root = Path(__file__).resolve().parents[3]

    logo_path = (
        project_root
        / "voice-dashboard"
        / "img"
        / "logowithname.png"
    )

    logo_exists = logo_path.is_file()

    if logo_exists:
        logo_html = """
            <img
                src="cid:coreanalytics-logo"
                alt="Core Analytics"
                width="310"
                style="
                    display:block;
                    width:310px;
                    max-width:82%;
                    height:auto;
                    margin:0 auto;
                    border:0;
                    outline:none;
                    text-decoration:none;
                "
            >
        """
    else:
        # Fallback supaya email tetap bisa dikirim
        # jika file logo tidak ditemukan.
        logo_html = """
            <div
                style="
                    color:#e8fbff;
                    font-family:Arial,Helvetica,sans-serif;
                    font-size:24px;
                    font-weight:700;
                    letter-spacing:4px;
                    text-align:center;
                "
            >
                CORE
                <span style="color:#00d9ff;">
                    ANALYTICS
                </span>
            </div>
        """

    # =========================================================
    # EMAIL MESSAGE
    # =========================================================
    message = EmailMessage()

    message["Subject"] = (
        "Core Analytics - Password Recovery Code"
    )

    message["From"] = formataddr(
        (
            "Core Analytics Security",
            sender,
        )
    )

    message["To"] = recipient

    # =========================================================
    # PLAIN TEXT FALLBACK
    # =========================================================
    message.set_content(
        "CORE ANALYTICS // PASSWORD RECOVERY\n"
        "===================================\n\n"
        f"Halo {display_name},\n\n"
        "Kami menerima permintaan reset password "
        "untuk akun Core Analytics Anda.\n\n"
        "VERIFICATION CODE\n\n"
        f"{code}\n\n"
        f"Kode ini berlaku selama {ttl_minutes} menit.\n\n"
        "SECURITY NOTICE\n"
        "Jangan berikan kode verifikasi ini kepada "
        "siapa pun.\n"
        "Tim JEC maupun Core Analytics tidak akan "
        "pernah meminta kode verifikasi Anda.\n\n"
        "Jika Anda tidak meminta reset password, "
        "abaikan email ini.\n\n"
        "JEC // CORE ANALYTICS SECURITY\n"
        "SECURE IDENTITY GATEWAY"
    )

    # =========================================================
    # HTML EMAIL
    # =========================================================
    html_body = f"""
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >
    <meta name="color-scheme" content="dark">
    <meta
        name="supported-color-schemes"
        content="dark"
    >

    <title>
        Core Analytics Password Recovery
    </title>
</head>

<body
    style="
        margin:0;
        padding:0;
        width:100%;
        background-color:#010611;
        color:#d8f7ff;
        font-family:Arial,Helvetica,sans-serif;
    "
>

    <!-- ============================================= -->
    <!-- PREHEADER                                     -->
    <!-- ============================================= -->
    <div
        style="
            display:none;
            max-height:0;
            max-width:0;
            overflow:hidden;
            opacity:0;
            color:transparent;
            mso-hide:all;
        "
    >
        Core Analytics password recovery verification
        code: {safe_code}
    </div>

    <!-- ============================================= -->
    <!-- PAGE BACKGROUND                               -->
    <!-- ============================================= -->
    <table
        role="presentation"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        border="0"
        style="
            width:100%;
            background-color:#010611;
            margin:0;
            padding:0;
        "
    >
        <tr>
            <td
                align="center"
                style="
                    padding:42px 16px;
                "
            >

                <!-- ================================= -->
                <!-- MAIN CARD                         -->
                <!-- ================================= -->
                <table
                    role="presentation"
                    width="100%"
                    cellspacing="0"
                    cellpadding="0"
                    border="0"
                    style="
                        width:100%;
                        max-width:620px;
                        background-color:#04101c;
                        border:1px solid #0b6680;
                        border-radius:16px;
                        overflow:hidden;
                    "
                >

                    <!-- ============================= -->
                    <!-- CYAN TOP LINE                 -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            style="
                                height:4px;
                                background-color:#00d9ff;
                                font-size:0;
                                line-height:0;
                            "
                        >
                            &nbsp;
                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- HEADER / LOGO                 -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            align="center"
                            style="
                                padding:
                                    38px
                                    30px
                                    12px
                                    30px;
                            "
                        >

                            {logo_html}

                            <div
                                style="
                                    margin-top:14px;
                                    color:#5b8293;
                                    font-size:9px;
                                    line-height:1.5;
                                    font-weight:600;
                                    letter-spacing:3px;
                                    text-align:center;
                                "
                            >
                                INTELLIGENCE COMMAND GATEWAY
                            </div>

                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- SECURITY NODE STATUS          -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            align="center"
                            style="
                                padding:
                                    18px
                                    30px
                                    4px
                                    30px;
                            "
                        >

                            <table
                                role="presentation"
                                cellspacing="0"
                                cellpadding="0"
                                border="0"
                            >
                                <tr>
                                    <td
                                        style="
                                            border:
                                                1px solid
                                                #0b6680;
                                            border-radius:
                                                20px;
                                            padding:
                                                7px
                                                15px;
                                            background:
                                                #061b29;
                                            color:
                                                #00d9ff;
                                            font-size:
                                                9px;
                                            font-weight:
                                                700;
                                            letter-spacing:
                                                2px;
                                        "
                                    >
                                        &#9679;&nbsp;
                                        SECURITY NODE
                                        &nbsp;//&nbsp;
                                        EMAIL OTP
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- TITLE                         -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            align="center"
                            style="
                                padding:
                                    26px
                                    42px
                                    6px
                                    42px;
                            "
                        >

                            <div
                                style="
                                    color:#ffffff;
                                    font-size:24px;
                                    line-height:1.35;
                                    font-weight:700;
                                    text-align:center;
                                "
                            >
                                Password Recovery
                            </div>

                            <div
                                style="
                                    margin-top:8px;
                                    color:#4f7280;
                                    font-family:
                                        'Courier New',
                                        monospace;
                                    font-size:9px;
                                    line-height:1.5;
                                    letter-spacing:2px;
                                    text-align:center;
                                "
                            >
                                IDENTITY VERIFICATION
                                // AUTHORIZATION REQUIRED
                            </div>

                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- GREETING                      -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            style="
                                padding:
                                    26px
                                    42px
                                    8px
                                    42px;
                            "
                        >

                            <div
                                style="
                                    color:#9bb8c4;
                                    font-size:14px;
                                    line-height:1.8;
                                "
                            >
                                Halo
                                <strong
                                    style="
                                        color:#e8fbff;
                                        font-weight:700;
                                    "
                                >
                                    {safe_name}
                                </strong>,
                                <br><br>

                                Kami menerima permintaan
                                untuk melakukan reset
                                password akun
                                <strong
                                    style="
                                        color:#75eaff;
                                        font-weight:600;
                                    "
                                >
                                    Core Analytics
                                </strong>
                                Anda.

                                Gunakan verification code
                                berikut untuk melanjutkan
                                proses recovery.
                            </div>

                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- OTP CARD                      -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            align="center"
                            style="
                                padding:
                                    24px
                                    42px
                                    24px
                                    42px;
                            "
                        >

                            <table
                                role="presentation"
                                width="100%"
                                cellspacing="0"
                                cellpadding="0"
                                border="0"
                                style="
                                    width:100%;
                                    background-color:
                                        #061b29;
                                    border:
                                        1px solid
                                        #087997;
                                    border-radius:
                                        12px;
                                "
                            >

                                <tr>
                                    <td
                                        align="center"
                                        style="
                                            padding:
                                                25px
                                                20px
                                                7px
                                                20px;
                                        "
                                    >

                                        <div
                                            style="
                                                color:
                                                    #6b98a8;
                                                font-family:
                                                    'Courier New',
                                                    monospace;
                                                font-size:
                                                    9px;
                                                font-weight:
                                                    700;
                                                line-height:
                                                    1.5;
                                                letter-spacing:
                                                    3px;
                                            "
                                        >
                                            VERIFICATION CODE
                                        </div>

                                    </td>
                                </tr>

                                <tr>
                                    <td
                                        align="center"
                                        style="
                                            padding:
                                                8px
                                                20px;
                                        "
                                    >

                                        <div
                                            style="
                                                color:
                                                    #ffffff;
                                                font-family:
                                                    'Courier New',
                                                    monospace;
                                                font-size:
                                                    40px;
                                                line-height:
                                                    1.25;
                                                font-weight:
                                                    700;
                                                letter-spacing:
                                                    10px;
                                                text-align:
                                                    center;
                                            "
                                        >
                                            {safe_code}
                                        </div>

                                    </td>
                                </tr>

                                <tr>
                                    <td
                                        align="center"
                                        style="
                                            padding:
                                                8px
                                                20px
                                                25px
                                                20px;
                                        "
                                    >

                                        <div
                                            style="
                                                color:
                                                    #00d9ff;
                                                font-family:
                                                    'Courier New',
                                                    monospace;
                                                font-size:
                                                    9px;
                                                font-weight:
                                                    700;
                                                line-height:
                                                    1.5;
                                                letter-spacing:
                                                    2px;
                                            "
                                        >
                                            VALID FOR
                                            {safe_ttl}
                                            MINUTES
                                        </div>

                                    </td>
                                </tr>

                            </table>

                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- SECURITY NOTICE               -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            style="
                                padding:
                                    4px
                                    42px
                                    28px
                                    42px;
                            "
                        >

                            <table
                                role="presentation"
                                width="100%"
                                cellspacing="0"
                                cellpadding="0"
                                border="0"
                                style="
                                    width:100%;
                                    background-color:
                                        #10191f;
                                    border-left:
                                        3px solid
                                        #e6c84f;
                                "
                            >
                                <tr>
                                    <td
                                        style="
                                            padding:
                                                16px
                                                18px;
                                        "
                                    >

                                        <div
                                            style="
                                                color:
                                                    #e6c84f;
                                                font-family:
                                                    'Courier New',
                                                    monospace;
                                                font-size:
                                                    9px;
                                                font-weight:
                                                    700;
                                                letter-spacing:
                                                    2px;
                                            "
                                        >
                                            SECURITY NOTICE
                                        </div>

                                        <div
                                            style="
                                                margin-top:
                                                    8px;
                                                color:
                                                    #91a8b1;
                                                font-size:
                                                    12px;
                                                line-height:
                                                    1.7;
                                            "
                                        >
                                            Jangan berikan
                                            verification code
                                            ini kepada siapa pun.

                                            Tim JEC maupun
                                            Core Analytics
                                            tidak akan pernah
                                            meminta kode
                                            verifikasi Anda.
                                        </div>

                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- IGNORE MESSAGE                -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            style="
                                padding:
                                    0
                                    42px
                                    34px
                                    42px;
                            "
                        >

                            <div
                                style="
                                    color:#668491;
                                    font-size:11px;
                                    line-height:1.8;
                                "
                            >
                                Jika Anda tidak meminta
                                perubahan password,
                                abaikan email ini.

                                Tidak ada perubahan pada
                                akun Anda sampai proses
                                verifikasi berhasil
                                diselesaikan.
                            </div>

                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- SYSTEM STATUS                 -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            style="
                                padding:
                                    0
                                    42px
                                    30px
                                    42px;
                            "
                        >

                            <table
                                role="presentation"
                                width="100%"
                                cellspacing="0"
                                cellpadding="0"
                                border="0"
                                style="
                                    width:100%;
                                    border-top:
                                        1px solid
                                        #0b2938;
                                    border-bottom:
                                        1px solid
                                        #0b2938;
                                "
                            >
                                <tr>

                                    <td
                                        style="
                                            padding:
                                                14px
                                                0;
                                            color:
                                                #4f7280;
                                            font-family:
                                                'Courier New',
                                                monospace;
                                            font-size:
                                                8px;
                                            letter-spacing:
                                                1px;
                                        "
                                    >
                                        FRIDAY // SYSTEM STATUS
                                    </td>

                                    <td
                                        align="right"
                                        style="
                                            padding:
                                                14px
                                                0;
                                            color:
                                                #00d9ff;
                                            font-family:
                                                'Courier New',
                                                monospace;
                                            font-size:
                                                8px;
                                            font-weight:
                                                700;
                                            letter-spacing:
                                                1px;
                                        "
                                    >
                                        &#9679; SECURE
                                    </td>

                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- ============================= -->
                    <!-- FOOTER                        -->
                    <!-- ============================= -->
                    <tr>
                        <td
                            align="center"
                            style="
                                background-color:
                                    #030c15;
                                border-top:
                                    1px solid
                                    #0b2938;
                                padding:
                                    25px
                                    30px
                                    28px
                                    30px;
                            "
                        >

                            <div
                                style="
                                    color:#00d9ff;
                                    font-family:
                                        'Courier New',
                                        monospace;
                                    font-size:9px;
                                    font-weight:700;
                                    line-height:1.5;
                                    letter-spacing:3px;
                                "
                            >
                                JEC // CORE ANALYTICS
                                SECURITY
                            </div>

                            <div
                                style="
                                    margin-top:9px;
                                    color:#3e6372;
                                    font-family:
                                        'Courier New',
                                        monospace;
                                    font-size:8px;
                                    line-height:1.6;
                                    letter-spacing:1px;
                                "
                            >
                                SECURE IDENTITY GATEWAY
                                // AES
                            </div>

                        </td>
                    </tr>

                </table>

                <!-- ================================= -->
                <!-- OUTSIDE FOOTER                    -->
                <!-- ================================= -->
                <table
                    role="presentation"
                    width="100%"
                    cellspacing="0"
                    cellpadding="0"
                    border="0"
                    style="
                        width:100%;
                        max-width:620px;
                    "
                >
                    <tr>
                        <td
                            align="center"
                            style="
                                padding:
                                    18px
                                    20px
                                    0
                                    20px;
                                color:#365360;
                                font-size:9px;
                                line-height:1.7;
                                letter-spacing:1px;
                            "
                        >
                            This is an automated security
                            notification from Core Analytics.
                            <br>
                            Please do not reply to this email.
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>

</body>
</html>
"""

    # =========================================================
    # ADD HTML ALTERNATIVE
    # =========================================================
    message.add_alternative(
        html_body,
        subtype="html",
    )

    # =========================================================
    # EMBED CORE ANALYTICS LOGO USING CID
    # =========================================================
    if logo_exists:
        html_part = message.get_payload()[-1]

        try:
            with logo_path.open("rb") as logo_file:
                html_part.add_related(
                    logo_file.read(),
                    maintype="image",
                    subtype="png",
                    cid="<coreanalytics-logo>",
                    filename="logowithname.png",
                    disposition="inline",
                )
        except OSError as exc:
            # Logo tidak boleh menyebabkan OTP gagal dikirim.
            print(
                "PASSWORD RESET EMAIL LOGO WARNING:",
                str(exc),
            )

    # =========================================================
    # TLS CONTEXT
    #
    # Menggunakan certifi karena Python 3.13 pada environment
    # ini tidak menemukan default CA bundle dengan benar.
    # Certificate mail.jec.co.id sendiri sudah valid.
    # =========================================================
    context = ssl.create_default_context(
        cafile=certifi.where()
    )

    # =========================================================
    # SMTP SSL
    # =========================================================
    if use_ssl:
        with smtplib.SMTP_SSL(
            host,
            port,
            timeout=12,
            context=context,
        ) as smtp:

            if username:
                smtp.login(
                    username,
                    password,
                )

            smtp.send_message(message)

        return

    # =========================================================
    # SMTP + STARTTLS
    # =========================================================
    with smtplib.SMTP(
        host,
        port,
        timeout=12,
    ) as smtp:

        smtp.ehlo()

        if use_tls:
            smtp.starttls(
                context=context
            )
            smtp.ehlo()

        if username:
            smtp.login(
                username,
                password,
            )

        smtp.send_message(message)


def request_password_reset(
    identifier: str,
    *,
    ip_address: Optional[str] = None,
) -> PasswordResetResult:
    identifier = (identifier or "").strip()
    if not identifier:
        return PasswordResetResult(
            False,
            "IDENTIFIER_REQUIRED",
            "Username atau email wajib diisi.",
        )

    # Always use a generic public response for unknown/inactive/locked accounts.
    try:
        lookup = core_api.lookup_password_reset(identifier)
        user = _first_data_row(lookup)
    except Exception as exc:
        print("PASSWORD RESET LOOKUP ERROR:", exc)
        return PasswordResetResult(
            False,
            "PASSWORD_RESET_SERVICE_ERROR",
            "Layanan password recovery sedang tidak tersedia.",
        )

    if (
        not user
        or user.get("success") is False
        or not user.get("user_id")
        or not user.get("email")
        or not bool(user.get("is_active", False))
        or bool(user.get("is_locked", False))
    ):
        return PasswordResetResult(
            True,
            "RESET_REQUEST_ACCEPTED",
            PASSWORD_RESET_GENERIC_MESSAGE,
        )

    user_id = str(user.get("user_id"))
    email = str(user.get("email") or "").strip()
    display_name = str(user.get("display_name") or user.get("username") or "")

    try:
        ttl_minutes = max(
            5,
            min(30, int(os.getenv("CORE_PASSWORD_RESET_TTL_MINUTES") or "10")),
        )
        otp = _generate_otp()
        otp_hash = _reset_digest("otp", otp, user_id)

        issue_response = core_api.issue_password_reset(
            user_id=user_id,
            token_hash=otp_hash,
            ip_address=ip_address,
            ttl_minutes=ttl_minutes,
            max_requests=3,
            window_minutes=15,
        )
        issue_row = _first_data_row(issue_response)

        if not issue_row:
            raise RuntimeError("Core API tidak mengembalikan reset challenge.")

        # Rate-limit response remains generic to the browser.
        if issue_row.get("success") is False:
            if str(issue_row.get("code") or "") == "RESET_RATE_LIMITED":
                return PasswordResetResult(
                    True,
                    "RESET_REQUEST_ACCEPTED",
                    PASSWORD_RESET_GENERIC_MESSAGE,
                )
            raise RuntimeError(
                str(issue_row.get("message") or "Reset challenge gagal dibuat.")
            )

        reset_id = str(issue_row.get("reset_token_id") or "")

        try:
            _send_password_reset_email(
                recipient=email,
                display_name=display_name,
                code=otp,
                ttl_minutes=ttl_minutes,
            )
        except Exception:
            if reset_id:
                try:
                    core_api.revoke_password_reset(reset_token_id=reset_id)
                except Exception:
                    pass
            raise

        return PasswordResetResult(
            True,
            "RESET_REQUEST_ACCEPTED",
            PASSWORD_RESET_GENERIC_MESSAGE,
        )
    except Exception as exc:
        print("PASSWORD RESET REQUEST ERROR:", exc)
        return PasswordResetResult(
            False,
            "PASSWORD_RESET_SERVICE_ERROR",
            "Kode verifikasi tidak dapat dikirim saat ini.",
        )


def verify_password_reset_code(
    identifier: str,
    code: str,
) -> PasswordResetResult:
    identifier = (identifier or "").strip()
    code = "".join(ch for ch in str(code or "") if ch.isdigit())

    if not identifier:
        return PasswordResetResult(
            False,
            "IDENTIFIER_REQUIRED",
            "Username atau email wajib diisi.",
        )
    if len(code) != 6:
        return PasswordResetResult(
            False,
            "RESET_CODE_INVALID",
            "Kode verifikasi tidak valid.",
        )

    try:
        lookup = core_api.lookup_password_reset(identifier)
        user = _first_data_row(lookup)
    except Exception:
        user = None

    if (
        not user
        or user.get("success") is False
        or not user.get("user_id")
        or not bool(user.get("is_active", False))
        or bool(user.get("is_locked", False))
    ):
        return PasswordResetResult(
            False,
            "RESET_CODE_INVALID",
            "Kode verifikasi tidak valid atau sudah kedaluwarsa.",
        )

    user_id = str(user.get("user_id"))

    try:
        otp_hash = _reset_digest("otp", code, user_id)
        raw_reset_token = secrets.token_urlsafe(32)
        reset_token_hash = _reset_digest("reset", raw_reset_token)

        verify_response = core_api.verify_password_reset(
            user_id=user_id,
            token_hash=otp_hash,
            reset_token_hash=reset_token_hash,
            max_attempts=5,
        )
        row = _first_data_row(verify_response)
    except Exception as exc:
        print("PASSWORD RESET VERIFY ERROR:", exc)
        return PasswordResetResult(
            False,
            "PASSWORD_RESET_SERVICE_ERROR",
            "Kode verifikasi tidak dapat diperiksa saat ini.",
        )

    if not row or row.get("success") is False:
        code_value = str((row or {}).get("code") or "RESET_CODE_INVALID")
        message = str(
            (row or {}).get("message")
            or "Kode verifikasi tidak valid atau sudah kedaluwarsa."
        )
        return PasswordResetResult(False, code_value, message)

    return PasswordResetResult(
        True,
        "RESET_CODE_VERIFIED",
        "Kode verifikasi valid.",
        reset_token=raw_reset_token,
    )


def reset_password_with_token(
    reset_token: str,
    new_password: str,
) -> PasswordResetResult:
    reset_token = str(reset_token or "").strip()
    if not reset_token:
        return PasswordResetResult(
            False,
            "RESET_TOKEN_REQUIRED",
            "Reset token wajib diisi.",
        )

    is_valid, policy_code, policy_message = validate_password_policy(new_password)
    if not is_valid:
        return PasswordResetResult(False, policy_code, policy_message)

    try:
        reset_token_hash = _reset_digest("reset", reset_token)
        new_password_hash = hash_password(new_password)
        response = core_api.apply_password_reset(
            reset_token_hash=reset_token_hash,
            password_hash=new_password_hash,
        )
        row = _first_data_row(response)
    except Exception as exc:
        print("PASSWORD RESET APPLY ERROR:", exc)
        return PasswordResetResult(
            False,
            "PASSWORD_RESET_SERVICE_ERROR",
            "Password tidak dapat direset saat ini.",
        )

    if not row or row.get("success") is False:
        return PasswordResetResult(
            False,
            str((row or {}).get("code") or "RESET_TOKEN_INVALID"),
            str(
                (row or {}).get("message")
                or "Reset token tidak valid atau sudah kedaluwarsa."
            ),
        )

    return PasswordResetResult(
        True,
        "PASSWORD_RESET_SUCCESS",
        "Password berhasil direset. Silakan login menggunakan password baru.",
    )
