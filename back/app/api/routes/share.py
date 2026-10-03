"""
WheatGuard AI – Public Share Routes

Authenticated (owner-only):
  POST   /api/v1/share                    → enable sharing, returns secure token
  GET    /api/v1/share/status/{id}        → current share state for a prediction
  DELETE /api/v1/share/{prediction_id}    → disable sharing (link stops working)

Public (no auth — whitelisted fields only):
  GET    /api/v1/share/{share_token}      → full share-safe diagnosis report

Share links use a cryptographically random token (Python `secrets`,
unrelated to the row UUID), so private prediction IDs are never exposed.
Disabled sharing → 410; deleted/unknown token → identical 404 so the
endpoint can't be used to probe which predictions ever existed.

Never returned here: user_id/email, filename, image_hash, credentials,
admin data. The ai_report is safe to share — it is generated purely from
disease class + confidence + the public KB.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.core.exceptions import DatabaseError, RecordNotFoundError
from app.core.logging import get_logger
from app.database.crud import (
    disable_prediction_share,
    enable_prediction_share,
    get_prediction_by_share_token,
    get_share_status,
    list_shared_predictions,
)
from app.ml.disease_service import get_disease_info

router = APIRouter(prefix="/api/v1", tags=["Share"])
logger = get_logger(__name__)

# Tokens come from secrets.token_urlsafe(16) → [A-Za-z0-9_-]{22}. Accept a
# slightly wider shape for future-proofing; anything else is "not found".
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{8}([A-Za-z0-9_-]{0,38})$")

_NOT_FOUND_MSG = "This prediction is no longer available."
_DISABLED_MSG = "This prediction is no longer publicly shared."


# ── Schemas ───────────────────────────────────────────────────────────────────

class ShareEnableRequest(BaseModel):
    prediction_id: str = Field(min_length=1, max_length=64)


class ShareStatusResponse(BaseModel):
    share_enabled: bool
    share_token: str | None = None


class ShareTokenResponse(BaseModel):
    share_token: str
    share_enabled: bool


class SharedPredictionItem(BaseModel):
    """One of the caller's currently-shared predictions for the 'Manage shared
    reports' list. Owner-safe columns only."""

    prediction_id: str
    predicted_class: str
    confidence_pct: float | None = None
    created_at: datetime | None = None
    share_token: str


class SharedPredictionListResponse(BaseModel):
    items: list[SharedPredictionItem] = Field(default_factory=list)


class DiseaseBrief(BaseModel):
    """General wheat-disease knowledge — identical to the public /diseases KB."""

    display_name: str
    description: str = ""
    symptoms: list[str] = Field(default_factory=list)
    prevention: list[str] = Field(default_factory=list)
    management: list[str] = Field(default_factory=list)
    severity: str = "unknown"
    risk_level: str = "unknown"
    disclaimer: str = ""


class AiReportBrief(BaseModel):
    """Stored EntryRank-style diagnosis report — text about the disease only."""

    title: str = "EntryRank Detection"
    problem: str = ""
    recommendation: str = ""
    solution: str = ""
    generated_by: str = ""


class SharePrediction(BaseModel):
    """Whitelisted public view of a prediction — no private fields ever added."""

    prediction_id: str
    predicted_class: str
    confidence: float = Field(ge=0.0, le=1.0)
    confidence_pct: float = Field(ge=0.0, le=100.0)
    low_confidence: bool
    severity: str
    created_at: datetime
    image_url: str | None = Field(
        default=None,
        description=(
            "Public Supabase Storage URL (https only). Base64 data-URI "
            "fallbacks are stripped — social crawlers cannot read them."
        ),
    )
    recommendation: str | None = None
    top_predictions: list[dict[str, Any]] = Field(default_factory=list)
    model_version: str | None = None
    disease: DiseaseBrief
    ai_report: AiReportBrief | None = None


