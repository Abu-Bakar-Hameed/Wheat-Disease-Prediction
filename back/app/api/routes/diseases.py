"""
WheatGuard AI – Diseases Route
GET /api/v1/diseases              →  list all supported disease classes
GET /api/v1/diseases/{name}       →  full info for one disease class
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.logging import get_logger
from app.database import admin_crud
from app.schemas.history import DiseaseDetail, DiseasesResponse

router = APIRouter(prefix="/api/v1", tags=["Diseases"])
logger = get_logger(__name__)


@router.get(
    "/diseases",
    response_model=DiseasesResponse,
    summary="List all active diseases",
    description="Returns full information for all active wheat disease records from the database.",
)
async def list_diseases() -> DiseasesResponse:
    """Return all active diseases from the database."""
    all_diseases = admin_crud.list_diseases()
    active = [DiseaseDetail(**d) for d in all_diseases if d.get("status") == "active"]
    return DiseasesResponse(diseases=active, total=len(active))


@router.get(
    "/diseases/{disease_name}",
    response_model=DiseaseDetail,
    summary="Get disease by name or ID",
    description="Returns full information for a specific active wheat disease.",
    responses={
        404: {"description": "Disease not found"},
    },
)
async def get_disease(disease_name: str) -> DiseaseDetail:
    """Return full information for a single active disease."""
    all_diseases = admin_crud.list_diseases()
    q = disease_name.lower()
    target = next(
        (
            d for d in all_diseases
            if (str(d.get("id")) == disease_name or (d.get("name") or "").lower() == q or (d.get("display_name") or "").lower() == q)
            and d.get("status") == "active"
        ),
        None,
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Disease '{disease_name}' not found.",
        )
    return DiseaseDetail(**target)

