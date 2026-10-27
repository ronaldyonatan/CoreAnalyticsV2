from pathlib import Path

from app.config import settings


class LocalVoiceStorage:

    def __init__(self):
        self.root = Path(
            settings.voice_storage_root
        )

    def save_enrollment_sample(
        self,
        user_id,
        sample_no,
        audio_bytes
    ):
        user_directory = (
            self.root
            / str(user_id)
            / "enrollment"
        )

        user_directory.mkdir(
            parents=True,
            exist_ok=True
        )

        filename = (
            f"sample_"
            f"{sample_no:03d}.wav"
        )

        full_path = (
            user_directory
            / filename
        )

        full_path.write_bytes(
            audio_bytes
        )

        # Yang disimpan ke DB nanti hanya
        # logical/relative storage path
        storage_path = (
            f"voice/"
            f"{user_id}/"
            f"enrollment/"
            f"{filename}"
        )

        return storage_path


voice_storage = LocalVoiceStorage()