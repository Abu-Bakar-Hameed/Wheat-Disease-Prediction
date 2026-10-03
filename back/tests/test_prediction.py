"""
Tests for POST /api/v1/predict endpoint.
"""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch


def _upload(client, image_bytes: bytes, filename: str = "leaf.png",
            content_type: str = "image/png", **extra):
    return client.post(
        "/api/v1/predict",
        files={"file": (filename, io.BytesIO(image_bytes), content_type)},
        data={"include_gradcam": "true", "top_k": "3", **extra},
    )


# ── Happy path ────────────────────────────────────────────────────────────────

def test_predict_returns_200(test_client, png_image_bytes):
    response = _upload(test_client, png_image_bytes)
    assert response.status_code == 200


def test_predict_response_schema(test_client, png_image_bytes):
    data = _upload(test_client, png_image_bytes).json()
    required_keys = [
        "prediction_id", "prediction", "confidence", "confidence_percentage",
        "low_confidence", "top_predictions", "disease_info", "recommendation",
        "gradcam_available", "inference_time_ms", "model_version",
    ]
    for key in required_keys:
        assert key in data, f"Missing key: {key}"


def test_predict_returns_correct_prediction(test_client, png_image_bytes):
    data = _upload(test_client, png_image_bytes).json()
    assert data["prediction"] == "Leaf_Rust"
    assert data["confidence_percentage"] == pytest.approx(92.41, abs=0.01)


def test_predict_top_predictions_count(test_client, png_image_bytes):
    data = _upload(test_client, png_image_bytes).json()
    assert len(data["top_predictions"]) == 3


def test_predict_top_prediction_schema(test_client, png_image_bytes):
    data = _upload(test_client, png_image_bytes).json()
    top = data["top_predictions"][0]
    assert "rank" in top
    assert "class_name" in top
    assert "confidence" in top
    assert "confidence_percentage" in top
    assert top["rank"] == 1


def test_predict_disease_info_present(test_client, png_image_bytes):
    data = _upload(test_client, png_image_bytes).json()
    info = data["disease_info"]
    assert "display_name" in info
    assert "description" in info
    assert isinstance(info["symptoms"], list)
    assert isinstance(info["prevention"], list)
    assert isinstance(info["management"], list)


def test_predict_inference_time_positive(test_client, png_image_bytes):
    data = _upload(test_client, png_image_bytes).json()
    assert data["inference_time_ms"] > 0


def test_predict_jpeg_accepted(test_client, jpeg_image_bytes):
    response = _upload(test_client, jpeg_image_bytes, filename="leaf.jpg",
                        content_type="image/jpeg")
    assert response.status_code == 200


# ── Error cases ───────────────────────────────────────────────────────────────

def test_predict_rejects_corrupted_image(test_client, corrupted_bytes):
    response = _upload(test_client, corrupted_bytes, filename="bad.png",
                        content_type="image/png")
    assert response.status_code in (422, 415, 500)


def test_predict_rejects_unsupported_extension(test_client, png_image_bytes):
    response = _upload(test_client, png_image_bytes, filename="file.bmp",
                        content_type="image/bmp")
    assert response.status_code in (415, 422)


def test_predict_rejects_empty_file(test_client):
    response = _upload(test_client, b"", filename="empty.png",
                        content_type="image/png")
    assert response.status_code in (422, 415)


def test_predict_returns_503_when_model_not_loaded(png_image_bytes):
    """Predict should 503 when model_manager.is_loaded is False."""
    from app.core.exceptions import ModelNotLoadedError
    unloaded = MagicMock()
    unloaded.is_loaded = False
    unloaded.predict.side_effect = ModelNotLoadedError()

    with (
        patch("app.api.routes.prediction.model_manager", unloaded),
        patch("app.api.routes.health.model_manager", unloaded),
        patch("app.database.database.check_database_health", return_value=True),
    ):
        from app.main import create_app
        from fastapi.testclient import TestClient

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            response = _upload(client, png_image_bytes)
            assert response.status_code == 503


def test_predict_low_confidence_flag(test_client, mock_model_manager, png_image_bytes):
    """When confidence is below threshold, low_confidence must be True."""
    mock_model_manager.predict.return_value = {
        "prediction": "Healthy",
        "confidence": 0.40,
        "confidence_percentage": 40.0,
        "low_confidence": True,
        "top_predictions": [
            {"rank": 1, "class_name": "Healthy", "confidence": 0.40, "confidence_percentage": 40.0}
        ],
        "inference_time_ms": 30.0,
        "model_version": "test-1.0.0",
    }
    data = _upload(test_client, png_image_bytes).json()
    assert data["low_confidence"] is True


# ── Confidence threshold ──────────────────────────────────────────────────────

def test_confidence_threshold_respected(test_client, mock_model_manager, png_image_bytes):
    """Confidence above threshold → low_confidence must be False."""
    mock_model_manager.predict.return_value["low_confidence"] = False
    mock_model_manager.predict.return_value["confidence"] = 0.95
    mock_model_manager.predict.return_value["confidence_percentage"] = 95.0
    data = _upload(test_client, png_image_bytes).json()
    assert data["low_confidence"] is False


# Import pytest for approx
import pytest
