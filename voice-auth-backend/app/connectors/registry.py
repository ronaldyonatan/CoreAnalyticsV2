"""Phase 2.1 connector capability registry (server-side, allowlisted)."""
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ConnectorSpec:
    kind: str
    capabilities: frozenset[str]
    bind_source: Callable


_REGISTRY: dict[str, ConnectorSpec] = {}


def register(spec: ConnectorSpec) -> None:
    if not isinstance(spec, ConnectorSpec) or not spec.kind or not spec.kind.isidentifier():
        raise ValueError('CONNECTOR_INVALID')
    if spec.kind in _REGISTRY:
        raise ValueError('CONNECTOR_DUPLICATE')
    if not callable(spec.bind_source):
        raise ValueError('CONNECTOR_INVALID')
    _REGISTRY[spec.kind] = spec


def get(kind: str) -> ConnectorSpec:
    # Never dynamically import modules based on browser or persisted metadata.
    if not isinstance(kind, str) or kind not in _REGISTRY:
        raise ValueError('CONNECTOR_UNSUPPORTED')
    return _REGISTRY[kind]


def capabilities():
    return {name: sorted(spec.capabilities) for name, spec in sorted(_REGISTRY.items())}
