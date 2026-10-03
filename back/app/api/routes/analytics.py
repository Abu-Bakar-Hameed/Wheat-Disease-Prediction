"""
WheatGuard AI – Analytics Routes
GET /api/v1/history/timeseries  →  daily prediction counts over last N days
GET /api/v1/history/trends      →  full trend data for a time range
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.core.exceptions import DatabaseError
from app.core.logging import get_logger
from app.database.crud import get_predictions_over_time, get_trends

router = APIRouter(prefix="/api/v1", tags=["Analytics"])
logger = get_logger(__name__)

# ── Response schema for /trends ───────────────────────────────────────────────

class DailyPoint(BaseModel):
    date: str
    count: int

class ConfidencePoint(BaseModel):
    date: str
    avg_confidence: float
    count: int

class TrendsResponse(BaseModel):
    range: str
    total_predictions: int
    healthy_predictions: int
    diseased_predictions: int
    critical_cases: int
    high_cases: int
    moderate_cases: int
    average_confidence: float
    max_confidence: float
    min_confidence: float
    most_common_disease: str | None
    disease_distribution: dict[str, int]
    severity_distribution: dict[str, int]
    daily_predictions: list[DailyPoint]
    confidence_trend: list[ConfidencePoint]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/history/timeseries",
    summary="Prediction time series",
    description="Returns daily prediction counts for the last N days. Used for analytics charts.",
    responses={503: {"description": "Database unavailable"}},
)
async def get_timeseries(
    days: int = Query(default=30, ge=7, le=365, description="Number of days to look back"),
    user_id: str = Depends(get_current_user_id),
) -> list[dict]:
    """Return daily prediction counts for the calling user's analytics dashboard."""
    try:
        return get_predictions_over_time(user_id=user_id, days=days)
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)


@router.get(
    "/history/trends",
    response_model=TrendsResponse,
    summary="Prediction trends by time range",
    description=(
        "Returns aggregated trend data filtered by time range.\n\n"
        "**range** options: `7d` | `30d` | `90d` | `all`\n\n"
        "Returns: summary stats, disease distribution, severity distribution, "
        "daily prediction counts, and daily average confidence — all scoped to the range."
    ),
    responses={
        200: {"description": "Trend data for the requested range"},
        503: {"description": "Database unavailable"},
    },
)
async def get_trends_endpoint(
    range: str = Query(
        default="30d",
        description="Time range: 7d | 30d | 90d | all",
        pattern="^(7d|30d|90d|all)$",
    ),
    user_id: str = Depends(get_current_user_id),
) -> TrendsResponse:
    """
    Return full trend analytics for a given time range, scoped to the
    calling user's own predictions.

    All values are calculated from real Supabase data.
    Nothing is hard-coded or fabricated.
    """
    try:
        data = get_trends(range, user_id=user_id)
        return TrendsResponse(**data)
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)