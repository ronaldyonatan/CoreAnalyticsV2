from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import sounddevice as sd
import soundfile as sf

from app.services.audio_processing import inspect_wav
from app.services.enrollment_service import enrollment_service


SAMPLE_RATE = 16000
CHANNELS = 1
DEFAULT_DURATION = 5
DEFAULT_SAMPLE_COUNT = 5


PHRASES = [
    "Core Analytics, buka Daily Tracking.",
    "Tampilkan dashboard Demography.",
    "Core Analytics, tampilkan revenue hari ini.",
    "Buka informasi performa layanan.",
    "Core Analytics, kembali ke dashboard utama.",
]


def record_wav(
    output_path: Path,
    duration_seconds: int,
) -> None:
    print(
        f"\nMerekam {duration_seconds} detik..."
    )

    recording = sd.rec(
        int(duration_seconds * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="float32",
    )

    sd.wait()

    sf.write(
        str(output_path),
        recording,
        SAMPLE_RATE,
        subtype="PCM_16",
    )


def format_quality(quality) -> str:
    return (
        f"duration={quality.duration_seconds:.2f}s | "
        f"rms={quality.rms_dbfs:.2f} dBFS | "
        f"peak={quality.peak:.4f} | "
        f"non_silent={quality.non_silent_ratio:.3f} | "
        f"clipping={quality.clipping_ratio:.5f}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Record 5 voice samples and enroll "
            "a CoreAnalytics user."
        )
    )

    parser.add_argument(
        "--user-id",
        required=True,
        help="UUID dari [CoreAnalytics].dbo.core_user",
    )

    parser.add_argument(
        "--username",
        default="user",
        help="Dipakai hanya untuk nama folder lokal.",
    )

    parser.add_argument(
        "--duration",
        type=int,
        default=DEFAULT_DURATION,
        help="Durasi setiap rekaman dalam detik.",
    )

    parser.add_argument(
        "--samples",
        type=int,
        default=DEFAULT_SAMPLE_COUNT,
        help="Jumlah sample enrollment. Minimal 5.",
    )

    parser.add_argument(
        "--threshold",
        type=float,
        default=0.55,
        help="Initial cosine similarity threshold.",
    )

    args = parser.parse_args()

    if args.samples < 5:
        raise ValueError(
            "Minimal enrollment adalah 5 sample."
        )

    capture_dir = (
        Path("enrollment-capture")
        / args.username
    )

    capture_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    print("=" * 62)
    print("COREANALYTICS VOICE ENROLLMENT")
    print("=" * 62)
    print(f"User ID : {args.user_id}")
    print(f"Username: {args.username}")
    print(f"Samples : {args.samples}")
    print(f"Duration: {args.duration} sec/sample")
    print(f"Output  : {capture_dir.resolve()}")
    print()
    print(
        "Pastikan VS Code / Terminal sudah mendapatkan "
        "izin Microphone dari macOS."
    )
    print()

    input(
        "Tekan ENTER untuk mulai enrollment..."
    )

    accepted_paths: list[str] = []

    sample_no = 1

    while sample_no <= args.samples:
        phrase = (
            PHRASES[sample_no - 1]
            if sample_no <= len(PHRASES)
            else "Core Analytics."
        )

        output_path = (
            capture_dir
            / f"sample_{sample_no:03d}.wav"
        )

        print()
        print("-" * 62)
        print(
            f"SAMPLE {sample_no}/{args.samples}"
        )
        print("-" * 62)
        print("Ucapkan secara natural:")
        print()
        print(f'  "{phrase}"')
        print()

        input(
            "Tekan ENTER jika siap merekam..."
        )

        # Small preparation delay.
        print("3...")
        time.sleep(0.6)
        print("2...")
        time.sleep(0.6)
        print("1...")
        time.sleep(0.6)

        record_wav(
            output_path,
            args.duration,
        )

        quality = inspect_wav(
            str(output_path)
        )

        print()
        print(
            "Quality:",
            format_quality(quality),
        )
        print(
            "Result :",
            "VALID" if quality.is_valid else "REJECTED",
        )

        if not quality.is_valid:
            print(
                "Reason :",
                quality.reason,
            )
            print(
                "\nSample ditolak. "
                "Silakan rekam ulang."
            )

            try:
                output_path.unlink()
            except OSError:
                pass

            continue

        accepted_paths.append(
            str(output_path)
        )

        print(
            f"Sample {sample_no} diterima."
        )

        sample_no += 1

    print()
    print("=" * 62)
    print("SEMUA SAMPLE VALID")
    print("=" * 62)

    for path in accepted_paths:
        print(" -", path)

    print()
    answer = input(
        "Kirim 5 sample ini ke CoreAnalytics sekarang? [Y/n]: "
    ).strip().lower()

    if answer not in ("", "y", "yes"):
        print(
            "Enrollment dibatalkan sebelum upload. "
            "File rekaman tetap disimpan."
        )
        sys.exit(0)

    print()
    print(
        "Creating embeddings and sending "
        "voice profile to CoreAnalytics..."
    )

    result = enrollment_service.enroll_from_files(
        user_id=args.user_id,
        audio_paths=accepted_paths,
        threshold=args.threshold,
    )

    print()
    print("=" * 62)
    print("ENROLLMENT SUCCESS")
    print("=" * 62)
    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
