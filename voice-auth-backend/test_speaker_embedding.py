import argparse

from app.services.audio_processing import (
    convert_to_pcm16k_mono,
    inspect_wav,
)
from app.services.speaker_engine import speaker_engine

import os
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    args = parser.parse_args()

    fd, wav_path = tempfile.mkstemp(
        suffix=".wav"
    )
    os.close(fd)

    try:
        convert_to_pcm16k_mono(
            args.audio,
            wav_path,
        )

        quality = inspect_wav(
            wav_path
        )

        print("Quality :", quality)

        if not quality.is_valid:
            raise RuntimeError(
                quality.reason
            )

        embedding = (
            speaker_engine.create_embedding(
                wav_path
            )
        )

        print(
            "Embedding dimension:",
            len(embedding),
        )

        print(
            "Embedding norm:",
            float(
                (
                    embedding
                    @ embedding
                ) ** 0.5
            ),
        )

        print(
            "Model:",
            speaker_engine.model_name,
            speaker_engine.model_version,
        )

    finally:
        try:
            os.remove(wav_path)
        except OSError:
            pass


if __name__ == "__main__":
    main()
