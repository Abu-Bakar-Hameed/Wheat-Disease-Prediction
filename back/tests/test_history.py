"""
Tests for GET /api/v1/history and related endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.database.models import PredictionRecord


def _make_record(idx: int = 0) -> PredictionRecord:
    return PredictionRecord(
        id=f"uuid-{idx}",
        filename=f"leaf_{idx}.png",
        predicted_class="Leaf_Rust",
        confidence=0.92,
        confidence_pct=92.0,
        low_confidence=False,
        top_predictions=[
            {"rank": 1, "class_name": "Leaf_Rust", "confidence": 0.92, "confidence_percentage": 92.0}
        ],
        recommendation="Apply foliar fungicide.",
        inference_time_ms=45.0,
        model_version="test-1.0.0",
        image_hash="abc123",
        gradcam_available=True,
        created_at=datetime.now(timezone.utc),
    )


# ── History list ──────────────────────────────────────────────────────────────

def test_history_returns_200(test_client):
    with patch("app.api.routes.history.get_recent_predictions", return_value=[_make_record(0)]):
        response = test_client.get("/api/v1/history")
    assert response.status_code == 200


def test_history_response_schema(test_client):
    with patch("app.api.routes.history.get_recent_predictions", return_value=[]):
        data = test_client.get("/api/v1/history").json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


def test_history_returns_correct_items(test_client):
    records = [_make_record(i) for i in range(3)]
    with patch("app.api.routes.history.get_recent_predictions", return_value=records):
        data = test_client.get("/api/v1/history").json()
    assert data["total"] == 3
    assert len(data["items"]) == 3


def test_history_item_schema(test_client):
    with patch("app.api.routes.history.get_recent_predictions", return_value=[_make_record()]):
        data = test_client.get("/api/v1/history").json()
    item = data["items"][0]
    for key in ["id", "filename", "predicted_class", "confidence", "confidence_pct",
                "low_confidence", "top_predictions", "created_at"]:
        assert key in item, f"Missing key: {key}"


def test_history_pagination_params(test_client):
    with patch("app.api.routes.history.get_recent_predictions", return_value=[]) as mock_fn:
        test_client.get("/api/v1/history?limit=5&offset=10")
        mock_fn.assert_called_once_with(limit=5, offset=10)


# ── Single record ─────────────────────────────────────────────────────────────

def test_get_prediction_by_id_returns_200(test_client):
    with patch("app.api.routes.history.get_prediction_by_id", return_value=_make_record()):
        response = test_client.get("/api/v1/history/uuid-0")
    assert response.status_code == 200


def test_get_prediction_by_id_returns_404_when_missing(test_client):
    from app.core.exceptions import RecordNotFoundError
    with patch("app.api.routes.history.get_prediction_by_id",
               side_effect=RecordNotFoundError("Not found")):
        response = test_client.get("/api/v1/history/nonexistent")
    assert response.status_code == 404


# ── Stats ─────────────────────────────────────────────────────────────────────

def test_stats_returns_200(test_client):
    mock_stats = {"total_predictions": 10, "class_distribution": {"Leaf_Rust": 7, "Healthy": 3}}
    with patch("app.api.routes.history.get_prediction_stats", return_value=mock_stats):
        response = test_client.get("/api/v1/history/stats")
    assert response.status_code == 200


def test_stats_schema(test_client):
    mock_stats = {"total_predictions": 5, "class_distribution": {}}
    with patch("app.api.routes.history.get_prediction_stats", return_value=mock_stats):
        data = test_client.get("/api/v1/history/stats").json()
    assert "total_predictions" in data
    assert "class_distribution" in data


# ── Delete ────────────────────────────────────────────────────────────────────

def test_delete_prediction_returns_204(test_client):
    with patch("app.api.routes.history.delete_prediction", return_value=True):
        response = test_client.delete("/api/v1/history/uuid-0")
    assert response.status_code == 204


def test_delete_prediction_returns_404_when_missing(test_client):
    with patch("app.api.routes.history.delete_prediction", return_value=False):
        response = test_client.delete("/api/v1/history/nonexistent")
    assert response.status_code == 404


# ── Database error handling ───────────────────────────────────────────────────

def test_history_returns_503_on_db_error(test_client):
    from app.core.exceptions import DatabaseError
    with patch("app.api.routes.history.get_recent_predictions",
               side_effect=DatabaseError("DB is down")):
        response = test_client.get("/api/v1/history")
    assert response.status_code == 503
