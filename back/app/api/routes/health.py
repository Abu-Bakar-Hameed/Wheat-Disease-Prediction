"""
WheatGuard AI – Health Route
GET /health  →  system status: API, AI model, database connectivity.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.core.logging import get_logger
from app.database.database import check_database_health
from app.ml.inference import model_manager
from app.schemas.history import HealthResponse

router = APIRouter(tags=["Health"])
logger = get_logger(__name__)


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System health check",
    description=(
        "Returns the operational status of the API, the AI model, "
        "and the Supabase database connection.\n\n"
        "- `status`: 'healthy' when all components are up, 'degraded' otherwise\n"
        "- `api`: always 'healthy' if this endpoint responds\n"
        "- `model`: 'loaded' or 'not_loaded'\n"
        "- `database`: 'healthy' or 'unavailable'"
    ),
    responses={
        200: {"description": "Health check response (may be 'degraded' if components are down)"},
    },
)
async def health_check() -> HealthResponse:
    """
    Lightweight health probe used by load balancers and monitoring tools.

    Returns ``status: healthy`` only when both the model and database are up.
    Returns ``status: degraded`` when one or more components are unavailable.
    """
    db_ok = await check_database_health()
    model_ok = model_manager.is_loaded

    overall = "healthy" if (model_ok and db_ok) else "degraded"
    model_status = "loaded" if model_ok else "not_loaded"
    db_status = "healthy" if db_ok else "unavailable"

    logger.debug(
        "Health check: status=%s model=%s database=%s",
        overall,
        model_status,
        db_status,
    )

    return HealthResponse(
        status=overall,
        api="healthy",
        model=model_status,
        database=db_status,
        model_loaded=model_ok,
        model_version=model_manager.metadata.get("model_version", "unknown"),
        num_classes=model_manager.num_classes,
        device=model_manager.device,
        app_version=settings.app_version,
    )
