from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf


TARGET_SAMPLE_RATE = 16000


@dataclass(frozen=True)
class AudioQuality:
    duration_seconds: float
    sample_rate: int
    rms_dbfs: float
    peak: float
    clipping_ratio: float
    non_silent_ratio: float
    is_valid: bool
    reason: str


def convert_to_pcm16k_mono(input_path: str, output_path: str) -> None:
    """
    Convert browser audio/webm/wav to 16 kHz mono PCM WAV.

    ffmpeg must be installed on the machine.
    """
    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-ar",
        str(TARGET_SAMPLE_RATE),
        "-ac",
        "1",
        "-sample_fmt",
        "s16",
        output_path,
    ]

    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "FFmpeg gagal mengonversi audio:\n"
            + result.stderr[-3000:]
        )

    if not Path(output_path).exists():
        raise RuntimeError("Output WAV tidak dibuat oleh ffmpeg.")


def inspect_wav(path: str) -> AudioQuality:
    audio, sample_rate = sf.read(
        path,
        dtype="float32",
        always_2d=False,
    )

    if audio.size == 0:
        return AudioQuality(
            duration_seconds=0.0,
            sample_rate=sample_rate,
            rms_dbfs=-120.0,
            peak=0.0,
            clipping_ratio=0.0,
            non_silent_ratio=0.0,
            is_valid=False,
            reason="Audio kosong.",
        )

    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)

    duration = float(len(audio) / sample_rate)
    rms = float(np.sqrt(np.mean(np.square(audio)) + 1e-12))
    rms_dbfs = float(20.0 * math.log10(max(rms, 1e-12)))
    peak = float(np.max(np.abs(audio)))

    # PCM float range is nominally [-1, 1].
    clipping_ratio = float(np.mean(np.abs(audio) >= 0.995))

    # Approximate "contains voice / useful signal" check.
    non_silent_ratio = float(np.mean(np.abs(audio) >= 0.01))

    reasons = []

    if sample_rate != TARGET_SAMPLE_RATE:
        reasons.append(
            f"Sample rate harus {TARGET_SAMPLE_RATE} Hz."
        )

    if duration < 1.5:
        reasons.append("Durasi suara terlalu pendek (< 1.5 detik).")

    if duration > 15.0:
        reasons.append("Durasi suara terlalu panjang (> 15 detik).")

    if rms_dbfs < -45.0:
        reasons.append("Volume audio terlalu kecil.")

    if clipping_ratio > 0.02:
        reasons.append("Audio terlalu banyak clipping.")

    if non_silent_ratio < 0.15:
        reasons.append("Terlalu banyak bagian hening.")

    return AudioQuality(
        duration_seconds=duration,
        sample_rate=sample_rate,
        rms_dbfs=rms_dbfs,
        peak=peak,
        clipping_ratio=clipping_ratio,
        non_silent_ratio=non_silent_ratio,
        is_valid=not reasons,
        reason="OK" if not reasons else " ".join(reasons),
    )
