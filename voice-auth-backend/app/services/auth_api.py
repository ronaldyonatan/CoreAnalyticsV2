from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.services.auth_service import login_with_password


auth_bp = Blueprint(
    "auth",
    __name__,
    url_prefix="/api/auth",
)


def _client_ip() -> str | None:
    # Backend is expected to be reached through the trusted Nginx container.
    forwarded = str(
        request.headers.get("X-Forwarded-For")
        or ""
    ).strip()

    if forwarded:
        return forwarded.split(",", 1)[0].strip() or None

    return request.remote_addr


@auth_bp.route("/login", methods=["POST"])
def password_login():
    body = request.get_json(silent=True) or {}

    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")

    result = login_with_password(
        username,
        password,
        ip_address=_client_ip(),
        user_agent=(
            str(request.headers.get("User-Agent") or "")[:1000]
            or None
        ),
    )

    payload = {
        "success": result.success,
        "code": result.code,
        "message": result.message,
        "user": result.user,
        "access": result.access,
        "failed_login_count": result.failed_login_count,
        "is_locked": result.is_locked,
    }

    if result.success:
        return jsonify(payload), 200

    if result.code == "ACCOUNT_LOCKED":
        return jsonify(payload), 423

    if result.code == "USER_INACTIVE":
        return jsonify(payload), 403

    if result.code in {
        "USERNAME_REQUIRED",
        "PASSWORD_REQUIRED",
    }:
        return jsonify(payload), 400

    return jsonify(payload), 401
