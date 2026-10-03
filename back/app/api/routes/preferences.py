"""
WheatGuard AI – User Preferences Route  (DEPRECATED shim)

Historically this stored per-user localization/detection defaults in a separate
`user_preferences` table, giving the app TWO competing settings stores. The
settings restructure consolidated everything into `user_settings`, so this module
is now a thin, backward-compatible shim:

  • GET  /api/v1/preferences  → reads language + measurement from user_settings
  • PUT  /api/v1/preferences  → writes language + measurement (units) back to it

It is kept ONLY so any legacy client still pointed at these paths keeps working
against the same single source of truth. It no longer owns a table of its own.

`confidence_threshold` / `scan_quality` are accepted for request-shape
compatibility but are NOT persisted: detection thresholds are configured
server-side (admin settings), never per user, so storing them here would be a
phantom value nothing reads. They echo back their defaults.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.core.logging import get_logger
from app.database.database import get_supabase_client

router = APIRouter(prefix="/api/v1", tags=["Preferences"])
logger = get_logger(__name__)

# Single source of truth — the same table the settings UI writes to.
_SETTINGS_TABLE = "user_settings"


class UserPreferences(BaseModel):
    language: str = Field(default="en", max_length=10)
    measurement: str = Field(default="metric", max_length=20)
    confidence_threshold: int = Field(default=70, ge=0, le=100)
    scan_quality: str = Field(default="standard", max_length=20)


def _now() -> str:
    """ISO-8601 UTC timestamp (PostgREST rejects the SQL literal "now()")."""
    return datetime.now(timezone.utc).isoformat()


def _get_settings_row(user_id: str) -> dict:
    try:
        client = get_supabase_client()
        resp = (
            client.table(_SETTINGS_TABLE)
            .select("language,units")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return resp.data or {}
    except Exception as exc:
        logger.warning("Could not read user_settings (preferences shim): %s", exc)
        return {}


@router.get(
    "/preferences",
    response_model=UserPreferences,
    status_code=status.HTTP_200_OK,
    deprecated=True,
    summary="Get user preferences (legacy shim over user_settings)",
)
async def get_preferences(user_id: str = Depends(get_current_user_id)) -> UserPreferences:
    row = _get_settings_row(user_id)
    return UserPreferences(
        language=row.get("language") or "en",
        measurement=row.get("units") or "metric",
    )


@router.put(
    "/preferences",
    response_model=UserPreferences,
    status_code=status.HTTP_200_OK,
    deprecated=True,
    summary="Save user preferences (legacy shim over user_settings)",
)
async def save_preferences(
    body: UserPreferences,
    user_id: str = Depends(get_current_user_id),
) -> UserPreferences:
    # Persist only the two fields that have a real home in user_settings. PostgREST
    # upsert updates just the supplied columns, so any other settings on the row are
    # left untouched; a brand-new row inherits the table's safe defaults.
    try:
        client = get_supabase_client()
        client.table(_SETTINGS_TABLE).upsert(
            {
                "user_id": user_id,
                "language": body.language,
                "units": body.measurement,
                "updated_at": _now(),
            },
            on_conflict="user_id",
        ).execute()
        logger.info("user_settings updated via preferences shim for user=%s", user_id)
    except Exception as exc:
        logger.warning("Could not save preferences shim: %s", exc)
        # Non-fatal — return what was sent so the caller's optimistic UI holds.
    return body
