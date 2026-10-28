from __future__ import annotations

import json
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
    validate_password_policy,
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
                "is_locked":
                    bool(
                        row.get(
                            "is_locked"
                        )
                    ),
                "failed_login_count":
                    int(
                        row.get(
                            "failed_login_count"
                        )
                        or 0
                    ),
                "locked_at":
                    row.get(
                        "locked_at"
                    ),
                "lock_reason":
                    row.get(
                        "lock_reason"
                    ),
                "last_failed_login_at":
                    row.get(
                        "last_failed_login_at"
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
# USER PROFILE UPDATE
# PATCH /api/management/users/<user_id>/profile
#
# JSON:
#   {"display_name": "...", "email": "..."}
# Username and UserID intentionally remain immutable in this endpoint.
# =============================================================
@management_bp.route(
    "/users/<user_id>/profile",
    methods=["PATCH"],
)
def update_user_profile(
    user_id: str,
):
    body = request.get_json(silent=True) or {}

    display_name = str(
        body.get("display_name") or ""
    ).strip()
    email = str(
        body.get("email") or ""
    ).strip()

    if not display_name:
        return jsonify({
            "success": False,
            "code": "DISPLAY_NAME_REQUIRED",
            "message": "Display name wajib diisi.",
        }), 400

    if len(display_name) > 200:
        return jsonify({
            "success": False,
            "code": "DISPLAY_NAME_TOO_LONG",
            "message": "Display name maksimal 200 karakter.",
        }), 400

    if not email:
        return jsonify({
            "success": False,
            "code": "EMAIL_REQUIRED",
            "message": "Email wajib diisi.",
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
            "code": "EMAIL_INVALID",
            "message": "Format email tidak valid.",
        }), 400

    try:
        result = core_api.update_user_profile(
            user_id=user_id,
            display_name=display_name,
            email=email,
        )
        row = _first_data_row(result)

        if not row:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": "Core API tidak mengembalikan data user.",
            }), 502

        if row.get("success") is False:
            code = str(row.get("code") or "")
            if code == "USER_NOT_FOUND":
                status_code = 404
            elif code in {"EMAIL_EXISTS", "USER_DUPLICATE"}:
                status_code = 409
            else:
                status_code = 400
            return jsonify(row), status_code

        return jsonify({
            "success": True,
            "code": row.get("code", "USER_UPDATED"),
            "message": row.get(
                "message",
                "Profil user berhasil diperbarui.",
            ),
            "user": {
                "user_id": row.get("user_id"),
                "username": row.get("username"),
                "display_name": row.get("display_name"),
                "email": row.get("email"),
                "is_active": bool(row.get("is_active")),
                "is_locked": bool(row.get("is_locked")),
                "failed_login_count": int(
                    row.get("failed_login_count") or 0
                ),
                "locked_at": row.get("locked_at"),
                "lock_reason": row.get("lock_reason"),
                "last_failed_login_at": row.get(
                    "last_failed_login_at"
                ),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            },
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "USER_UPDATE_ERROR",
            "message": str(exc),
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
                "is_locked":
                    bool(
                        row.get(
                            "is_locked"
                        )
                    ),
                "failed_login_count":
                    int(
                        row.get(
                            "failed_login_count"
                        )
                        or 0
                    ),
                "locked_at":
                    row.get(
                        "locked_at"
                    ),
                "lock_reason":
                    row.get(
                        "lock_reason"
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
# USER UNLOCK
# POST /api/management/users/<user_id>/unlock
#
# This endpoint belongs to Management Center. When session/RBAC
# is enabled, protect it with the administrator permission.
# =============================================================
@management_bp.route(
    "/users/<user_id>/unlock",
    methods=["POST"],
)
def unlock_user(
    user_id: str,
):
    try:
        result = core_api.unlock_user(
            user_id=user_id,
        )
        row = _first_data_row(result)

        if not row:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": "Core API tidak mengembalikan data.",
            }), 502

        if row.get("success") is False:
            code = str(row.get("code") or "")
            return jsonify(row), (
                404 if code == "USER_NOT_FOUND" else 400
            )

        return jsonify({
            "success": True,
            "code": row.get("code", "USER_UNLOCKED"),
            "message": row.get(
                "message",
                "Account berhasil di-unlock.",
            ),
            "user": {
                "user_id": row.get("user_id"),
                "username": row.get("username"),
                "display_name": row.get("display_name"),
                "email": row.get("email"),
                "is_active": bool(row.get("is_active")),
                "is_locked": bool(row.get("is_locked")),
                "failed_login_count": int(
                    row.get("failed_login_count") or 0
                ),
                "locked_at": row.get("locked_at"),
                "lock_reason": row.get("lock_reason"),
            },
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "USER_UNLOCK_ERROR",
            "message": str(exc),
        }), 500


# =============================================================
# USER GROUP ACCESS
# GET /api/management/users/<user_id>/groups
# PUT /api/management/users/<user_id>/groups
# GET /api/management/users/<user_id>/access
# =============================================================
@management_bp.route(
    "/users/<user_id>/groups",
    methods=["GET"],
)
def get_user_groups(
    user_id: str,
):
    try:
        rows = _data_rows(
            core_api.get_user_groups(user_id)
        )

        if rows and rows[0].get("success") is False:
            first = rows[0]
            code = str(first.get("code") or "")
            return jsonify(first), (
                404 if code == "USER_NOT_FOUND" else 400
            )

        items: list[dict[str, Any]] = []
        for row in rows:
            if not row.get("group_id"):
                continue

            items.append({
                "group_id": row.get("group_id"),
                "group_code": row.get("group_code"),
                "group_name": row.get("group_name"),
                "description": row.get("description"),
                "is_active": bool(row.get("is_active")),
                "is_assigned": bool(row.get("is_assigned")),
            })

        return jsonify({
            "success": True,
            "user_id": user_id,
            "items": items,
            "assigned_count": sum(
                1 for item in items
                if item["is_assigned"]
            ),
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "USER_GROUP_GET_ERROR",
            "message": str(exc),
            "items": [],
        }), 500


@management_bp.route(
    "/users/<user_id>/groups",
    methods=["PUT"],
)
def save_user_groups(
    user_id: str,
):
    body = request.get_json(silent=True) or {}

    if "group_ids" not in body:
        return jsonify({
            "success": False,
            "code": "GROUP_IDS_REQUIRED",
            "message": "group_ids wajib dikirim dalam bentuk array.",
        }), 400

    raw_group_ids = body.get("group_ids")
    if not isinstance(raw_group_ids, list):
        return jsonify({
            "success": False,
            "code": "INVALID_GROUP_IDS",
            "message": "group_ids harus berupa array.",
        }), 400

    group_ids: list[str] = []
    for value in raw_group_ids:
        group_id = str(value or "").strip()
        if not group_id:
            return jsonify({
                "success": False,
                "code": "INVALID_GROUP_ID",
                "message": (
                    "group_ids tidak boleh berisi nilai kosong."
                ),
            }), 400

        if group_id not in group_ids:
            group_ids.append(group_id)

    try:
        row = _first_data_row(
            core_api.save_user_groups(
                user_id=user_id,
                group_ids=group_ids,
            )
        )

        if not row:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": (
                    "Core API tidak mengembalikan hasil "
                    "penyimpanan group access."
                ),
            }), 502

        if row.get("success") is False:
            code = str(row.get("code") or "")
            return jsonify(row), (
                404 if code == "USER_NOT_FOUND" else 400
            )

        return jsonify({
            "success": True,
            "code": row.get(
                "code",
                "USER_GROUP_SAVED",
            ),
            "message": row.get(
                "message",
                "User group access berhasil disimpan.",
            ),
            "user_id": row.get("user_id") or user_id,
            "group_count": int(
                row.get("group_count") or len(group_ids)
            ),
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "USER_GROUP_SAVE_ERROR",
            "message": str(exc),
        }), 500


