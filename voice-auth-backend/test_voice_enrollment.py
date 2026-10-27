import argparse
import json

from app.services.enrollment_service import enrollment_service


def main():
    parser = argparse.ArgumentParser(
        description="Enroll 5+ voice samples into CoreAnalytics."
    )

    parser.add_argument(
        "--user-id",
        required=True,
    )

    parser.add_argument(
        "audio",
        nargs="+",
        help="5 atau lebih file audio enrollment.",
    )

    args = parser.parse_args()

    result = enrollment_service.enroll_from_files(
        user_id=args.user_id,
        audio_paths=args.audio,
    )

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
