import os
from dataclasses import dataclass

from dotenv import load_dotenv


# Membaca file .env dari root voice-auth-backend
load_dotenv()


@dataclass(frozen=True)
class Settings:

    # =========================================================
    # BEAM / CORE API
    # =========================================================

    core_api_url: str = os.getenv(
        "CORE_API_URL",
        ""
    ).rstrip("/")

    core_api_timeout: int = int(
        os.getenv(
            "CORE_API_TIMEOUT",
            "30"
        )
    )

    # =========================================================
    # BEAM HEADERS
    # =========================================================

    beam_x_connection: str = os.getenv(
        "BEAM_X_CONNECTION",
        ""
    )

    beam_x_token: str = os.getenv(
        "BEAM_X_TOKEN",
        ""
    )

    # =========================================================
    # VOICE STORAGE
    # =========================================================

    voice_storage_root: str = os.getenv(
        "VOICE_STORAGE_ROOT",
        "storage/voice"
    )


settings = Settings()


# =============================================================
# BASIC VALIDATION
# =============================================================

if not settings.core_api_url:
    raise RuntimeError(
        "CORE_API_URL belum diisi di file .env"
    )

if not settings.beam_x_connection:
    raise RuntimeError(
        "BEAM_X_CONNECTION belum diisi di file .env"
    )

if not settings.beam_x_token:
    raise RuntimeError(
        "BEAM_X_TOKEN belum diisi di file .env"
    )