def _json_array(
    value: Any,
) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [
            item for item in value
            if isinstance(item, dict)
        ]

    if not isinstance(value, str) or not value.strip():
        return []

    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return []

    if not isinstance(parsed, list):
        return []

    return [
        item for item in parsed
        if isinstance(item, dict)
    ]


@management_bp.route(
    "/users/<user_id>/access",
    methods=["GET"],
)
def get_user_access(
    user_id: str,
):
    try:
        row = _first_data_row(
            core_api.get_user_access(user_id)
        )

        if not row:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": "Core API tidak mengembalikan access profile.",
            }), 502

        if row.get("success") is False:
            code = str(row.get("code") or "")
            return jsonify(row), (
                404 if code == "USER_NOT_FOUND" else 400
            )

        groups = _json_array(row.get("groups_json"))
        menus = _json_array(row.get("menus_json"))

        return jsonify({
            "success": True,
            "user_id": row.get("user_id") or user_id,
            "access": {
                "groups": groups,
                "menus": menus,
            },
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "USER_ACCESS_GET_ERROR",
            "message": str(exc),
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

    (
        password_is_valid,
        password_policy_code,
        password_policy_message,
    ) = validate_password_policy(
        password
    )

    if not password_is_valid:
        return jsonify({
            "success": False,
            "code":
                password_policy_code,
            "message":
                password_policy_message,
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

# =============================================================
# GROUP MANAGEMENT
# =============================================================

def _make_group_code(
    group_name: str,
) -> str:
    """Create the CoreGroupCreate code when the UI sends only a name."""
    code = re.sub(
        r"[^A-Z0-9]+",
        "_",
        str(group_name or "").upper(),
    ).strip("_")

    # SQL @CoreGroupCode is varchar(50).
    code = code[:50].rstrip("_")
    return code or "GROUP"


@management_bp.route(
    "/groups",
    methods=["GET"],
)
def list_groups():
    try:
        try:
            page = max(
                1,
                int(request.args.get("page", "1")),
            )
        except (TypeError, ValueError):
            page = 1

        try:
            page_size = int(
                request.args.get("page_size", "20")
            )
        except (TypeError, ValueError):
            page_size = 20

        page_size = min(
            100,
            max(1, page_size),
        )
        search = str(
            request.args.get("search", "") or ""
        ).strip()
        status = str(
            request.args.get("status", "all") or "all"
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
                    "Status harus all, active, atau inactive."
                ),
            }), 400

        rows = _data_rows(
            core_api.list_groups(
                page=page,
                page_size=page_size,
                search=search,
                status=status,
            )
        )

        if not rows:
            return jsonify({
                "success": True,
                "page": page,
                "page_size": page_size,
                "total_items": 0,
                "total_pages": 0,
                "summary": {
                    "total_groups": 0,
                    "active_groups": 0,
                    "inactive_groups": 0,
                },
                "items": [],
            }), 200

        metadata = rows[0]
        items: list[dict[str, Any]] = []

        for row in rows:
            if not row.get("group_id"):
                continue

            items.append({
                "group_id": row.get("group_id"),
                "group_code": row.get("group_code"),
                "group_name": row.get("group_name"),
                "description": row.get("description"),
                "is_active": bool(row.get("is_active")),
                "user_count": int(
                    row.get("user_count") or 0
                ),
                "menu_count": int(
                    row.get("menu_count") or 0
                ),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            })

        return jsonify({
            "success": True,
            "page": int(
                metadata.get("page") or page
            ),
            "page_size": int(
                metadata.get("page_size") or page_size
            ),
            "total_items": int(
                metadata.get("total_items") or 0
            ),
            "total_pages": int(
                metadata.get("total_pages") or 0
            ),
            "summary": {
                "total_groups": int(
                    metadata.get("summary_total_groups") or 0
                ),
                "active_groups": int(
                    metadata.get("summary_active_groups") or 0
                ),
                "inactive_groups": int(
                    metadata.get("summary_inactive_groups") or 0
                ),
            },
            "items": items,
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "GROUP_LIST_ERROR",
            "message": str(exc),
        }), 500


@management_bp.route(
    "/groups/<group_id>",
    methods=["GET"],
)
def get_group(
    group_id: str,
):
    try:
        row = _first_data_row(
            core_api.get_group(group_id)
        )

        if not row:
            return jsonify({
                "success": False,
                "code": "GROUP_NOT_FOUND",
                "message": "Group tidak ditemukan.",
            }), 404

        if row.get("success") is False:
            code = str(row.get("code") or "")
            return jsonify(row), (
                404 if code == "GROUP_NOT_FOUND" else 400
            )

        return jsonify({
            "success": True,
            "group": {
                "group_id": row.get("group_id"),
                "group_code": row.get("group_code"),
                "group_name": row.get("group_name"),
                "description": row.get("description"),
                "is_active": bool(row.get("is_active")),
                "user_count": int(
                    row.get("user_count") or 0
                ),
                "menu_count": int(
                    row.get("menu_count") or 0
                ),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            },
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "GROUP_GET_ERROR",
            "message": str(exc),
        }), 500


@management_bp.route(
    "/groups",
    methods=["POST"],
)
def create_group():
    body = request.get_json(silent=True) or {}
    group_name = str(
        body.get("group_name") or ""
    ).strip()
    description = str(
        body.get("description") or ""
    ).strip()
    group_code = str(
        body.get("group_code") or ""
    ).strip().upper()

    if not group_name:
        return jsonify({
            "success": False,
            "code": "GROUP_NAME_REQUIRED",
            "message": "Group name wajib diisi.",
        }), 400

    # Current GroupManagement.tsx sends group_name + description only.
    # CoreGroupCreate requires GroupCode, so generate a stable readable
    # code from the name when group_code is omitted by the UI.
    if not group_code:
        group_code = _make_group_code(group_name)
    else:
        group_code = re.sub(
            r"[^A-Z0-9]+",
            "_",
            group_code,
        ).strip("_")[:50].rstrip("_")

    if not group_code:
        return jsonify({
            "success": False,
            "code": "GROUP_CODE_INVALID",
            "message": "Group code tidak valid.",
        }), 400

    try:
        row = _first_data_row(
            core_api.create_group(
                group_code=group_code,
                group_name=group_name,
                description=description,
            )
        )

        if not row:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": (
                    "Core API tidak mengembalikan data group."
                ),
            }), 502

        if row.get("success") is False:
            return jsonify(row), 400

        return jsonify({
            "success": True,
            "code": row.get(
                "code",
                "GROUP_CREATED",
            ),
            "message": row.get(
                "message",
                "Group berhasil dibuat.",
            ),
            "group": {
                "group_id": row.get("group_id"),
                "group_code": row.get(
                    "group_code",
                    group_code,
                ),
                "group_name": row.get("group_name"),
                "description": row.get("description"),
                "is_active": bool(row.get("is_active")),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            },
        }), 201

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "GROUP_CREATE_ERROR",
            "message": str(exc),
        }), 500


