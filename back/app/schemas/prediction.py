"""
WheatGuard AI – Prediction Pydantic Schemas
Request / response models for the /api/v1/predict endpoint.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


# ── Sub-models ────────────────────────────────────────────────────────────────

class TopPrediction(BaseModel):
    """A single entry in the top-k predictions list."""

    rank: int = Field(..., ge=1, description="Rank position (1 = best match)")
    class_name: str = Field(..., description="Predicted class name")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Probability [0, 1]")
    confidence_percentage: float = Field(
        ..., ge=0.0, le=100.0, description="Probability × 100"
    )


class DiseaseInfo(BaseModel):
    """Agronomic metadata attached to every prediction response."""

    display_name: str
    description: str
    symptoms: list[str] = Field(default_factory=list)
    prevention: list[str] = Field(default_factory=list)
    management: list[str] = Field(default_factory=list)
    severity: str = Field(default="unknown")
    risk_level: str = Field(default="unknown")
    disclaimer: str = Field(
        default="Consult an agricultural expert for confirmation."
    )


class GradCAMResult(BaseModel):
    """Base64-encoded PNG images produced by Grad-CAM."""

    original: str = Field(..., description="Base64 PNG data URI of the original image")
    heatmap: str = Field(..., description="Base64 PNG data URI of the raw heatmap")
    overlay: str = Field(..., description="Base64 PNG data URI of the blended overlay")


class AiDiagnosisReport(BaseModel):
    """Structured LLM-generated diagnosis report (EntryRank format)."""

    title: str = Field(default="EntryRank Detection")
    disease: str = Field(..., description="Human-readable disease name")
    confidence_pct: int = Field(..., ge=0, le=100)
    problem: str = Field(..., description="Problem description")
    recommendation: str = Field(..., description="Immediate recommendation")
    solution: str = Field(..., description="Treatment/management solution")
    generated_by: str = Field(
        default="openrouter",
        description="'openrouter' when the LLM produced it, 'fallback' otherwise. "
        "Older rows may still carry 'gemini' from the previous provider.",
    )

    @field_validator("confidence_pct", mode="before")
    @classmethod
    def _normalise_percentage(cls, value: Any) -> Any:
        """Accept 27, 27.0, 27.3 or "27%" and hand back a plain int.

        This number is echoed by the language model, which is free to format a
        percentage however it likes; a fractional float once failed strict int
        validation and turned an already-successful prediction into a 500.
        Values outside 0-100 are clamped for the same reason. Anything that is
        not a number is passed through so Pydantic still reports a real type
        error instead of silently inventing a figure.
        """
        try:
            number = float(str(value).strip().rstrip("%"))
        except (TypeError, ValueError):
            return value
        return max(0, min(100, round(number)))


# ── Request model ─────────────────────────────────────────────────────────────

class PredictionRequest(BaseModel):
    """
    Optional JSON body parameters that can accompany the multipart upload.
    The image itself is sent as a form field, not inside this model.
    """

    include_gradcam: bool = Field(
        default=True,
        description="Whether to run Grad-CAM and include results in the response.",
    )
    top_k: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Number of top predictions to return.",
    )


# ── Response model ────────────────────────────────────────────────────────────

class PredictionResponse(BaseModel):
    """
    Full prediction response returned by POST /api/v1/predict.
    All fields are strictly typed so the Next.js client can rely on the schema.
    """

    # Record identity
    prediction_id: str = Field(..., description="UUID of the stored prediction")

    # Core prediction
    prediction: str = Field(..., description="Top-1 predicted class name")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Top-1 probability")
    confidence_percentage: float = Field(..., ge=0.0, le=100.0)

    # Confidence level label  ≥80% = High, 60-79% = Moderate, 40-59% = Low, <40% = Very Low
    confidence_level: str = Field(
        default="Unknown",
        description="Human-readable confidence label: High / Moderate / Low / Very Low",
    )

    # Confidence flag
    low_confidence: bool = Field(
        ...,
        description=(
            "True when confidence < configured threshold. "
            "Treat result with extra caution when this is True."
        ),
    )

    # Severity from disease lookup
    severity: str = Field(
        default="unknown",
        description="Disease severity: none / moderate / high / critical / unknown",
    )

    # Top-k breakdown
    top_predictions: list[TopPrediction] = Field(
        ..., description="Top-k predictions ranked by confidence"
    )

    # Agronomic context
    disease_info: DiseaseInfo = Field(
        ..., description="Disease metadata and management guidance"
    )
    recommendation: str = Field(
        ..., description="Concise actionable recommendation string"
    )

    # Explainability
    gradcam: GradCAMResult | None = Field(
        default=None,
        description="Grad-CAM heatmap images; None when not requested or unavailable",
    )
    gradcam_available: bool = Field(default=False)

    # Performance
    inference_time_ms: float = Field(..., description="Model forward-pass duration in ms")

    # Metadata
    model_version: str = Field(default="unknown")

    # Image URL (stored in Supabase Storage, may be None for older predictions)
    image_url: str | None = Field(default=None)

    # AI structured diagnosis report (OpenRouter)
    ai_report: AiDiagnosisReport | None = Field(
        default=None,
        description="Structured EntryRank-style diagnosis report generated by the configured LLM",
    )

    # Email alert: queued/sent status of the HIGH / CRITICAL disease alert mail
    # the backend handed to the auth service after this prediction was saved.
    # Both stay False for Low / Moderate / Healthy results and whenever delivery
    # failed, so the UI never claims an email was sent when it was not.
    email_queued: bool = Field(
        default=False,
        description="True when the alert service accepted the high-risk email for delivery",
    )
    email_sent: bool = Field(
        default=False,
        description="True only when the mail provider confirmed it accepted the alert",
    )

    model_config = {"json_schema_extra": {
        "example": {
            "prediction_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "prediction": "Stem_Rust",
            "confidence": 0.9081,
            "confidence_percentage": 90.81,
            "confidence_level": "High",
            "severity": "critical",
            "low_confidence": False,
            "top_predictions": [
                {"rank": 1, "class_name": "Stem_Rust", "confidence": 0.9081, "confidence_percentage": 90.81},
                {"rank": 2, "class_name": "Leaf_Rust", "confidence": 0.0541, "confidence_percentage": 5.41},
                {"rank": 3, "class_name": "Yellow_Rust", "confidence": 0.0211, "confidence_percentage": 2.11},
            ],
            "recommendation": "Apply foliar fungicide at first sign. Consult an agricultural expert.",
            "gradcam_available": True,
            "inference_time_ms": 43.5,
            "model_version": "1.0.0",
        }
    }}
