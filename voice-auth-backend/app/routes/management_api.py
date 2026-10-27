from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Any

from flask import (
    Blueprint,
    jsonify,
    request,
)

from app.clients.core_api_client import (
    core_api,
)
from app.services.duplicate_voice_guard import (
    VoiceDuplicateError,
)
from app.services.enrollment_service import (
    enrollment_service,
)
from app.services.password_service import (
    hash_password,
)


management_bp = Blueprint(
    "management",
    __name__,
    url_prefix="/api/management",
)


def _data_rows(
    response: Any,
) -> list[dict[str, Any]]:
    if not isinstance(
        response,
        dict,
    ):
        return []

    data = response.get("data")

    if isinstance(data, list):
        return [
            row
            for row in data
            if isinstance(row, dict)
        ]

    if isinstance(data, dict):
        return [data]

    return []


def _first_data_row(
    response: Any,
) -> dict[str, Any] | None:
    if not isinstance(
        response,
        dict,
    ):
        return None

    data = response.get("data")

    if isinstance(data, list):
        if (
            data
            and isinstance(
                data[0],
                dict,
            )
        ):
            return data[0]

        return None

    if isinstance(data, dict):
        return data

    return None


# =============================================================
# USER DIRECTORY
# GET /api/management/users
#
# Query:
#   page=1
#   page_size=20
#   search=
#   status=all|active|inactive
# =============================================================
@management_bp.route(
    "/users",
    methods=["GET"],
)
def list_users():
    try:
        try:
            page = max(
                1,
                int(
                    request.args.get(
                        "page",
                        "1",
                    )
                ),
            )
        except (TypeError, ValueError):
            page = 1

        try:
            page_size = int(
                request.args.get(
                    "page_size",
                    "20",
                )
            )
        except (TypeError, ValueError):
            page_size = 20

        page_size = min(
            100,
            max(
                1,
                page_size,
            ),
        )

        search = str(
            request.args.get(
                "search",
                "",
            )
            or ""
        ).strip()

        status = str(
            request.args.get(
                "status",
                "all",
            )
            or "all"
        ).strip().lower()

        if status not in {
            "all",
            "active",
            "inactive",
        }:
            return jsonify({
                "success": False,
                "code": "INVALID_STATUS_FILTER",
                "message": (
                    "Status harus all, active, "
                    "atau inactive."
                ),
            }), 400

        result = (
            core_api.list_users(
                page=page,
                page_size=page_size,
                search=search,
                status=status,
            )
        )

        rows = _data_rows(
            result
        )

        if not rows:
            return jsonify({
                "success": True,
                "page": page,
                "page_size": page_size,
                "total_items": 0,
                "total_pages": 0,
                "summary": {
                    "total_users": 0,
                    "active_users": 0,
                    "inactive_users": 0,
                    "voice_enrolled": 0,
                },
                "items": [],
            }), 200

        metadata = rows[0]

        items: list[
            dict[str, Any]
        ] = []

        for row in rows:
            user_id = row.get(
                "user_id"
            )

            # SQL can return a metadata-only row for an empty filter.
            if not user_id:
                continue

            items.append({
                "user_id":
                    user_id,
                "username":
                    row.get("username"),
                "display_name":
                    row.get(
                        "display_name"
                    ),
                "email":
                    row.get(
                        "email"
                    ),
                "is_active":
                    bool(
                        row.get(
                            "is_active"
                        )
                    ),
                "created_at":
                    row.get(
                        "created_at"
                    ),
                "updated_at":
                    row.get(
                        "updated_at"
                    ),
                "voice_enrolled":
                    bool(
                        row.get(
                            "voice_enrolled"
                        )
                    ),
                "voice_profile_id":
                    row.get(
                        "voice_profile_id"
                    ),
                "voice_sample_count":
                    row.get(
                        "voice_sample_count"
                    ),
                "voice_threshold":
                    row.get(
                        "voice_threshold"
                    ),
                "voice_model_name":
                    row.get(
                        "voice_model_name"
                    ),
                "voice_model_version":
                    row.get(
                        "voice_model_version"
                    ),
            })

        return jsonify({
            "success": True,
            "page":
                int(
                    metadata.get(
                        "page"
                    )
                    or page
                ),
            "page_size":
                int(
                    metadata.get(
                        "page_size"
                    )
                    or page_size
                ),
            "total_items":
                int(
                    metadata.get(
                        "total_items"
                    )
                    or 0
                ),
            "total_pages":
                int(
                    metadata.get(
                        "total_pages"
                    )
                    or 0
                ),
            "summary": {
                "total_users":
                    int(
                        metadata.get(
                            "summary_total_users"
                        )
                        or 0
                    ),
                "active_users":
                    int(
                        metadata.get(
                            "summary_active_users"
                        )
                        or 0
                    ),
                "inactive_users":
                    int(
                        metadata.get(
                            "summary_inactive_users"
                        )
                        or 0
                    ),
                "voice_enrolled":
                    int(
                        metadata.get(
                            "summary_voice_enrolled"
                        )
                        or 0
                    ),
            },
            "items":
                items,
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code":
                "USER_LIST_ERROR",
            "message":
                str(exc),
        }), 500