@management_bp.route(
    "/groups/<group_id>",
    methods=["PUT"],
)
def update_group(
    group_id: str,
):
    body = request.get_json(silent=True) or {}
    group_name = str(
        body.get("group_name") or ""
    ).strip()
    description = str(
        body.get("description") or ""
    ).strip()

    if not group_name:
        return jsonify({
            "success": False,
            "code": "GROUP_NAME_REQUIRED",
            "message": "Group name wajib diisi.",
        }), 400

    try:
        row = _first_data_row(
            core_api.update_group(
                group_id=group_id,
                group_name=group_name,
                description=description,
            )
        )

        if not row:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": (
                    "Core API tidak mengembalikan data group."
                ),
            }), 502

        if row.get("success") is False:
            code = str(row.get("code") or "")
            return jsonify(row), (
                404 if code == "GROUP_NOT_FOUND" else 400
            )

        return jsonify({
            "success": True,
            "code": row.get(
                "code",
                "GROUP_UPDATED",
            ),
            "message": row.get(
                "message",
                "Group berhasil diperbarui.",
            ),
            "group": {
                "group_id": row.get("group_id"),
                "group_code": row.get("group_code"),
                "group_name": row.get("group_name"),
                "description": row.get("description"),
                "is_active": bool(row.get("is_active")),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            },
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "GROUP_UPDATE_ERROR",
            "message": str(exc),
        }), 500


