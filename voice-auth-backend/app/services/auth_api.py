from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.services.auth_service import (
    change_password,
    login_with_password,
    request_password_reset,
    reset_password_with_token,
    verify_password_reset_code,
)


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

@auth_bp.route("/change-password", methods=["POST"])
def password_change():
    body = request.get_json(silent=True) or {}

    username = str(body.get("username") or "").strip()
    current_password = str(body.get("current_password") or "")
    new_password = str(body.get("new_password") or "")

    result = change_password(
        username,
        current_password,
        new_password,
    )

    payload = {
        "success": result.success,
        "code": result.code,
        "message": result.message,
    }

    if result.success:
        return jsonify(payload), 200

    if result.code == "ACCOUNT_LOCKED":
        return jsonify(payload), 423

    if result.code == "USER_INACTIVE":
        return jsonify(payload), 403

    if result.code == "CURRENT_PASSWORD_INVALID":
        return jsonify(payload), 401

    if result.code in {
        "USERNAME_REQUIRED",
        "CURRENT_PASSWORD_REQUIRED",
        "PASSWORD_REQUIRED",
        "PASSWORD_TOO_SHORT",
        "PASSWORD_TOO_LONG",
        "PASSWORD_UPPERCASE_REQUIRED",
        "PASSWORD_LOWERCASE_REQUIRED",
        "PASSWORD_NUMBER_REQUIRED",
        "PASSWORD_SPECIAL_REQUIRED",
        "NEW_PASSWORD_SAME",
    }:
        return jsonify(payload), 400

    return jsonify(payload), 500



@auth_bp.route("/forgot-password/request", methods=["POST"])
def forgot_password_request():
    body = request.get_json(silent=True) or {}
    identifier = str(body.get("identifier") or "").strip()

    result = request_password_reset(
        identifier,
        ip_address=_client_ip(),
    )

    payload = {
        "success": result.success,
        "code": result.code,
        "message": result.message,
    }

    if result.success:
        return jsonify(payload), 200
    if result.code == "IDENTIFIER_REQUIRED":
        return jsonify(payload), 400
    return jsonify(payload), 503


@auth_bp.route("/forgot-password/verify", methods=["POST"])
def forgot_password_verify():
    body = request.get_json(silent=True) or {}
    identifier = str(body.get("identifier") or "").strip()
    code = str(body.get("code") or "").strip()

    result = verify_password_reset_code(identifier, code)

    payload = {
        "success": result.success,
        "code": result.code,
        "message": result.message,
        "reset_token": result.reset_token,
    }

    if result.success:
        return jsonify(payload), 200
    if result.code in {"IDENTIFIER_REQUIRED", "RESET_CODE_INVALID"}:
        return jsonify(payload), 400
    if result.code in {"RESET_CODE_EXPIRED", "RESET_ATTEMPTS_EXCEEDED"}:
        return jsonify(payload), 410
    return jsonify(payload), 503


@auth_bp.route("/forgot-password/reset", methods=["POST"])
def forgot_password_reset():
    body = request.get_json(silent=True) or {}
    reset_token = str(body.get("reset_token") or "").strip()
    new_password = str(body.get("new_password") or "")

    result = reset_password_with_token(reset_token, new_password)

    payload = {
        "success": result.success,
        "code": result.code,
        "message": result.message,
    }

    if result.success:
        return jsonify(payload), 200

    if result.code in {
        "RESET_TOKEN_REQUIRED",
        "PASSWORD_REQUIRED",
        "PASSWORD_TOO_SHORT",
        "PASSWORD_TOO_LONG",
        "PASSWORD_UPPERCASE_REQUIRED",
        "PASSWORD_LOWERCASE_REQUIRED",
        "PASSWORD_NUMBER_REQUIRED",
        "PASSWORD_SPECIAL_REQUIRED",
    }:
        return jsonify(payload), 400

    if result.code in {
        "RESET_TOKEN_INVALID",
        "RESET_TOKEN_EXPIRED",
        "RESET_TOKEN_USED",
    }:
        return jsonify(payload), 410

    if result.code == "ACCOUNT_LOCKED":
        return jsonify(payload), 423
    if result.code == "USER_INACTIVE":
        return jsonify(payload), 403

    return jsonify(payload), 503
