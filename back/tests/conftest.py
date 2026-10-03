"""
WheatGuard AI – Pytest configuration and shared fixtures.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# Ensure the project root is on PYTHONPATH when running from tests/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# ── Image factory helpers ─────────────────────────────────────────────────────

def _make_png_bytes(width: int = 224, height: int = 224, colour: tuple = (80, 140, 60)) -> bytes:
    """Create a minimal valid PNG image in memory."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(buf, format="PNG")
    return buf.getvalue()


def _make_jpeg_bytes(width: int = 224, height: int = 224) -> bytes:
    """Create a minimal valid JPEG image in memory."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (120, 180, 90)).save(buf, format="JPEG")
    return buf.getvalue()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def png_image_bytes() -> bytes:
    """Return raw bytes for a small valid PNG image."""
    return _make_png_bytes()


@pytest.fixture()
def jpeg_image_bytes() -> bytes:
    """Return raw bytes for a small valid JPEG image."""
    return _make_jpeg_bytes()


@pytest.fixture()
def corrupted_bytes() -> bytes:
    """Return bytes that are NOT a valid image."""
    return b"not-an-image-definitely-corrupt"


@pytest.fixture()
def oversized_bytes() -> bytes:
    """Return bytes larger than the 10 MB upload limit."""
    return b"x" * (11 * 1024 * 1024)


@pytest.fixture()
def class_names() -> list[str]:
    return ["Healthy", "Leaf_Rust", "Yellow_Rust", "Stem_Rust", "Powdery_Mildew"]


@pytest.fixture()
def mock_model_manager(class_names):
    """
    Return a ModelManager whose predict() is mocked so tests never
    need real PyTorch weights.
    """
    manager = MagicMock()
    manager.is_loaded = True
    manager.class_names = class_names
    manager.num_classes = len(class_names)
    manager.device = "cpu"
    manager.model = MagicMock()
    manager.metadata = {
        "model_version": "test-1.0.0",
        "architecture": "efficientnet_b0",
    }
    manager.predict.return_value = {
        "prediction": "Leaf_Rust",
        "confidence": 0.9241,
        "confidence_percentage": 92.41,
        "low_confidence": False,
        "top_predictions": [
            {"rank": 1, "class_name": "Leaf_Rust", "confidence": 0.9241, "confidence_percentage": 92.41},
            {"rank": 2, "class_name": "Healthy", "confidence": 0.0413, "confidence_percentage": 4.13},
            {"rank": 3, "class_name": "Yellow_Rust", "confidence": 0.0221, "confidence_percentage": 2.21},
        ],
        "inference_time_ms": 43.5,
        "model_version": "test-1.0.0",
    }
    return manager


@pytest.fixture()
def test_client(mock_model_manager):
    """
    Return a FastAPI TestClient with:
      - model_manager patched (no real weights needed)
      - Supabase CRUD patched (no real DB needed)
    """
    with (
        patch("app.ml.inference.model_manager", mock_model_manager),
        patch("app.api.routes.prediction.model_manager", mock_model_manager),
        patch("app.api.routes.health.model_manager", mock_model_manager),
        patch("app.api.routes.prediction.create_prediction") as mock_db,
        patch("app.api.routes.prediction.run_gradcam") as mock_gradcam,
        patch("app.database.database.check_database_health", return_value=True),
    ):
        mock_db.return_value = MagicMock(id="test-uuid-1234")
        mock_gradcam.return_value = {
            "original": "data:image/png;base64,abc",
            "heatmap": "data:image/png;base64,def",
            "overlay": "data:image/png;base64,ghi",
        }

        # Import app after patching so lifespan doesn't try to load real model
        from app.main import create_app
        app = create_app()

        with TestClient(app, raise_server_exceptions=False) as client:
            yield client
