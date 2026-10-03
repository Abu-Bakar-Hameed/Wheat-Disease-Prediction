"""
WheatGuard AI – History Routes
GET  /api/v1/history          →  paginated, filterable, sortable prediction history
GET  /api/v1/history/stats    →  comprehensive aggregate statistics
GET  /api/v1/history/{id}     →  single prediction by UUID
DELETE /api/v1/history/{id}   →  delete a single record
"""

from __future__ import annotations

import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import get_current_user_id
from app.core.exceptions import DatabaseError, RecordNotFoundError
from app.core.logging import get_logger
from app.database.crud import (
    delete_prediction,
    get_prediction_by_id,
    get_prediction_stats,
    get_recent_predictions,
)
from app.database.database import get_supabase_client
from app.database.models import PredictionRecord
from app.database.storage import delete_file_from_storage
from app.schemas.history import HistoryItem, HistoryResponse, StatsResponse

router = APIRouter(prefix="/api/v1", tags=["History"])
logger = get_logger(__name__)


def _record_to_item(record: PredictionRecord) -> HistoryItem:
    """Convert a PredictionRecord dataclass to a HistoryItem schema."""
    return HistoryItem(
        id=record.id,
        filename=record.filename,
        predicted_class=record.predicted_class,
        confidence=record.confidence,
        confidence_pct=record.confidence_pct,
        low_confidence=record.low_confidence,
        severity=record.severity,
        top_predictions=record.top_predictions,
        recommendation=record.recommendation,
        inference_time_ms=record.inference_time_ms,
        model_version=record.model_version,
        image_hash=record.image_hash,
        image_url=record.image_url,
        gradcam_available=record.gradcam_available,
        created_at=record.created_at,
        ai_report=record.ai_report,
    )


@router.get(
    "/history",
    response_model=HistoryResponse,
    summary="List prediction history",
    description=(
        "Returns a paginated, filterable, sortable list of past prediction records.\n\n"
        "**Filters:** `disease`, `severity`, `search` (substring on class name)\n\n"
        "**Sort options:** `newest` | `oldest` | `highest_confidence` | `lowest_confidence`\n\n"
        "**Pagination:** Use `page` or `offset` + `limit`. Response includes `total` "
        "and `total_pages` for full pagination control."
    ),
    responses={
        503: {"description": "Database unavailable"},
    },
)
async def get_history(
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    limit: int = Query(default=20, ge=1, le=100, description="Page size"),
    disease: Optional[str] = Query(default=None, description="Filter by disease class name"),
    severity: Optional[str] = Query(default=None, description="Filter by severity: none/moderate/high/critical"),
    search: Optional[str] = Query(default=None, description="Search substring in predicted class name"),
    sort: str = Query(default="newest", description="Sort: newest | oldest | highest_confidence | lowest_confidence"),
    user_id: str = Depends(get_current_user_id),
) -> HistoryResponse:
    """Fetch filtered and paginated prediction history — scoped to the calling user."""
    offset = (page - 1) * limit
    try:
        records, total = get_recent_predictions(
            user_id=user_id,
            limit=limit,
            offset=offset,
            disease=disease,
            severity=severity,
            search=search,
            sort=sort,
        )
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )

    items = [_record_to_item(r) for r in records]
    total_pages = max(1, math.ceil(total / limit))

    return HistoryResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        offset=offset,
        total_pages=total_pages,
    )


@router.get(
    "/history/stats",
    response_model=StatsResponse,
    summary="Prediction statistics",
    description=(
        "Returns comprehensive aggregate statistics across all stored predictions:\n\n"
        "- Total, healthy, diseased, critical counts\n"
        "- Average confidence score\n"
        "- Most common disease\n"
        "- Class and severity distributions"
    ),
    responses={
        503: {"description": "Database unavailable"},
    },
)
async def get_stats(user_id: str = Depends(get_current_user_id)) -> StatsResponse:
    """Return comprehensive aggregate statistics — scoped to the calling user."""
    try:
        stats = get_prediction_stats(user_id=user_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )
    return StatsResponse(**stats)


@router.get(
    "/history/{prediction_id}",
    response_model=HistoryItem,
    summary="Get prediction by ID",
    description="Retrieve a single prediction record by its UUID.",
    responses={
        404: {"description": "Prediction not found"},
        503: {"description": "Database unavailable"},
    },
)
async def get_prediction(
    prediction_id: str,
    user_id: str = Depends(get_current_user_id),
) -> HistoryItem:
    """Fetch a single prediction record by UUID — only if it belongs to the calling user."""
    try:
        record = get_prediction_by_id(prediction_id, user_id=user_id)
    except RecordNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=exc.message,
        )
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )
    return _record_to_item(record)


@router.delete(
    "/history",
    status_code=status.HTTP_200_OK,
    summary="Delete ALL prediction history",
    description=(
        "Permanently remove every stored prediction for the calling user and any "
        "original images kept in Storage. Backs Settings \u2192 Privacy \u2192 "
        "'Delete all history'. Irreversible. Returns the number of records removed."
    ),
    responses={
        200: {"description": "History cleared"},
        503: {"description": "Database unavailable"},
    },
)
async def clear_history(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Delete every prediction row (and its stored image) owned by the caller.

    Images are removed first because their URLs disappear with the rows. A
    storage delete failure never blocks the row deletion \u2014 orphaned files are
    preferable to a half-cleared history the user asked to wipe. Scoped strictly
    to the JWT sub, so one user can never clear another's data.
    """
    try:
        client = get_supabase_client()
        rows = (
            client.table("predictions")
            .select("id,image_url")
            .eq("user_id", user_id)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not load history to delete: {exc}",
        )

    images_removed = 0
    for r in rows:
        url = r.get("image_url")
        if isinstance(url, str) and url.startswith("http") and delete_file_from_storage(url):
            images_removed += 1

    removed = 0
    try:
        resp = (
            client.table("predictions")
            .delete()
            .eq("user_id", user_id)
            .execute()
        )
        removed = len(resp.data or [])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not delete history: {exc}",
        )

    logger.info(
        "cleared history for user=%s removed=%d images=%d",
        user_id, removed, images_removed,
    )
    return {"deleted": removed, "images_removed": images_removed}


@router.delete(
    "/history/{prediction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a prediction record",
    description="Permanently remove a single prediction record by its UUID.",
    responses={
        204: {"description": "Successfully deleted"},
        404: {"description": "Prediction not found"},
        503: {"description": "Database unavailable"},
    },
)
async def remove_prediction(
    prediction_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Delete a prediction record owned by the calling user. Returns 204 on success, 404 if not found/not owned."""
    try:
        deleted = delete_prediction(prediction_id, user_id=user_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prediction '{prediction_id}' not found.",
        )