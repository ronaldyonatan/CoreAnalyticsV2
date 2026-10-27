from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from speechbrain.inference.speaker import SpeakerRecognition


class SpeakerEngine:
    """
    Wrapper around the same local SpeechBrain model used by the old server.py.

    This version intentionally does NOT use torchaudio.load(),
    so TorchCodec is not required.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or os.getenv(
            "VOICE_MODEL_PATH",
            "tmp_model",
        )
        self._model: Optional[SpeakerRecognition] = None

    @property
    def model_name(self) -> str:
        return "SpeechBrain-SpeakerRecognition"

    @property
    def model_version(self) -> str:
        return os.getenv(
            "VOICE_MODEL_VERSION",
            "local-tmp_model-v1",
        )

    def _get_model(self) -> SpeakerRecognition:
        if self._model is None:
            if not Path(self.model_path).exists():
                raise RuntimeError(
                    f"Voice model tidak ditemukan: {self.model_path}"
                )

            print(
                f"Loading SpeechBrain speaker model from "
                f"{self.model_path}..."
            )

            self._model = SpeakerRecognition.from_hparams(
                source=self.model_path,
                savedir=self.model_path,
            )

            print("SpeechBrain speaker model loaded.")

        return self._model

    @staticmethod
    def normalize_embedding(
        embedding: np.ndarray,
    ) -> np.ndarray:
        vector = np.asarray(
            embedding,
            dtype=np.float32,
        ).reshape(-1)

        norm = float(np.linalg.norm(vector))

        if norm <= 1e-12:
            raise RuntimeError(
                "Embedding speaker bernilai nol."
            )

        return vector / norm

    def create_embedding(
        self,
        wav_path: str,
    ) -> np.ndarray:
        """
        Extract normalized speaker embedding from a PCM WAV.

        Expected input:
        - mono
        - 16 kHz

        audio_processing.py already converts enrollment audio to this format.
        """

        model = self._get_model()

        audio, sample_rate = sf.read(
            wav_path,
            dtype="float32",
            always_2d=False,
        )

        if audio.size == 0:
            raise RuntimeError(
                "Audio kosong."
            )

        if audio.ndim > 1:
            audio = np.mean(
                audio,
                axis=1,
            )

        if sample_rate != 16000:
            raise RuntimeError(
                f"Sample rate harus 16000 Hz, "
                f"tetapi file adalah {sample_rate} Hz. "
                f"Jalankan convert_to_pcm16k_mono terlebih dahulu."
            )

        # SpeechBrain encode_batch expects [batch, time]
        signal = torch.from_numpy(
            np.asarray(
                audio,
                dtype=np.float32,
            )
        ).unsqueeze(0)

        device = getattr(
            model,
            "device",
            None,
        )

        if device is not None:
            signal = signal.to(device)

        with torch.no_grad():
            embedding = model.encode_batch(
                signal,
                normalize=False,
            )

        vector = (
            embedding
            .detach()
            .cpu()
            .numpy()
            .astype(np.float32)
            .reshape(-1)
        )

        return self.normalize_embedding(
            vector
        )

    @staticmethod
    def cosine_similarity(
        first: np.ndarray,
        second: np.ndarray,
    ) -> float:
        a = SpeakerEngine.normalize_embedding(
            first
        )

        b = SpeakerEngine.normalize_embedding(
            second
        )

        return float(
            np.dot(a, b)
        )

    def centroid(
        self,
        embeddings: list[np.ndarray],
    ) -> np.ndarray:
        if not embeddings:
            raise ValueError(
                "Embeddings kosong."
            )

        stacked = np.stack(
            [
                self.normalize_embedding(x)
                for x in embeddings
            ],
            axis=0,
        )

        mean_embedding = np.mean(
            stacked,
            axis=0,
        )

        return self.normalize_embedding(
            mean_embedding
        )


speaker_engine = SpeakerEngine()
