"""
WheatGuard AI – Model Definition
Builds an EfficientNet-B0 (or ResNet-50 fallback) classifier whose output
head is dynamically sized to match the discovered class count.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn

from app.core.logging import get_logger

logger = get_logger(__name__)


def build_efficientnet_b0(num_classes: int, pretrained: bool = True) -> nn.Module:
    """
    Build an EfficientNet-B0 with a custom classification head.

    Uses ``timm`` as the primary source (wider pretrained-weight support) and
    falls back to ``torchvision`` if timm is unavailable.

    Args:
        num_classes: Number of output classes for the final Linear layer.
        pretrained:  Load ImageNet-pretrained weights when True.

    Returns:
        PyTorch model with the top classifier replaced.
    """
    try:
        import timm  # type: ignore

        model = timm.create_model(
            "efficientnet_b0",
            pretrained=pretrained,
            num_classes=num_classes,
        )
        logger.info(
            "EfficientNet-B0 built via timm | classes=%d | pretrained=%s",
            num_classes,
            pretrained,
        )
        return model

    except (ImportError, Exception) as timm_err:
        logger.warning(
            "timm unavailable or failed (%s). Falling back to torchvision.",
            timm_err,
        )

    try:
        from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

        weights = EfficientNet_B0_Weights.DEFAULT if pretrained else None
        model = efficientnet_b0(weights=weights)

        # Replace the classifier head
        in_features: int = model.classifier[1].in_features  # type: ignore[index]
        model.classifier = nn.Sequential(
            nn.Dropout(p=0.2, inplace=True),
            nn.Linear(in_features, num_classes),
        )
        logger.info(
            "EfficientNet-B0 built via torchvision | classes=%d | pretrained=%s",
            num_classes,
            pretrained,
        )
        return model

    except Exception as tv_err:
        logger.warning(
            "torchvision EfficientNet failed (%s). Falling back to ResNet-50.",
            tv_err,
        )
        return build_resnet50(num_classes, pretrained)


def build_resnet50(num_classes: int, pretrained: bool = True) -> nn.Module:
    """
    Build a ResNet-50 with a custom classification head (fallback model).

    Args:
        num_classes: Number of output classes.
        pretrained:  Load ImageNet-pretrained weights when True.

    Returns:
        PyTorch model with fc layer replaced.
    """
    from torchvision.models import ResNet50_Weights, resnet50

    weights = ResNet50_Weights.DEFAULT if pretrained else None
    model = resnet50(weights=weights)

    in_features: int = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)

    logger.info(
        "ResNet-50 built | classes=%d | pretrained=%s",
        num_classes,
        pretrained,
    )
    return model


def build_model(
    architecture: str,
    num_classes: int,
    pretrained: bool = True,
) -> nn.Module:
    """
    Factory function – returns the correct architecture by name.

    Args:
        architecture: One of ``efficientnet_b0``, ``resnet50``.
        num_classes:  Number of output classes.
        pretrained:   Load ImageNet-pretrained weights when True.

    Returns:
        Configured PyTorch model.

    Raises:
        ValueError: If the architecture name is not recognised.
    """
    arch = architecture.lower().replace("-", "_")
    builders = {
        "efficientnet_b0": build_efficientnet_b0,
        "resnet50": build_resnet50,
    }
    if arch not in builders:
        raise ValueError(
            f"Unknown architecture '{architecture}'. "
            f"Supported: {list(builders.keys())}"
        )
    return builders[arch](num_classes=num_classes, pretrained=pretrained)


def save_class_names(class_names: list[str], path: Path) -> None:
    """Serialise class names to a JSON file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(class_names, fh, indent=2)
    logger.info("Class names saved to %s", path)


def load_class_names(path: Path) -> list[str]:
    """
    Load class names from a JSON file.

    Args:
        path: Path to the class_names.json file.

    Returns:
        Ordered list of class name strings.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError:        If the content is not a list of strings.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"class_names.json not found at '{path}'. "
            "Run the training pipeline first."
        )
    with open(path, encoding="utf-8") as fh:
        data: Any = json.load(fh)
    if not isinstance(data, list) or not all(isinstance(c, str) for c in data):
        raise ValueError(f"class_names.json at '{path}' must be a JSON list of strings.")
    logger.info("Loaded %d class names from %s", len(data), path)
    return data  # type: ignore[return-value]


def save_model_metadata(metadata: dict[str, Any], path: Path) -> None:
    """Serialise model training metadata to a JSON file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2, default=str)
    logger.info("Model metadata saved to %s", path)


def load_model_metadata(path: Path) -> dict[str, Any]:
    """
    Load model metadata JSON.

    Returns an empty dict (rather than raising) when the file is absent,
    so the API can report a partial health status instead of crashing.
    """
    path = Path(path)
    if not path.exists():
        logger.warning("model_metadata.json not found at '%s'.", path)
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)  # type: ignore[return-value]
