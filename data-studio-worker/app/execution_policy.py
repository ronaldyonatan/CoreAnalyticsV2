"""Request-scoped preview limits; batch execution preserves complete source values."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from pyspark.sql import functions as F


@dataclass(frozen=True)
class ExecutionPolicy:
    mode: str = 'preview'
    text_limit: int | None = 256
    row_parameter_limit: int = 50
    column_limit: int = 30


_POLICY = ContextVar('studio_execution_policy', default=ExecutionPolicy())


def policy(): return _POLICY.get()


def bound_text(value):
    limit = policy().text_limit
    return value if limit is None else F.substring(value, 1, limit)


@contextmanager
def batch_execution():
    token = _POLICY.set(ExecutionPolicy(mode='batch', text_limit=None, row_parameter_limit=2_147_483_647, column_limit=2048))
    try: yield
    finally: _POLICY.reset(token)
