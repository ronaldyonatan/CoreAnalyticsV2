from __future__ import annotations

import base64
import os
from typing import Any

import numpy as np

from app.clients.core_api_client import core_api
from app.services.speaker_engine import speaker_engine

DUPLICATE_THRESHOLD = float(
    os.getenv("VOICE_DUPLICATE_THRESHOLD", "0.72")
)

DUPLICATE_SAMPLE_AVG_MARGIN = float(
    os.getenv("VOICE_DUPLICATE_SAMPLE_AVG_MARGIN", "0.05")
)


def _rows(response: Any) -> list[dict[str, Any]]:
    if not isinstance(response, dict):
        return []

    data = response.get("data")

    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]

    if isinstance(data, dict):
        return [data]

    return []


def _decode_embedding(encoded: str) -> np.ndarray:
    raw = base64.b64decode(encoded)
    vector = np.frombuffer(raw, dtype=np.float32).copy()
    return speaker_engine.normalize_embedding(vector)


class VoiceDuplicateError(RuntimeError):
    def __init__(self, conflict: dict[str, Any]):
        self.conflict = conflict
        super().__init__(
            "VOICE_ALREADY_REGISTERED - Voice identity sudah terlalu mirip "
            "dengan account lain."
        )


def find_duplicate_voice(
    *,
    enrolling_user_id: str,
    candidate_centroid: np.ndarray,
    sample_embeddings: list[np.ndarray],
) -> dict[str, Any] | None:
    profiles = _rows(core_api.get_active_voice_profiles())
    best_conflict: dict[str, Any] | None = None

    for profile in profiles:
        existing_user_id = str(profile.get("user_id") or "")

        # Re-enrollment user yang sama tetap diperbolehkan.
        if existing_user_id.lower() == str(enrolling_user_id).lower():
            continue

        encoded = profile.get("centroid_embedding_base64")
        if not encoded:
            continue

        try:
            existing_centroid = _decode_embedding(encoded)
        except Exception:
            continue

        centroid_similarity = speaker_engine.cosine_similarity(
            candidate_centroid,
            existing_centroid,
        )

        sample_scores = [
            speaker_engine.cosine_similarity(sample, existing_centroid)
            for sample in sample_embeddings
        ]

        average_sample_similarity = (
            float(np.mean(sample_scores))
            if sample_scores
            else 0.0
        )

        max_sample_similarity = max(sample_scores) if sample_scores else 0.0

        required_sample_average = (
            DUPLICATE_THRESHOLD - DUPLICATE_SAMPLE_AVG_MARGIN
        )

        is_conflict = (
            centroid_similarity >= DUPLICATE_THRESHOLD
            and average_sample_similarity >= required_sample_average
        )

        if not is_conflict:
            continue

        candidate = {
            "user_id": existing_user_id,
            "username": profile.get("username"),
            "display_name": profile.get("display_name"),
            "centroid_similarity": round(float(centroid_similarity), 6),
            "average_sample_similarity": round(float(average_sample_similarity), 6),
            "max_sample_similarity": round(float(max_sample_similarity), 6),
            "threshold": DUPLICATE_THRESHOLD,
        }

        if (
            best_conflict is None
            or candidate["centroid_similarity"]
            > best_conflict["centroid_similarity"]
        ):
            best_conflict = candidate

    return best_conflict


def ensure_voice_is_unique(
    *,
    enrolling_user_id: str,
    candidate_centroid: np.ndarray,
    sample_embeddings: list[np.ndarray],
) -> None:
    conflict = find_duplicate_voice(
        enrolling_user_id=enrolling_user_id,
        candidate_centroid=candidate_centroid,
        sample_embeddings=sample_embeddings,
    )

    if conflict:
        raise VoiceDuplicateError(conflict)
