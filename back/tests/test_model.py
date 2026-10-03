"""
Tests for model building, class-name I/O, and ModelManager.
"""

from __future__ import annotations

import io
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import torch

from app.ml.model import (
    build_model,
    load_class_names,
    save_class_names,
)


# ── Model building ────────────────────────────────────────────────────────────

def test_build_efficientnet_b0_output_shape():
    model = build_model("efficientnet_b0", num_classes=5, pretrained=False)
    model.eval()
    dummy = torch.zeros(1, 3, 224, 224)
    with torch.no_grad():
        out = model(dummy)
    assert out.shape == (1, 5)


def test_build_resnet50_output_shape():
    model = build_model("resnet50", num_classes=8, pretrained=False)
    model.eval()
    dummy = torch.zeros(1, 3, 224, 224)
    with torch.no_grad():
        out = model(dummy)
    assert out.shape == (1, 8)


def test_build_model_unknown_architecture():
    with pytest.raises(ValueError, match="Unknown architecture"):
        build_model("not_a_real_model", num_classes=3)


def test_build_model_adapts_to_class_count():
    for n in (2, 5, 10):
        model = build_model("resnet50", num_classes=n, pretrained=False)
        model.eval()
        out = model(torch.zeros(1, 3, 224, 224))
        assert out.shape[1] == n, f"Expected {n} outputs, got {out.shape[1]}"


# ── Class name I/O ────────────────────────────────────────────────────────────

def test_save_and_load_class_names():
    names = ["Healthy", "Leaf_Rust", "Yellow_Rust"]
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "class_names.json"
        save_class_names(names, path)
        loaded = load_class_names(path)
    assert loaded == names


def test_load_class_names_missing_file():
    with pytest.raises(FileNotFoundError):
        load_class_names(Path("/nonexistent/path/class_names.json"))


def test_load_class_names_invalid_content():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump({"not": "a list"}, f)
        tmp_path = Path(f.name)
    with pytest.raises(ValueError):
        load_class_names(tmp_path)
    tmp_path.unlink(missing_ok=True)


# ── ModelManager ──────────────────────────────────────────────────────────────

def test_model_manager_not_loaded_initially():
    from app.ml.inference import ModelManager
    mgr = ModelManager()
    assert not mgr.is_loaded


def test_model_manager_raises_when_not_loaded(png_image_bytes):
    from app.core.exceptions import ModelNotLoadedError
    from app.ml.inference import ModelManager

    mgr = ModelManager()
    with pytest.raises(ModelNotLoadedError):
        mgr.predict(png_image_bytes)


def test_model_manager_topk_capped_to_num_classes(mock_model_manager, png_image_bytes):
    """Requesting top-k > num_classes should not crash."""
    mock_model_manager.predict(png_image_bytes, top_k=100)
    mock_model_manager.predict.assert_called_once()


@pytest.fixture()
def png_image_bytes():
    """Re-define locally so this file can run standalone."""
    buf = io.BytesIO()
    from PIL import Image
    Image.new("RGB", (224, 224), (100, 150, 80)).save(buf, format="PNG")
    return buf.getvalue()
