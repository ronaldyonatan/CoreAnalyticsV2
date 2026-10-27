from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

from app.clients.core_api_client import core_api
from app.services.audio_processing import (
    convert_to_pcm16k_mono,
    inspect_wav,
)
from app.services.speaker_engine import speaker_engine


VOICE_LOGIN_THRESHOLD = float(
    os.getenv("VOICE_LOGIN_THRESHOLD", "0.55")
)

VOICE_LOGIN_MARGIN = float(
    os.getenv("VOICE_LOGIN_MARGIN", "0.08")
)

VOICE_DEBUG = os.getenv(
    "VOICE_DEBUG",
    "0",
).strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _rows(response: Any) -> list[dict[str, Any]]:
    """
    Normalize BEAM response:
    {
        "code": 200,
        "data": [{...}],
        "result": "success"
    }
    """
    if not isinstance(response, dict):
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


def _embedding_from_base64(
    encoded: str,
) -> np.ndarray:
    raw = base64.b64decode(
        encoded
    )

    vector = np.frombuffer(
        raw,
        dtype=np.float32,
    ).copy()

    return speaker_engine.normalize_embedding(
        vector
    )


class IdentificationService:
    """
    Identify an unknown speaker against every active CoreAnalytics
    voice centroid.

    Decisions:
      VERIFIED
      AMBIGUOUS
      UNKNOWN
      REJECTED_QUALITY
    """

    def identify_from_file(
        self,
        audio_path: str,
    ) -> dict[str, Any]:

        temp_wav: str | None = None

        try:
            # =================================================
            # A. Convert browser/file audio to standard PCM WAV.
            # =================================================
            fd, temp_wav = tempfile.mkstemp(
                prefix="core_voice_login_",
                suffix=".wav",
            )
            os.close(fd)

            convert_to_pcm16k_mono(
                audio_path,
                temp_wav,
            )

            # =================================================
            # B. Quality gate.
            # =================================================
            quality = inspect_wav(
                temp_wav
            )

            if not quality.is_valid:
                result = {
                    "success": False,
                    "decision": "REJECTED_QUALITY",
                    "message": quality.reason,
                    "best_score": None,
                    "second_best_score": None,
                    "score_margin": None,
                    "threshold_used":
                        VOICE_LOGIN_THRESHOLD,
                    "margin_required":
                        VOICE_LOGIN_MARGIN,
                    "user": None,
                    "quality": {
                        "duration_seconds":
                            quality.duration_seconds,
                        "sample_rate":
                            quality.sample_rate,
                        "rms_dbfs":
                            quality.rms_dbfs,
                        "clipping_ratio":
                            quality.clipping_ratio,
                        "non_silent_ratio":
                            quality.non_silent_ratio,
                    },
                }

                self._safe_log(
                    result
                )

                return result

            # =================================================
            # C. Incoming speaker embedding.
            # =================================================
            incoming_embedding = (
                speaker_engine
                .create_embedding(
                    temp_wav
                )
            )

            # =================================================
            # D. Load every active voice profile via BEAM.
            # =================================================
            profiles_response = (
                core_api
                .get_active_voice_profiles()
            )

            profiles = _rows(
                profiles_response
            )

            candidates: list[
                dict[str, Any]
            ] = []

            for profile in profiles:
                encoded_centroid = (
                    profile.get(
                        "centroid_embedding_base64"
                    )
                )

                if not encoded_centroid:
                    continue

                try:
                    centroid = (
                        _embedding_from_base64(
                            encoded_centroid
                        )
                    )
                except Exception as exc:
                    print(
                        "Skipping invalid voice profile "
                        f"{profile.get('voice_profile_id')}: "
                        f"{exc}"
                    )
                    continue

                # Different model dimension = incompatible.
                if (
                    len(centroid)
                    != len(incoming_embedding)
                ):
                    print(
                        "Skipping incompatible voice profile "
                        f"{profile.get('voice_profile_id')}: "
                        f"{len(centroid)} != "
                        f"{len(incoming_embedding)}"
                    )
                    continue

                score = (
                    speaker_engine
                    .cosine_similarity(
                        incoming_embedding,
                        centroid,
                    )
                )

                profile_threshold = (
                    profile.get("threshold")
                )

                try:
                    threshold = (
                        float(profile_threshold)
                        if profile_threshold
                        is not None
                        else VOICE_LOGIN_THRESHOLD
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    threshold = (
                        VOICE_LOGIN_THRESHOLD
                    )

                candidates.append({
                    "voice_profile_id":
                        profile.get(
                            "voice_profile_id"
                        ),
                    "user_id":
                        profile.get(
                            "user_id"
                        ),
                    "username":
                        profile.get(
                            "username"
                        ),
                    "display_name":
                        profile.get(
                            "display_name"
                        ),
                    "threshold":
                        threshold,
                    "score":
                        float(score),
                })

            # =================================================
            # E. No usable registered voice profiles.
            # =================================================
            if not candidates:
                result = {
                    "success": False,
                    "decision": "UNKNOWN",
                    "message": (
                        "Belum ada active voice profile "
                        "yang dapat digunakan."
                    ),
                    "best_score": None,
                    "second_best_score": None,
                    "score_margin": None,
                    "threshold_used":
                        VOICE_LOGIN_THRESHOLD,
                    "margin_required":
                        VOICE_LOGIN_MARGIN,
                    "user": None,
                }

                self._safe_log(
                    result
                )

                return result

            # Highest cosine similarity first.
            candidates.sort(
                key=lambda item: item[
                    "score"
                ],
                reverse=True,
            )

            best = candidates[0]

            second = (
                candidates[1]
                if len(candidates) > 1
                else None
            )

            best_score = float(
                best["score"]
            )

            second_score = (
                float(
                    second["score"]
                )
                if second
                else None
            )

            score_margin = (
                best_score
                - second_score
                if second_score
                is not None
                else None
            )

            threshold_used = float(
                best.get("threshold")
                or VOICE_LOGIN_THRESHOLD
            )

            # =================================================
            # F. Decision.
            # =================================================
            if (
                best_score
                < threshold_used
            ):
                decision = "UNKNOWN"
                success = False
                message = (
                    "Voice identity tidak dikenali."
                )

            elif (
                second is not None
                and score_margin is not None
                and score_margin
                < VOICE_LOGIN_MARGIN
            ):
                decision = "AMBIGUOUS"
                success = False
                message = (
                    "Voice identity terlalu mirip "
                    "dengan lebih dari satu profile."
                )

            else:
                decision = "VERIFIED"
                success = True
                message = (
                    "Voice identity verified."
                )

            # Only expose identity on successful verification.
            user = (
                {
                    "user_id":
                        best.get("user_id"),
                    "username":
                        best.get("username"),
                    "display_name":
                        best.get(
                            "display_name"
                        ),
                    "voice_profile_id":
                        best.get(
                            "voice_profile_id"
                        ),
                }
                if success
                else None
            )

            result: dict[str, Any] = {
                "success": success,
                "decision": decision,
                "message": message,
                "best_score": round(
                    best_score,
                    6,
                ),
                "second_best_score": (
                    round(
                        second_score,
                        6,
                    )
                    if second_score
                    is not None
                    else None
                ),
                "score_margin": (
                    round(
                        score_margin,
                        6,
                    )
                    if score_margin
                    is not None
                    else None
                ),
                "threshold_used":
                    threshold_used,
                "margin_required":
                    VOICE_LOGIN_MARGIN,
                "user": user,
                "quality": {
                    "duration_seconds":
                        quality.duration_seconds,
                    "sample_rate":
                        quality.sample_rate,
                    "rms_dbfs":
                        quality.rms_dbfs,
                    "clipping_ratio":
                        quality.clipping_ratio,
                    "non_silent_ratio":
                        quality.non_silent_ratio,
                },
            }

            # Optional diagnostics only.
            if VOICE_DEBUG:
                result["candidates"] = [
                    {
                        "user_id":
                            item.get(
                                "user_id"
                            ),
                        "username":
                            item.get(
                                "username"
                            ),
                        "score":
                            round(
                                float(
                                    item["score"]
                                ),
                                6,
                            ),
                    }
                    for item
                    in candidates[:10]
                ]

            # Store every attempt in core_voice_auth_log.
            self._safe_log(
                result,
                detected_user_id=(
                    str(
                        best.get(
                            "user_id"
                        )
                    )
                    if (
                        success
                        and best.get(
                            "user_id"
                        )
                    )
                    else None
                ),
            )

            return result

        finally:
            if temp_wav:
                try:
                    Path(
                        temp_wav
                    ).unlink(
                        missing_ok=True
                    )
                except Exception:
                    pass

    def _safe_log(
        self,
        result: dict[str, Any],
        detected_user_id: str | None = None,
    ) -> None:
        """
        Audit logging must not make voice login fail.
        """
        try:
            core_api.log_voice_auth(
                detected_user_id=(
                    detected_user_id
                ),
                best_score=result.get(
                    "best_score"
                ),
                second_best_score=result.get(
                    "second_best_score"
                ),
                score_margin=result.get(
                    "score_margin"
                ),
                threshold_used=result.get(
                    "threshold_used"
                ),
                decision=str(
                    result.get(
                        "decision"
                    )
                    or "UNKNOWN"
                ),
                model_name=(
                    speaker_engine
                    .model_name
                ),
            )

        except Exception as exc:
            print(
                "Voice auth log warning:",
                exc,
            )


identification_service = (
    IdentificationService()
)
