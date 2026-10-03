"""
WheatGuard AI – Model Information Route
GET /api/v1/model/info  →  metadata about the loaded AI model
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from app.core.config import settings
from app.core.logging import get_logger
from app.ml.inference import model_manager
from app.schemas.history import ModelInfoResponse

router = APIRouter(prefix="/api/v1", tags=["Model"])
logger = get_logger(__name__)


@router.get(
    "/model/info",
    response_model=ModelInfoResponse,
    summary="Model information",
    description=(
        "Returns metadata about the currently loaded AI model: "
        "architecture, version, supported classes, input size, and Grad-CAM support."
    ),
)
async def get_model_info() -> ModelInfoResponse:
    """Return metadata about the loaded EfficientNet model."""
    meta = model_manager.metadata

    return ModelInfoResponse(
        model_name="Wheat Disease Classifier",
        model_version=meta.get("model_version", "unknown"),
        architecture=meta.get("architecture", "efficientnet_b0"),
        supported_classes=model_manager.num_classes,
        classes=model_manager.class_names,
        input_size=f"{settings.image_size}x{settings.image_size}",
        device=model_manager.device,
        gradcam_supported=model_manager.is_loaded,
        loaded=model_manager.is_loaded,
    )


def _load_report() -> dict[str, Any]:
    """Read the real test-set evaluation report written by
    scripts/compute_test_metrics.py (empty dict if it has not been run)."""
    rp = Path("artifacts/reports/classification_report.json")
    if rp.exists():
        try:
            return json.loads(rp.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


@router.get(
    "/model/metrics",
    summary="Model evaluation metrics",
    description=(
        "Real accuracy / precision / recall / F1 for the deployed model, "
        "measured on the held-out test split. User-accessible (no admin role "
        "required) so the dashboard performance card can render genuine "
        "numbers. Values are percentages (0-100) or null when no evaluation "
        "has been run yet."
    ),
)
async def model_metrics() -> dict[str, Any]:
    meta = model_manager.metadata or {}
    report = _load_report()

    def _metric(meta_key: str, report_key: str) -> float | None:
        for candidate in (meta.get(meta_key), report.get(report_key)):
            if isinstance(candidate, (int, float)) and candidate == candidate:
                return float(candidate)
        return None

    per_class = report.get("per_class") or {}
    evaluated = report.get("classes_evaluated") or []
    recall_per_class = {
        name: round(float(per_class[name]["recall"]) * 100, 1)
        for name in evaluated
        if isinstance(per_class.get(name), dict)
        and isinstance(per_class[name].get("recall"), (int, float))
    }

    return {
        "model_version": meta.get("model_version"),
        "accuracy": _metric("test_accuracy", "accuracy"),
        "precision": _metric("test_precision", "precision"),
        "recall": _metric("test_recall", "recall"),
        "f1": _metric("test_f1", "f1"),
        "macro_f1": report.get("macro_f1"),
        "n_test_images": report.get("n_test_images"),
        "recall_per_class": recall_per_class,
        "evaluated": _metric("test_accuracy", "accuracy") is not None,
    }
