from __future__ import annotations

import json
import os

import requests


BASE_URL = os.getenv(
    "VOICE_API_URL",
    "http://127.0.0.1:5001",
)


def dump(title, response):
    print()
    print("=" * 72)
    print(title)
    print("HTTP:", response.status_code)
    try:
        print(
            json.dumps(
                response.json(),
                indent=2,
                ensure_ascii=False,
                default=str,
            )
        )
    except Exception:
        print(response.text)


def main():
    response = requests.get(
        f"{BASE_URL}/api/management/users",
        params={
            "page": 1,
            "page_size": 20,
            "status": "all",
        },
        timeout=30,
    )

    dump(
        "USER DIRECTORY",
        response,
    )

    if not response.ok:
        return

    data = response.json()

    items = data.get(
        "items",
        [],
    )

    if items:
        first = items[0]
        print()
        print(
            "First user:",
            first.get(
                "display_name"
            ),
            first.get(
                "username"
            ),
            "active=",
            first.get(
                "is_active"
            ),
        )


if __name__ == "__main__":
    main()
