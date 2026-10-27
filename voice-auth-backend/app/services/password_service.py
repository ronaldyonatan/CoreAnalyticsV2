from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
PASSWORD_POLICY_MESSAGE = (
    "Password harus 8-128 karakter dan wajib mengandung "
    "huruf besar, huruf kecil, angka, dan karakter khusus."
)


def validate_password_policy(password: str) -> tuple[bool, str, str]:
    """Validate the canonical CoreAnalytics password policy.

    Returns:
        (is_valid, code, message)
    """
    if not password:
        return False, "PASSWORD_REQUIRED", "Password wajib diisi."

    if len(password) < PASSWORD_MIN_LENGTH:
        return False, "PASSWORD_TOO_SHORT", PASSWORD_POLICY_MESSAGE

    if len(password) > PASSWORD_MAX_LENGTH:
        return False, "PASSWORD_TOO_LONG", PASSWORD_POLICY_MESSAGE

    if not any(char.isupper() for char in password):
        return False, "PASSWORD_UPPERCASE_REQUIRED", PASSWORD_POLICY_MESSAGE

    if not any(char.islower() for char in password):
        return False, "PASSWORD_LOWERCASE_REQUIRED", PASSWORD_POLICY_MESSAGE

    if not any(char.isdigit() for char in password):
        return False, "PASSWORD_NUMBER_REQUIRED", PASSWORD_POLICY_MESSAGE

    if not any(
        not char.isalnum() and not char.isspace()
        for char in password
    ):
        return False, "PASSWORD_SPECIAL_REQUIRED", PASSWORD_POLICY_MESSAGE

    return True, "PASSWORD_VALID", "Password memenuhi policy."


def hash_password(password: str) -> str:
    is_valid, _code, message = validate_password_policy(password)
    if not is_valid:
        raise ValueError(message)

    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False
