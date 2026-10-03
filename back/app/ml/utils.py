"""
WheatGuard AI – ML Utilities
Seed management, class-weight calculation, image I/O helpers.
"""

from __future__ import annotations

import hashlib
import os
import random
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import torch

from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Reproducibility ───────────────────────────────────────────────────────────

def set_seed(seed: int = 42) -> None:
    """
    Set random seeds for Python, NumPy, and PyTorch (CPU + CUDA).

    Note: Full determinism is not guaranteed across different hardware,
    PyTorch versions, or CUDA versions.

    Args:
        seed: Integer seed value.
    """
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    # Encourage deterministic CuDNN ops (may reduce performance)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    logger.debug("Random seed set to %d", seed)


# ── Class weights ─────────────────────────────────────────────────────────────

def compute_class_weights(
    labels: list[int],
    num_classes: int,
) -> torch.Tensor:
    """
    Compute inverse-frequency class weights for weighted CrossEntropyLoss.

    weight_c = total_samples / (num_classes * count_c)

    Args:
        labels:      List of integer class indices for the full dataset.
        num_classes: Total number of classes.

    Returns:
        Float32 tensor of shape [num_classes].
    """
    counts = Counter(labels)
    total = len(labels)
    weights = torch.zeros(num_classes, dtype=torch.float32)
    for cls_idx in range(num_classes):
        count = counts.get(cls_idx, 0)
        if count > 0:
            weights[cls_idx] = total / (num_classes * count)
        else:
            weights[cls_idx] = 0.0  # unseen class gets zero weight
    logger.info("Class weights: %s", weights.tolist())
    return weights


def check_class_imbalance(
    class_counts: dict[str, int],
    threshold: float = 3.0,
) -> tuple[bool, float]:
    """
    Detect whether the dataset is imbalanced.

    Imbalance ratio = max_count / min_count.
    If ratio > threshold the dataset is considered imbalanced.

    Args:
        class_counts: Mapping of class_name → sample_count.
        threshold:    Imbalance ratio above which a warning is issued.

    Returns:
        Tuple of (is_imbalanced: bool, ratio: float).
    """
    if not class_counts:
        return False, 1.0
    counts = list(class_counts.values())
    max_c, min_c = max(counts), min(counts)
    if min_c == 0:
        return True, float("inf")
    ratio = max_c / min_c
    is_imbalanced = ratio > threshold
    if is_imbalanced:
        logger.warning(
            "Class imbalance detected (ratio=%.2f > threshold=%.2f). "
            "Consider enabling USE_CLASS_WEIGHTS=true.",
            ratio,
            threshold,
        )
    return is_imbalanced, ratio


# ── Image hashing ─────────────────────────────────────────────────────────────

def compute_file_hash(path: Path, algorithm: str = "md5") -> str:
    """
    Compute the hash of a file for duplicate detection.

    Args:
        path:      Path to the file.
        algorithm: Hash algorithm ('md5', 'sha256').

    Returns:
        Hex digest string.
    """
    h = hashlib.new(algorithm)
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ── Dataset statistics ────────────────────────────────────────────────────────

def summarise_dataset(data_dir: Path) -> dict[str, Any]:
    """
    Walk a directory structured as ``data_dir/<class_name>/<image_files>``
    and return a summary dictionary.

    Args:
        data_dir: Root directory containing one sub-folder per class.

    Returns:
        Dictionary with keys: total_images, num_classes, classes,
        class_counts, class_distribution_pct, corrupt_files.
    """
    from PIL import Image, UnidentifiedImageError

    supported = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
    class_counts: dict[str, int] = {}
    corrupt_files: list[str] = []
    total = 0

    data_dir = Path(data_dir)
    if not data_dir.exists():
        logger.warning("Data directory '%s' does not exist.", data_dir)
        return {}

    for class_dir in sorted(data_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        count = 0
        for img_path in class_dir.iterdir():
            if img_path.suffix.lower() not in supported:
                continue
            try:
                with Image.open(img_path) as img:
                    img.verify()
                count += 1
            except (UnidentifiedImageError, Exception):
                corrupt_files.append(str(img_path))
        class_counts[class_dir.name] = count
        total += count

    dist_pct = {
        cls: round(cnt / total * 100, 2) if total else 0.0
        for cls, cnt in class_counts.items()
    }

    return {
        "total_images": total,
        "num_classes": len(class_counts),
        "classes": list(class_counts.keys()),
        "class_counts": class_counts,
        "class_distribution_pct": dist_pct,
        "corrupt_files": corrupt_files,
    }
