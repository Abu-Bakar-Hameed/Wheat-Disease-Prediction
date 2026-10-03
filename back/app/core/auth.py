"""
WheatGuard AI - Authentication Dependencies

Verifies the JWT issued by the Node/Express auth backend
(see utils/jwt.js -> signAccessToken / signRefreshToken, and
auth.controller.js -> login/adminLogin/verifyOtp, which all sign a
payload shaped like {sub, email, name, role}) and extracts the
current user's id / role so routes can scope data to that one user,
or require the "admin" role.

IMPORTANT: `settings.jwt_secret_key` (env var JWT_SECRET) must be set
to the EXACT SAME value as the Node backend's JWT signing secret, and
`settings.jwt_algorithm` must match too (Node's `jsonwebtoken` package
defaults to HS256 unless configured otherwise). If these don't match,
every request will fail with 401 even though the token is valid.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Token invalidation ("sign out everywhere" / password change) ─────────────
# user_settings.password_changed_at is the threshold: any token whose `iat`
# predates it was issued before the last credential change and is dead, even
# though the signature is still valid. The lookup is cached per user for
# _REVOCATION_TTL_S so authenticated requests don't hit Postgres every time,
# and it FAILS OPEN while the settings-restructure migration is unapplied
# (a missing column must never lock everyone out of the API).
_REVOCATION_TTL_S = 60.0
_revocation_cache: dict[str, tuple[float, float | None]] = {}


def _password_changed_epoch(user_id: str) -> float | None:
    """Unix timestamp of the caller's last credential change, or None."""
    now = time.monotonic()
    cached = _revocation_cache.get(user_id)
    if cached and now - cached[0] < _REVOCATION_TTL_S:
        return cached[1]
    epoch: float | None = None
    try:
        # Local import: database.py pulls config/logging; keeping it here also
        # avoids any import-order surprise between the auth and DB layers.
        from app.database.database import get_supabase_client

        resp = (
            get_supabase_client()
            .table("user_settings")
            .select("password_changed_at")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        raw = (resp.data or {}).get("password_changed_at")
        if raw:
            epoch = datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
    except Exception as exc:
        logger.debug("revocation check degraded (fail-open) for %s: %s", user_id, exc)
    _revocation_cache[user_id] = (now, epoch)
    return epoch


def _decode_bearer_token(authorization: str | None) -> dict[str, Any]:
    """
    Shared implementation: extract the Bearer token from the Authorization
    header and verify/decode it against the shared JWT secret.

    Raises 401 if the header is missing/malformed or the token is
    invalid/expired, and 500 if the server itself isn't configured
    with a JWT secret yet.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header.",
        )

    token = authorization.split(" ", 1)[1].strip()

    if not settings.jwt_secret_key:
        logger.error(
            "JWT_SECRET is not configured on the FastAPI backend - set it "
            "to the same value the Node auth backend uses to sign tokens, "
            "or every authenticated request will fail."
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server authentication is not configured.",
        )

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            # The Node backend signs with issuer "auth-api" (see utils/jwt.js).
            # Passing it here makes the check explicit rather than implicit.
            issuer="auth-api",
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc

    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing the required subject (sub) claim.",
        )

    # Reject tokens issued before the user's last password/credential change
    # (Settings → Security → "Sign out everywhere" / change password).
    changed_at = _password_changed_epoch(str(payload["sub"]))
    if changed_at is not None:
        iat = payload.get("iat")
        if iat is not None and float(iat) < changed_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has ended. Please sign in again.",
            )

    return payload


async def get_current_user_claims(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    FastAPI dependency: verifies the Bearer token and returns the full
    decoded payload ({sub, email, name, role, ...}).
    """
    return _decode_bearer_token(authorization)


async def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """
    FastAPI dependency: extracts and verifies the Bearer token from the
    Authorization header, returning the user's id (the JWT `sub` claim).
    """
    payload = _decode_bearer_token(authorization)
    return str(payload["sub"])


async def require_admin(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    FastAPI dependency: verifies the Bearer token AND requires the
    decoded payload's `role` claim to be "admin" (matching the role set
    by adminLogin() in the Node backend's auth.controller.js).

    Use this on every admin-only route - e.g.:
        router = APIRouter(prefix="/api/v1/admin", dependencies=[Depends(require_admin)])

    Raises 401 if the token is missing/invalid, 403 if it is valid but
    the caller isn't an admin.
    """
    payload = _decode_bearer_token(authorization)
    role = str(payload.get("role") or "").lower()
    if role != "admin":
        logger.warning(
            "Admin route access denied: user=%s role=%s",
            payload.get("sub"),
            payload.get("role"),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges are required to access this resource.",
        )
    return payload
