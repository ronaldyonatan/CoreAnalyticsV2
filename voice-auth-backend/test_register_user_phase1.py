from app.clients.core_api_client import core_api
from app.services.password_service import hash_password


def main():
    password_hash = hash_password("Test123!")

    result = core_api.register_user(
        username="ronald",
        display_name="Ronald Yonatan",
        password_hash=password_hash,
    )

    print(result)


if __name__ == "__main__":
    main()
