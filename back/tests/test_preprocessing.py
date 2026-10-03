"""
Tests for app/ml/preprocessing.py
"""

from __future__ import annotations

import io

import numpy as np
import pytest
import torch
from PIL import Image

from app.core.exceptions import InvalidImageError
from app.ml.preprocessing import (
    bytes_to_pil,
    get_augmentation_examples,
    get_eval_transforms,
    get_train_transforms,
    preprocess_for_inference,
    tensor_to_numpy,
)


def _make_png_bytes(size=(224, 224)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (100, 150, 80)).save(buf, format="PNG")
    return buf.getvalue()


# ── bytes_to_pil ──────────────────────────────────────────────────────────────

def test_bytes_to_pil_returns_rgb_image():
    img = bytes_to_pil(_make_png_bytes())
    assert img.mode == "RGB"


def test_bytes_to_pil_correct_size():
    img = bytes_to_pil(_make_png_bytes((100, 80)))
    assert img.size == (100, 80)


def test_bytes_to_pil_rejects_non_image():
    with pytest.raises(InvalidImageError):
        bytes_to_pil(b"not-an-image")


def test_bytes_to_pil_converts_rgba_to_rgb():
    buf = io.BytesIO()
    Image.new("RGBA", (50, 50), (0, 0, 0, 128)).save(buf, format="PNG")
    img = bytes_to_pil(buf.getvalue())
    assert img.mode == "RGB"


# ── Transforms ────────────────────────────────────────────────────────────────

def test_train_transforms_output_shape():
    transform = get_train_transforms(224)
    pil = Image.new("RGB", (256, 256))
    tensor = transform(pil)
    assert tensor.shape == (3, 224, 224)
    assert tensor.dtype == torch.float32


def test_eval_transforms_output_shape():
    transform = get_eval_transforms(224)
    pil = Image.new("RGB", (300, 300))
    tensor = transform(pil)
    assert tensor.shape == (3, 224, 224)


def test_eval_transforms_deterministic():
    """Eval transforms must produce the same output on repeated calls."""
    transform = get_eval_transforms(224)
    pil = Image.new("RGB", (256, 256), (120, 120, 120))
    t1 = transform(pil)
    t2 = transform(pil)
    assert torch.allclose(t1, t2), "Eval transforms must be deterministic"


def test_train_transforms_custom_size():
    transform = get_train_transforms(128)
    tensor = transform(Image.new("RGB", (256, 256)))
    assert tensor.shape == (3, 128, 128)


# ── preprocess_for_inference ──────────────────────────────────────────────────

def test_preprocess_for_inference_batch_shape():
    tensor = preprocess_for_inference(_make_png_bytes())
    assert tensor.shape == (1, 3, 224, 224)
    assert tensor.dtype == torch.float32


def test_preprocess_for_inference_rejects_bad_bytes():
    with pytest.raises(InvalidImageError):
        preprocess_for_inference(b"garbage")


# ── tensor_to_numpy ───────────────────────────────────────────────────────────

def test_tensor_to_numpy_shape():
    tensor = torch.zeros(1, 3, 64, 64)
    arr = tensor_to_numpy(tensor)
    assert arr.shape == (64, 64, 3)
    assert arr.dtype == np.uint8


def test_tensor_to_numpy_range():
    tensor = torch.zeros(3, 32, 32)
    arr = tensor_to_numpy(tensor)
    assert arr.min() >= 0
    assert arr.max() <= 255


# ── Augmentation examples ─────────────────────────────────────────────────────

def test_augmentation_examples_count():
    pil = Image.new("RGB", (256, 256), (100, 150, 80))
    examples = get_augmentation_examples(pil, n=4)
    assert len(examples) == 4


def test_augmentation_examples_are_pil():
    pil = Image.new("RGB", (256, 256))
    for ex in get_augmentation_examples(pil, n=2):
        assert isinstance(ex, Image.Image)