# =============================================================
# USER ACTIVE / INACTIVE
# PATCH /api/management/users/<user_id>/status
#
# JSON:
#   {"is_active": true}
# =============================================================
@management_bp.route(
    "/users/<user_id>/status",
    methods=["PATCH"],
)
def set_user_status(
    user_id: str,
):
    body = (
        request.get_json(
            silent=True
        )
        or {}
    )

    if "is_active" not in body:
        return jsonify({
            "success": False,
            "code":
                "IS_ACTIVE_REQUIRED",
            "message":
                "is_active wajib diisi.",
        }), 400

    raw_value = body.get(
        "is_active"
    )

    if isinstance(
        raw_value,
        bool,
    ):
        is_active = raw_value
    elif raw_value in (
        0,
        1,
        "0",
        "1",
    ):
        is_active = (
            str(raw_value)
            == "1"
        )
    else:
        return jsonify({
            "success": False,
            "code":
                "INVALID_IS_ACTIVE",
            "message":
                (
                    "is_active harus "
                    "boolean."
                ),
        }), 400

    try:
        result = (
            core_api
            .set_user_active(
                user_id=user_id,
                is_active=is_active,
            )
        )

        row = _first_data_row(
            result
        )

        if not row:
            return jsonify({
                "success": False,
                "code":
                    "INVALID_CORE_RESPONSE",
                "message":
                    (
                        "Core API tidak "
                        "mengembalikan data."
                    ),
            }), 502

        if row.get(
            "success"
        ) is False:
            code = str(
                row.get("code")
                or ""
            )

            status_code = (
                404
                if code
                == "USER_NOT_FOUND"
                else 400
            )

            return jsonify(
                row
            ), status_code

        return jsonify({
            "success": True,
            "code":
                row.get(
                    "code"
                ),
            "message":
                row.get(
                    "message"
                ),
            "user": {
                "user_id":
                    row.get(
                        "user_id"
                    ),
                "username":
                    row.get(
                        "username"
                    ),
                "display_name":
                    row.get(
                        "display_name"
                    ),
                "email":
                    row.get(
                        "email"
                    ),
                "is_active":
                    bool(
                        row.get(
                            "is_active"
                        )
                    ),
                "created_at":
                    row.get(
                        "created_at"
                    ),
                "updated_at":
                    row.get(
                        "updated_at"
                    ),
            },
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code":
                "USER_STATUS_UPDATE_ERROR",
            "message":
                str(exc),
        }), 500


# =============================================================
# USER REGISTER
# POST /api/management/users/register
# =============================================================
@management_bp.route(
    "/users/register",
    methods=["POST"],
)
def register_user():
    body = (
        request.get_json(
            silent=True
        )
        or {}
    )

    username = str(
        body.get("username")
        or ""
    ).strip()

    display_name = str(
        body.get("display_name")
        or ""
    ).strip()

    email = str(
        body.get("email")
        or ""
    ).strip()

    password = str(
        body.get("password")
        or ""
    )

    if not username:
        return jsonify({
            "success": False,
            "code":
                "USERNAME_REQUIRED",
            "message":
                "Username wajib diisi.",
        }), 400

    if not display_name:
        return jsonify({
            "success": False,
            "code":
                "DISPLAY_NAME_REQUIRED",
            "message":
                "Display name wajib diisi.",
        }), 400

    if not email:
        return jsonify({
            "success": False,
            "code":
                "EMAIL_REQUIRED",
            "message":
                "Email wajib diisi.",
        }), 400

    if (
        len(email) > 320
        or re.fullmatch(
            r"[^\s@]+@[^\s@]+\.[^\s@]+",
            email,
        ) is None
    ):
        return jsonify({
            "success": False,
            "code":
                "EMAIL_INVALID",
            "message":
                "Format email tidak valid.",
        }), 400

    if len(password) < 8:
        return jsonify({
            "success": False,
            "code":
                "PASSWORD_TOO_SHORT",
            "message":
                "Password minimal 8 karakter.",
        }), 400

    try:
        password_hash = (
            hash_password(
                password
            )
        )

        result = (
            core_api
            .register_user(
                username=username,
                display_name=(
                    display_name
                ),
                email=email,
                password_hash=(
                    password_hash
                ),
            )
        )

        row = _first_data_row(
            result
        )

        if not row:
            return jsonify({
                "success": False,
                "code":
                    "INVALID_CORE_RESPONSE",
                "message":
                    (
                        "Core API tidak "
                        "mengembalikan data user."
                    ),
            }), 502

        if row.get("success") is False:
            return jsonify(
                row
            ), 400

        # IMPORTANT:
        # Never expose password_hash to React.
        return jsonify({
            "success": True,
            "code":
                row.get(
                    "code",
                    "USER_REGISTERED",
                ),
            "message":
                row.get(
                    "message",
                    (
                        "User berhasil "
                        "didaftarkan."
                    ),
                ),
            "user": {
                "user_id":
                    row.get("user_id"),
                "username":
                    row.get("username"),
                "display_name":
                    row.get(
                        "display_name"
                    ),
                "email":
                    row.get(
                        "email"
                    ),
                "is_active":
                    row.get(
                        "is_active"
                    ),
            },
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code":
                "USER_REGISTER_ERROR",
            "message":
                str(exc),
        }), 500