def _build_public_view(record, share_enabled: bool) -> SharePrediction:
    """Map a stored record to the whitelisted public payload (single source
    of truth — the share page shows exactly these stored values)."""
    image_url = record.image_url or ""
    public_image = image_url if image_url.startswith(("http://", "https://")) else None

    # General KB entry (same data the public /api/v1/diseases route serves)
    # — picked by THIS prediction's class only, never another record's.
    info = get_disease_info(record.predicted_class)
    disease = DiseaseBrief(
        display_name=str(info.get("display_name") or record.predicted_class.replace("_", " ")),
        description=str(info.get("description", "")),
        symptoms=[str(s) for s in info.get("symptoms", []) if s],
        prevention=[str(p) for p in info.get("prevention", []) if p],
        management=[str(m) for m in info.get("management", []) if m],
        severity=str(info.get("severity", "unknown")),
        risk_level=str(info.get("risk_level", "unknown")),
        disclaimer=str(info.get("disclaimer", "")),
    )

    raw_report = record.ai_report if isinstance(record.ai_report, dict) else None
    ai_report = (
        AiReportBrief(
            title=str(raw_report.get("title") or "EntryRank Detection"),
            problem=str(raw_report.get("problem") or ""),
            recommendation=str(raw_report.get("recommendation") or ""),
            solution=str(raw_report.get("solution") or ""),
            generated_by=str(raw_report.get("generated_by") or ""),
        )
        if raw_report
        else None
    )

    return SharePrediction(
        prediction_id=record.id,
        predicted_class=record.predicted_class,
        confidence=record.confidence,
        confidence_pct=record.confidence_pct,
        low_confidence=record.low_confidence,
        severity=record.severity,
        created_at=record.created_at,
        image_url=public_image,
        recommendation=record.recommendation,
        top_predictions=record.top_predictions or [],
        model_version=record.model_version,
        disease=disease,
        ai_report=ai_report,
    )


# ── Authenticated owner endpoints ─────────────────────────────────────────────

@router.post(
    "/share",
    response_model=ShareTokenResponse,
    summary="Enable public sharing for own prediction",
    description=(
        "Creates (or re-activates) a secure random share token for a "
        "prediction owned by the calling user. Idempotent — repeated calls "
        "return the same token."
    ),
)
async def enable_share(
    body: ShareEnableRequest,
    user_id: str = Depends(get_current_user_id),
) -> ShareTokenResponse:
    try:
        result = enable_prediction_share(body.prediction_id, user_id=user_id)
    except RecordNotFoundError:
        # Same 404 whether it doesn't exist or belongs to someone else —
        # never leaks other users' predictions.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_MSG)
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)
    return ShareTokenResponse(**result)


@router.get(
    "/share/status/{prediction_id}",
    response_model=ShareStatusResponse,
    summary="Share state of own prediction",
)
async def share_status(
    prediction_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ShareStatusResponse:
    try:
        row = get_share_status(prediction_id, user_id=user_id)
    except RecordNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_MSG)
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)
    return ShareStatusResponse(
        share_enabled=bool(row.get("share_enabled")),
        share_token=row.get("share_token"),
    )


@router.delete(
    "/share/{prediction_id}",
    response_model=ShareStatusResponse,
    summary="Disable public sharing for own prediction",
)
async def disable_share(
    prediction_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ShareStatusResponse:
    try:
        result = disable_prediction_share(prediction_id, user_id=user_id)
    except RecordNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_MSG)
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)
    return ShareStatusResponse(**result)


@router.get(
    "/share/mine",
    response_model=SharedPredictionListResponse,
    summary="List the caller's active public share links",
)
async def list_my_shares(
    user_id: str = Depends(get_current_user_id),
) -> SharedPredictionListResponse:
    # Declared before the public `/share/{share_token}` route so the literal
    # path 'mine' is never mistaken for a token.
    rows = list_shared_predictions(user_id)
    items = [
        SharedPredictionItem(
            prediction_id=str(r.get("id")),
            predicted_class=str(r.get("predicted_class") or ""),
            confidence_pct=r.get("confidence_pct"),
            created_at=r.get("created_at"),
            share_token=str(r.get("share_token") or ""),
        )
        for r in rows
        if r.get("id") and r.get("share_token")
    ]
    return SharedPredictionListResponse(items=items)


# ── Public view (token resolves the record) ──────────────────────────────────

@router.get(
    "/share/{share_token}",
    response_model=SharePrediction,
    summary="Public share view of a prediction",
    description=(
        "Returns a privacy-safe full diagnosis summary for the public share "
        "page. No authentication; only whitelisted fields are exposed. "
        "The ML model is NEVER re-run — every value is the stored record."
    ),
    responses={
        404: {"description": "Unknown token or deleted prediction"},
        410: {"description": "Owner disabled sharing"},
        503: {"description": "Database unavailable"},
    },
)
async def get_shared_prediction(share_token: str) -> SharePrediction:
    if not _TOKEN_RE.match(share_token):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_MSG)

    try:
        record, enabled = get_prediction_by_share_token(share_token)
    except RecordNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_MSG)
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)

    if not enabled:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=_DISABLED_MSG)

    return _build_public_view(record, enabled)
