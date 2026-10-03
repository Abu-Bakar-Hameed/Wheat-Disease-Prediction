"""
WheatGuard AI – User Activity Route
POST /api/v1/activity/events — record a meaningful client-side activity event.

Security model:
  • The event is attributed to the AUTHENTICATED user (JWT `sub`) — the
    client can never record activity for another user.
  • Event types are whitelisted (CLIENT_EVENT_TYPES) so arbitrary rows can
    never be injected into the analytics table. Server-side events
    (user_registered / user_login / user_logout / prediction_created) are
    written by trusted services only and are rejected here.
  • Recording is best-effort: the endpoint reports `recorded: false` rather
    than failing when the activity store is unavailable.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.core.logging import get_logger
from app.database.activity_crud import CLIENT_EVENT_TYPES, record_activity

router = APIRouter(prefix="/api/v1/activity", tags=["Activity"])
logger = get_logger(__name__)


class ActivityEventIn(BaseModel):
    """A client-reported activity event (event_type must be whitelisted)."""

    event_type: str = Field(..., description="Whitelisted client event type")
    prediction_id: Optional[str] = Field(default=None, max_length=64)
    metadata: Optional[dict[str, Any]] = Field(default=None)


class ActivityEventOut(BaseModel):
    recorded: bool


@router.post(
    "/events",
    response_model=ActivityEventOut,
    status_code=status.HTTP_201_CREATED,
    summary="Record a user activity event",
    description=(
        "Fire-and-forget activity tracking used by the frontend "
        "(calendar opened, history viewed, prediction details viewed, "
        "notification interactions). The event is always attributed to "
        "the authenticated user."
    ),
)
async def record_event(
    payload: ActivityEventIn,
    user_id: str = Depends(get_current_user_id),
) -> ActivityEventOut:
    event_type = (payload.event_type or "").strip().lower()

    if event_type not in CLIENT_EVENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported event_type '{payload.event_type}'.",
        )

    recorded = record_activity(
        user_id=user_id,
        event_type=event_type,
        prediction_id=payload.prediction_id,
        metadata=payload.metadata,
    )
    return ActivityEventOut(recorded=recorded)
