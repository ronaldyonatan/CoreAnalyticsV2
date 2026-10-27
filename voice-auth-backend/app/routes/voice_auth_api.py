from __future__ import annotations

import os
import tempfile
from pathlib import Path

from flask import (
    Blueprint,
    jsonify,
    request,
)

from app.services.identification_service import (
    identification_service,
)


voice_auth_bp = Blueprint(
    "voice_auth",
    __name__,
    url_prefix="/api/voice",
)


# =============================================================
# VOICE IDENTIFICATION / LOGIN
#
# POST /api/voice/identify
#
# multipart/form-data:
#   audio = browser audio blob
# =============================================================
@voice_auth_bp.route(
    "/identify",
    methods=["POST"],
)
def identify_voice():
    audio_file = request.files.get(
        "audio"
    )

    if not audio_file:
        return jsonify({
            "success": False,
            "decision":
                "REJECTED_QUALITY",
            "message":
                "Audio wajib diisi.",
            "user": None,
        }), 400

    original_name = (
        audio_file.filename
        or "voice.webm"
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
                "core_voice_login_upload_"
            ),
            suffix=suffix,
        )
    )

    os.close(fd)

    try:
        audio_file.save(
            temp_path
        )

        result = (
            identification_service
            .identify_from_file(
                temp_path
            )
        )

        decision = result.get(
            "decision"
        )

        if decision == "VERIFIED":
            status_code = 200

        elif decision in {
            "UNKNOWN",
            "AMBIGUOUS",
        }:
            status_code = 401

        elif decision == (
            "REJECTED_QUALITY"
        ):
            status_code = 400

        else:
            status_code = 400

        return jsonify(
            result
        ), status_code

    except Exception as exc:
        return jsonify({
            "success": False,
            "decision":
                "ERROR",
            "message":
                str(exc),
            "user":
                None,
        }), 500

    finally:
        try:
            Path(
                temp_path
            ).unlink(
                missing_ok=True
            )
        except Exception:
            pass