@management_bp.route(
    "/groups/<group_id>/status",
    methods=["PATCH"],
)
def set_group_status(
    group_id: str,
):
    body = request.get_json(silent=True) or {}

    if "is_active" not in body:
        return jsonify({
            "success": False,
            "code": "IS_ACTIVE_REQUIRED",
            "message": "is_active wajib diisi.",
        }), 400

    raw = body.get("is_active")
    if isinstance(raw, bool):
        is_active = raw
    elif raw in (0, 1, "0", "1"):
        is_active = str(raw) == "1"
    else:
        return jsonify({
            "success": False,
            "code": "INVALID_IS_ACTIVE",
            "message": "is_active harus boolean.",
        }), 400

    try:
        row = _first_data_row(
            core_api.set_group_active(
                group_id=group_id,
                is_active=is_active,
            )
        )

        if not row:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": "Core API tidak mengembalikan data.",
            }), 502

        if row.get("success") is False:
            code = str(row.get("code") or "")
            return jsonify(row), (
                404 if code == "GROUP_NOT_FOUND" else 400
            )

        return jsonify({
            "success": True,
            "code": row.get("code"),
            "message": row.get("message"),
            "group": {
                "group_id": row.get("group_id"),
                "group_code": row.get("group_code"),
                "group_name": row.get("group_name"),
                "description": row.get("description"),
                "is_active": bool(row.get("is_active")),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            },
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "GROUP_STATUS_UPDATE_ERROR",
            "message": str(exc),
        }), 500


