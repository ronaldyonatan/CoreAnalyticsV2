"""Server-side RBAC contract. Never trust localStorage, username, or client-supplied menus."""
from dataclasses import dataclass

@dataclass(frozen=True)
class VerifiedPrincipal:
    user_id: str
    permitted_routes: frozenset[str]


def require_data_studio(principal: VerifiedPrincipal | None) -> str:
    if principal is None or not principal.user_id:
        raise PermissionError('AUTH_REQUIRED')
    if 'data_studio' not in principal.permitted_routes:
        raise PermissionError('DATA_STUDIO_FORBIDDEN')
    return principal.user_id
