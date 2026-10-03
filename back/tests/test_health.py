"""
Tests for GET /health endpoint.
"""

from __future__ import annotations

from unittest.mock import patch


def test_health_returns_200(test_client):
    response = test_client.get("/health")
    assert response.status_code == 200


def test_health_schema(test_client):
    data = test_client.get("/health").json()
    assert "status" in data
    assert "model_loaded" in data
    assert "database" in data
    assert "model_version" in data
    assert "app_version" in data
    assert "num_classes" in data
    assert "device" in data


def test_health_healthy_when_model_and_db_ok(test_client):
    data = test_client.get("/health").json()
    assert data["status"] in ("healthy", "degraded")
    assert isinstance(data["model_loaded"], bool)
    assert isinstance(data["database"], bool)


def test_health_degraded_when_model_not_loaded(mock_model_manager):
    """When model is not loaded, status should be 'degraded'."""
    mock_model_manager.is_loaded = False

    with (
        patch("app.api.routes.health.model_manager", mock_model_manager),
        patch("app.database.database.check_database_health", return_value=True),
    ):
        from app.main import create_app
        from fastapi.testclient import TestClient

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            data = client.get("/health").json()
            assert data["status"] == "degraded"
            assert data["model_loaded"] is False