# =============================================================
# GROUP MENU ACCESS
# =============================================================
@management_bp.route(
    "/groups/<group_id>/menus",
    methods=["GET"],
)
def get_group_menus(
    group_id: str,
):
    try:
        rows = _data_rows(
            core_api.get_group_menus(group_id)
        )

        if not rows:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": (
                    "Core API tidak mengembalikan data menu access."
                ),
                "items": [],
            }), 502

        first = rows[0]
        if first.get("success") is False:
            code = str(first.get("code") or "")
            return jsonify(first), (
                404 if code == "GROUP_NOT_FOUND" else 400
            )

        items: list[dict[str, Any]] = []
        for row in rows:
            if not row.get("menu_id"):
                continue

            items.append({
                "menu_id": row.get("menu_id"),
                "menu_code": row.get("menu_code"),
                "menu_name": row.get("menu_name"),
                "parent_menu_id": row.get("parent_menu_id"),
                "parent_menu_code": row.get("parent_menu_code"),
                "parent_menu_name": row.get("parent_menu_name"),
                "route_key": row.get("route_key"),
                "icon_key": row.get("icon_key"),
                "sort_order": int(
                    row.get("sort_order") or 0
                ),
                "can_view": bool(row.get("can_view")),
            })

        return jsonify({
            "success": True,
            "group_id": first.get("group_id") or group_id,
            "group_code": first.get("group_code"),
            "group_name": first.get("group_name"),
            "items": items,
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "GROUP_MENU_GET_ERROR",
            "message": str(exc),
            "items": [],
        }), 500


@management_bp.route(
    "/groups/<group_id>/menus",
    methods=["PUT"],
)
def save_group_menus(
    group_id: str,
):
    body = request.get_json(silent=True) or {}

    if "menu_ids" not in body:
        return jsonify({
            "success": False,
            "code": "MENU_IDS_REQUIRED",
            "message": (
                "menu_ids wajib dikirim dalam bentuk array."
            ),
        }), 400

    raw_menu_ids = body.get("menu_ids")
    if not isinstance(raw_menu_ids, list):
        return jsonify({
            "success": False,
            "code": "INVALID_MENU_IDS",
            "message": "menu_ids harus berupa array.",
        }), 400

    menu_ids: list[str] = []
    for value in raw_menu_ids:
        menu_id = str(value or "").strip()
        if not menu_id:
            return jsonify({
                "success": False,
                "code": "INVALID_MENU_ID",
                "message": (
                    "menu_ids tidak boleh berisi nilai kosong."
                ),
            }), 400

        if menu_id not in menu_ids:
            menu_ids.append(menu_id)

    try:
        row = _first_data_row(
            core_api.save_group_menus(
                group_id=group_id,
                menu_ids=menu_ids,
            )
        )

        if not row:
            return jsonify({
                "success": False,
                "code": "INVALID_CORE_RESPONSE",
                "message": (
                    "Core API tidak mengembalikan hasil "
                    "penyimpanan menu access."
                ),
            }), 502

        if row.get("success") is False:
            code = str(row.get("code") or "")
            return jsonify(row), (
                404 if code == "GROUP_NOT_FOUND" else 400
            )

        return jsonify({
            "success": True,
            "code": row.get(
                "code",
                "GROUP_MENU_SAVED",
            ),
            "message": row.get(
                "message",
                "Group menu access berhasil disimpan.",
            ),
            "group_id": row.get("group_id") or group_id,
            "menu_count": int(
                row.get("menu_count") or len(menu_ids)
            ),
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "code": "GROUP_MENU_SAVE_ERROR",
            "message": str(exc),
        }), 500

