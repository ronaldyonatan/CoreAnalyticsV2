"""Encrypt SQL login passwords with a separate Fernet key, never stored in SQL Server."""
import os
from cryptography.fernet import Fernet


def _cipher() -> Fernet:
    key = os.environ.get('STUDIO_FERNET_KEY', '').strip()
    if not key:
        raise RuntimeError('STUDIO_FERNET_KEY is required')
    return Fernet(key.encode('ascii'))


def encrypt_password(password: str) -> bytes:
    if not password:
        raise ValueError('Password required')
    return _cipher().encrypt(password.encode('utf-8'))


def decrypt_password(ciphertext: bytes) -> str:
    return _cipher().decrypt(ciphertext).decode('utf-8')
