from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from flask import Blueprint, jsonify, request

from app.clients.core_api_client import core_api
from app.services.duplicate_voice_guard import VoiceDuplicateError
from app.services.enrollment_service import enrollment_service

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


def _first_data_row(response: Any) -> dict[str, Any] | None:
    if not isinstance(response, dict):
        return None

    data = response.get("data")
    if isinstance(data, list):
        if data and isinstance(data[0], dict):
            return data[0]
        return None
    if isinstance(data, dict):
        return data
    return None


def _self_service_login(username: str, current_password: str):
    return login_with_password(
        username,
        current_password,
        ip_address=_client_ip(),
        user_agent=(
            str(request.headers.get("User-Agent") or "")[:1000]
            or None
        ),
    )


def _credential_error_response(result):
    payload = {
        "success": False,
        "code": result.code,
        "message": result.message,
    }
    if result.code == "ACCOUNT_LOCKED":
        return jsonify(payload), 423
    if result.code == "USER_INACTIVE":
        return jsonify(payload), 403
    if result.code in {"INVALID_CREDENTIALS", "PASSWORD_HASH_NOT_FOUND"}:
        return jsonify(payload), 401
    if result.code in {"USERNAME_REQUIRED", "PASSWORD_REQUIRED"}:
        return jsonify(payload), 400
    return jsonify(payload), 503


def _safe_voice_profile(user_id: str) -> dict[str, Any] | None:
    result = core_api.get_voice_profile(str(user_id))
    row = _first_data_row(result)
    if not row:
        return None
    if row.get("success") is False:
        code = str(row.get("code") or "")
        if code in {"VOICE_PROFILE_NOT_FOUND", "NOT_FOUND", "NO_DATA"}:
            return None
        raise RuntimeError(str(row.get("message") or "Voice profile tidak dapat dibaca."))

    safe = dict(row)
    safe.pop("centroid_embedding_base64", None)
    safe.pop("embedding_base64", None)
    return safe


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


# =============================================================
# SELF-SERVICE VOICE PROFILE
# Browser identity is re-verified with the current password.
# =============================================================
@auth_bp.route("/voice-profile-self", methods=["POST"])
def voice_profile_self():
    body = request.get_json(silent=True) or {}
    username = str(body.get("username") or "").strip()
    current_password = str(body.get("current_password") or "")

    verified = _self_service_login(username, current_password)
    if not verified.success or not verified.user:
        return _credential_error_response(verified)

    try:
        profile = _safe_voice_profile(str(verified.user["user_id"]))
        return jsonify({
            "success": True,
            "code": "VOICE_PROFILE_READ",
            "message": "Voice profile berhasil dibaca.",
            "voice_profile": profile,
        }), 200
    except Exception:
        return jsonify({
            "success": False,
            "code": "VOICE_PROFILE_GET_ERROR",
            "message": "Voice profile tidak dapat dibaca saat ini.",
        }), 503


@auth_bp.route("/voice-enroll-self", methods=["POST"])
def voice_enroll_self():
    username = str(request.form.get("username") or "").strip()
    current_password = str(request.form.get("current_password") or "")
    files = request.files.getlist("samples")

    verified = _self_service_login(username, current_password)
    if not verified.success or not verified.user:
        return _credential_error_response(verified)

    if len(files) != 5:
        return jsonify({
            "success": False,
            "code": "EXACTLY_5_SAMPLES_REQUIRED",
            "message": "Enrollment self-service membutuhkan tepat 5 sample suara.",
        }), 400

    user_id = str(verified.user["user_id"])

    try:
        existing = _safe_voice_profile(user_id)
    except Exception:
        return jsonify({
            "success": False,
            "code": "VOICE_PROFILE_GET_ERROR",
            "message": "Status voice profile tidak dapat diperiksa saat ini.",
        }), 503

    if existing and existing.get("voice_profile_id"):
        return jsonify({
            "success": False,
            "code": "VOICE_PROFILE_ALREADY_EXISTS",
            "message": (
                "Voice profile aktif sudah tersedia. "
                "Self-service re-enrollment belum diaktifkan."
            ),
        }), 409

    temp_paths: list[str] = []

    try:
        for index, audio_file in enumerate(files, start=1):
            original_name = audio_file.filename or f"sample_{index}.webm"
            suffix = Path(original_name).suffix or ".webm"
            fd, temp_path = tempfile.mkstemp(
                prefix=f"core_self_enroll_{index:03d}_",
                suffix=suffix,
            )
            os.close(fd)
            audio_file.save(temp_path)
            temp_paths.append(temp_path)

        result = enrollment_service.enroll_from_files(
            user_id=user_id,
            audio_paths=temp_paths,
        )

        if not isinstance(result, dict):
            result = {
                "success": True,
                "code": "VOICE_ENROLLED",
                "message": "Voice profile berhasil didaftarkan.",
            }

        if result.get("success") is False:
            return jsonify(result), 400

        try:
            profile = _safe_voice_profile(user_id)
        except Exception:
            profile = None

        payload = dict(result)
        payload["success"] = True
        payload["voice_profile"] = profile
        return jsonify(payload), 200

    except VoiceDuplicateError:
        # Do not expose another user's identity in self-service responses.
        return jsonify({
            "success": False,
            "code": "VOICE_ALREADY_REGISTERED",
            "message": "Voice identity terdeteksi sudah terdaftar pada account lain.",
        }), 409
    except ValueError as exc:
        return jsonify({
            "success": False,
            "code": "VOICE_ENROLL_INVALID",
            "message": str(exc),
        }), 400
    except Exception:
        return jsonify({
            "success": False,
            "code": "VOICE_ENROLL_ERROR",
            "message": "Voice enrollment tidak dapat diproses saat ini.",
        }), 500
    finally:
        for temp_path in temp_paths:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except Exception:
                pass





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