# =============================================================
# VOICE ENROLLMENT
# POST /api/management/voice/enroll
#
# multipart/form-data:
#   user_id
#   samples = 5 audio files
# =============================================================
@management_bp.route(
    "/voice/enroll",
    methods=["POST"],
)
def enroll_voice():
    user_id = str(
        request.form.get(
            "user_id"
        )
        or ""
    ).strip()

    files = (
        request.files
        .getlist("samples")
    )

    if not user_id:
        return jsonify({
            "success": False,
            "code":
                "USER_ID_REQUIRED",
            "message":
                "User ID wajib diisi.",
        }), 400

    if len(files) < 5:
        return jsonify({
            "success": False,
            "code":
                "MINIMUM_5_SAMPLES",
            "message":
                (
                    "Minimal 5 sample "
                    "suara diperlukan."
                ),
        }), 400

    temp_paths: list[str] = []

    try:
        # Save browser blobs temporarily.
        for index, audio_file in enumerate(
            files,
            start=1,
        ):
            original_name = (
                audio_file.filename
                or (
                    f"sample_"
                    f"{index}.webm"
                )
            )

            suffix = (
                Path(
                    original_name
                ).suffix
                or ".webm"
            )

            fd, temp_path = (
                tempfile.mkstemp(
                    prefix=(
                        "core_ui_enroll_"
                        f"{index:03d}_"
                    ),
                    suffix=suffix,
                )
            )

            os.close(fd)

            audio_file.save(
                temp_path
            )

            temp_paths.append(
                temp_path
            )

        result = (
            enrollment_service
            .enroll_from_files(
                user_id=user_id,
                audio_paths=temp_paths,
            )
        )

        return jsonify(
            result
        ), 200

    # =========================================================
    # DUPLICATE VOICE
    #
    # This MUST be before generic Exception.
    # =========================================================
    except VoiceDuplicateError as exc:
        return jsonify({
            "success": False,
            "code":
                "VOICE_ALREADY_REGISTERED",
            "message":
                (
                    "Voice identity sudah "
                    "terdaftar pada account lain."
                ),
            # Useful for Admin Center.
            # If you later expose this endpoint outside admin,
            # you may remove conflict details.
            "conflict":
                exc.conflict,
        }), 409

    except ValueError as exc:
        return jsonify({
            "success": False,
            "code":
                "VOICE_ENROLL_INVALID",
            "message":
                str(exc),
        }), 400

    except Exception as exc:
        return jsonify({
            "success": False,
            "code":
                "VOICE_ENROLL_ERROR",
            "message":
                str(exc),
        }), 500

    finally:
        # Browser upload temporary files.
        # Permanent enrollment WAVs are already copied
        # by voice_storage into storage/voice/...
        for temp_path in temp_paths:
            try:
                Path(
                    temp_path
                ).unlink(
                    missing_ok=True
                )
            except Exception:
                pass


# =============================================================
# GET ACTIVE VOICE PROFILE FOR ONE USER
# GET /api/management/users/<user_id>/voice-profile
# =============================================================
@management_bp.route(
    "/users/<user_id>/voice-profile",
    methods=["GET"],
)
def get_voice_profile(
    user_id: str,
):
    try:
        result = (
            core_api
            .get_voice_profile(
                user_id
            )
        )

        row = _first_data_row(
            result
        )

        if not row:
            return jsonify({
                "success": True,
                "voice_profile": None,
            }), 200

        if row.get(
            "success"
        ) is False:
            return jsonify(
                row
            ), 400

        # Embedding is backend-only.
        row.pop(
            "centroid_embedding_base64",
            None,
        )

        return jsonify({
            "success": True,
            "voice_profile":
                row,
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code":
                "VOICE_PROFILE_GET_ERROR",
            "message":
                str(exc),
        }), 500
