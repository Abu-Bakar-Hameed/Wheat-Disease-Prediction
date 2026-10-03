"""
WheatGuard AI – History Pydantic Schemas
Request / response models for the /api/v1/history endpoint.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HistoryItem(BaseModel):
    """A single row from the predictions table, returned in the history list."""

    id: str
    filename: str
    predicted_class: str
    confidence: float = Field(ge=0.0, le=1.0)
    confidence_pct: float = Field(ge=0.0, le=100.0)
    low_confidence: bool
    severity: str = Field(default="unknown")
    top_predictions: list[dict[str, Any]] = Field(default_factory=list)
    recommendation: str | None = None
    inference_time_ms: float | None = None
    model_version: str | None = None
    image_hash: str | None = None
    image_url: str | None = None
    gradcam_available: bool = False
    created_at: datetime
    ai_report: dict[str, Any] | None = None

    model_config = {"from_attributes": True}


class HistoryResponse(BaseModel):
    """Paginated list of prediction history records."""

    items: list[HistoryItem]
    total: int = Field(..., description="Total records in the database (not just this page)")
    page: int = Field(default=1, description="Current page number (1-based)")
    limit: int = Field(..., description="Page size used")
    offset: int = Field(..., description="Page offset used")
    total_pages: int = Field(default=1, description="Total number of pages")

    model_config = {"json_schema_extra": {
        "example": {
            "items": [],
            "total": 128,
            "page": 1,
            "limit": 20,
            "offset": 0,
            "total_pages": 7,
        }
    }}


class StatsResponse(BaseModel):
    """Aggregate statistics across all stored predictions."""

    total_predictions: int
    healthy_predictions: int = 0
    diseased_predictions: int = 0
    critical_cases: int = 0
    average_confidence: float = 0.0
    most_common_disease: str | None = None
    class_distribution: dict[str, int] = Field(default_factory=dict)
    severity_distribution: dict[str, int] = Field(default_factory=dict)

    model_config = {"json_schema_extra": {
        "example": {
            "total_predictions": 128,
            "healthy_predictions": 42,
            "diseased_predictions": 86,
            "critical_cases": 17,
            "average_confidence": 84.7,
            "most_common_disease": "Stem Rust",
            "class_distribution": {"Stem Rust": 30, "Leaf Rust": 25},
            "severity_distribution": {"None": 42, "Moderate": 20, "High": 49, "Critical": 17},
        }
    }}


class HealthResponse(BaseModel):
    """Response model for GET /health."""

    status: str = Field(..., description="'healthy' or 'degraded'")
    api: str = Field(default="healthy", description="API status")
    model: str = Field(default="not_loaded", description="'loaded' or 'not_loaded'")
    database: str = Field(default="unknown", description="'healthy' or 'unavailable'")
    model_loaded: bool
    model_version: str = Field(default="unknown")
    num_classes: int = Field(default=0)
    device: str = Field(default="cpu")
    app_version: str = Field(default="1.0.0")

    model_config = {"json_schema_extra": {
        "example": {
            "status": "healthy",
            "api": "healthy",
            "model": "loaded",
            "database": "healthy",
            "model_loaded": True,
            "model_version": "1.0.0",
            "num_classes": 8,
            "device": "cpu",
            "app_version": "1.0.0",
        }
    }}


class DiseaseDetail(BaseModel):
    """Full disease information entry."""

    id: str | None = None
    name: str
    display_name: str
    category: str = "Fungal"
    description: str = ""
    symptoms: str = ""
    solution: str = ""
    recommendation: str = ""
    prevention: str = ""
    management: str = ""
    image_url: str | None = None
    video_url: str | None = None
    status: str = "active"
    created_at: str | None = None
    updated_at: str | None = None



class DiseasesResponse(BaseModel):
    """Response model for GET /api/v1/diseases."""

    diseases: list[DiseaseDetail]
    total: int


class ModelInfoResponse(BaseModel):
    """Response model for GET /api/v1/model/info."""

    model_name: str = Field(default="Wheat Disease Classifier")
    model_version: str
    architecture: str
    supported_classes: int
    classes: list[str]
    input_size: str
    device: str
    gradcam_supported: bool = True
    loaded: bool
