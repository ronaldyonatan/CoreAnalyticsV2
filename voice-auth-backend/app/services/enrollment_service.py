from __future__ import annotations

import os
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np

from app.clients.core_api_client import core_api
from app.services.audio_processing import (
    convert_to_pcm16k_mono,
    inspect_wav,
)
from app.services.duplicate_voice_guard import (
    ensure_voice_is_unique,
)
from app.services.embedding_codec import (
    embedding_to_base64,
)
from app.services.speaker_engine import (
    speaker_engine,
)
from app.services.voice_storage import (
    voice_storage,
)


MIN_ENROLLMENT_SAMPLES = 5

DEFAULT_THRESHOLD = float(
    os.getenv(
        "VOICE_DEFAULT_THRESHOLD",
        "0.55",
    )
)


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


def _require_success_row(
    response: Any,
    operation: str,
) -> dict[str, Any]:
    row = _first_data_row(
        response
    )

    if not row:
        raise RuntimeError(
            f"{operation}: "
            "response BEAM tidak memiliki data."
        )

    if row.get("success") is False:
        raise RuntimeError(
            f"{operation}: "
            f"{row.get('code', 'ERROR')} - "
            f"{row.get('message', 'Unknown error')}"
        )

    return row


class EnrollmentService:
    """
    Complete enrollment pipeline:

    1. Convert all samples to 16 kHz mono WAV
    2. Audio quality validation
    3. Create normalized speaker embedding per sample
    4. Compute candidate centroid
    5. DUPLICATE VOICE CHECK
    6. Create DB voice profile
    7. Save WAV + embedding for every sample
    8. Finalize profile with centroid
    """

    def enroll_from_files(
        self,
        *,
        user_id: str,
        audio_paths: list[str],
        threshold: float = DEFAULT_THRESHOLD,
    ) -> dict[str, Any]:

        if len(audio_paths) < MIN_ENROLLMENT_SAMPLES:
            raise ValueError(
                "Minimal 5 sample suara "
                "untuk enrollment."
            )

        prepared_samples: list[
            dict[str, Any]
        ] = []

        temp_paths: list[str] = []

        try:
            # =================================================
            # A. PREPARE + VALIDATE ALL AUDIO
            # =================================================
            for sample_no, source_path in enumerate(
                audio_paths,
                start=1,
            ):
                source = Path(
                    source_path
                )

                if not source.exists():
                    raise FileNotFoundError(
                        "Sample tidak ditemukan: "
                        f"{source}"
                    )

                fd, wav_path = (
                    tempfile.mkstemp(
                        prefix=(
                            f"core_voice_"
                            f"{sample_no:03d}_"
                        ),
                        suffix=".wav",
                    )
                )

                os.close(fd)

                temp_paths.append(
                    wav_path
                )

                convert_to_pcm16k_mono(
                    str(source),
                    wav_path,
                )

                quality = inspect_wav(
                    wav_path
                )

                if not quality.is_valid:
                    raise RuntimeError(
                        f"Sample {sample_no} "
                        "ditolak: "
                        f"{quality.reason}"
                    )

                embedding = (
                    speaker_engine
                    .create_embedding(
                        wav_path
                    )
                )

                prepared_samples.append(
                    {
                        "sample_no":
                            sample_no,
                        "wav_path":
                            wav_path,
                        "quality":
                            quality,
                        "embedding":
                            embedding,
                    }
                )

            # =================================================
            # B. CHECK EMBEDDING DIMENSION
            # =================================================
            dimensions = {
                len(item["embedding"])
                for item
                in prepared_samples
            }

            if len(dimensions) != 1:
                raise RuntimeError(
                    "Dimensi embedding antar "
                    "sample tidak konsisten."
                )

            embedding_dimension = (
                dimensions.pop()
            )

            # =================================================
            # C. INTERNAL CONSISTENCY DIAGNOSTIC
            # =================================================
            pairwise_scores: list[
                float
            ] = []

            for i in range(
                len(prepared_samples)
            ):
                for j in range(
                    i + 1,
                    len(prepared_samples),
                ):
                    pairwise_scores.append(
                        speaker_engine
                        .cosine_similarity(
                            prepared_samples[i][
                                "embedding"
                            ],
                            prepared_samples[j][
                                "embedding"
                            ],
                        )
                    )

            average_pairwise_similarity = (
                float(
                    np.mean(
                        pairwise_scores
                    )
                )
                if pairwise_scores
                else 1.0
            )

            # =================================================
            # D. CANDIDATE CENTROID
            # =================================================
            sample_embeddings = [
                item["embedding"]
                for item
                in prepared_samples
            ]

            candidate_centroid = (
                speaker_engine.centroid(
                    sample_embeddings
                )
            )

            # =================================================
            # E. DUPLICATE VOICE GUARD
            #
            # IMPORTANT:
            # This runs BEFORE CoreVoiceProfileCreate,
            # so rejected voices do not create empty DB profiles.
            # =================================================
            ensure_voice_is_unique(
                enrolling_user_id=user_id,
                candidate_centroid=(
                    candidate_centroid
                ),
                sample_embeddings=(
                    sample_embeddings
                ),
            )

            # =================================================
            # F. CREATE VOICE PROFILE
            # =================================================
            profile_response = (
                core_api
                .create_voice_profile(
                    user_id=user_id,
                    model_name=(
                        speaker_engine
                        .model_name
                    ),
                    model_version=(
                        speaker_engine
                        .model_version
                    ),
                    embedding_dimension=(
                        embedding_dimension
                    ),
                    threshold=threshold,
                )
            )

            profile_row = (
                _require_success_row(
                    profile_response,
                    "CoreVoiceProfileCreate",
                )
            )

            voice_profile_id = (
                profile_row.get(
                    "voice_profile_id"
                )
            )

            if not voice_profile_id:
                raise RuntimeError(
                    "CoreVoiceProfileCreate "
                    "tidak mengembalikan "
                    "voice_profile_id."
                )

            # =================================================
            # G. SAVE EACH SAMPLE
            # =================================================
            for item in prepared_samples:
                sample_no = item[
                    "sample_no"
                ]

                wav_path = item[
                    "wav_path"
                ]

                quality = item[
                    "quality"
                ]

                embedding = item[
                    "embedding"
                ]

                wav_bytes = (
                    Path(
                        wav_path
                    ).read_bytes()
                )

                storage_path = (
                    voice_storage
                    .save_enrollment_sample(
                        user_id=user_id,
                        sample_no=sample_no,
                        audio_bytes=(
                            wav_bytes
                        ),
                    )
                )

                sample_response = (
                    core_api
                    .add_voice_sample(
                        voice_profile_id=(
                            voice_profile_id
                        ),
                        sample_no=sample_no,
                        storage_path=(
                            storage_path
                        ),
                        duration_ms=int(
                            round(
                                quality
                                .duration_seconds
                                * 1000
                            )
                        ),
                        quality_score=(
                            _quality_to_score(
                                quality
                            )
                        ),
                        embedding_base64=(
                            embedding_to_base64(
                                embedding
                            )
                        ),
                        is_valid=True,
                    )
                )

                _require_success_row(
                    sample_response,
                    (
                        "CoreVoiceSampleAdd "
                        f"sample {sample_no}"
                    ),
                )

            # =================================================
            # H. FINALIZE PROFILE
            # =================================================
            finalize_response = (
                core_api
                .finalize_voice_profile(
                    voice_profile_id=(
                        voice_profile_id
                    ),
                    centroid_embedding_base64=(
                        embedding_to_base64(
                            candidate_centroid
                        )
                    ),
                    sample_count=len(
                        prepared_samples
                    ),
                    threshold=threshold,
                )
            )

            _require_success_row(
                finalize_response,
                "CoreVoiceProfileFinalize",
            )

            return {
                "success": True,
                "voice_profile_id":
                    voice_profile_id,
                "user_id":
                    user_id,
                "sample_count":
                    len(prepared_samples),
                "embedding_dimension":
                    embedding_dimension,
                "threshold":
                    threshold,
                "average_pairwise_similarity":
                    average_pairwise_similarity,
                "duplicate_check": {
                    "passed": True,
                },
                "samples": [
                    {
                        "sample_no":
                            item["sample_no"],
                        "quality":
                            asdict(
                                item["quality"]
                            ),
                    }
                    for item
                    in prepared_samples
                ],
            }

        finally:
            # Always remove converted temporary audio.
            for temp_path in temp_paths:
                try:
                    Path(
                        temp_path
                    ).unlink(
                        missing_ok=True
                    )
                except Exception:
                    pass


def _quality_to_score(
    quality,
) -> float:
    """
    0..1 recording-quality score.
    This is NOT speaker similarity.
    """

    volume_score = min(
        1.0,
        max(
            0.0,
            (
                quality.rms_dbfs
                + 45.0
            )
            / 25.0,
        ),
    )

    clipping_score = min(
        1.0,
        max(
            0.0,
            1.0
            - (
                quality.clipping_ratio
                / 0.02
            ),
        ),
    )

    signal_score = min(
        1.0,
        max(
            0.0,
            quality.non_silent_ratio
            / 0.60,
        ),
    )

    return round(
        (
            volume_score * 0.35
            + clipping_score * 0.35
            + signal_score * 0.30
        ),
        6,
    )


enrollment_service = EnrollmentService()
