"""
WheatGuard AI – Dataset Preparation Script
Validates the raw dataset, generates a report, and creates stratified
train / validation / test splits.

Usage:
    python scripts/prepare_dataset.py [--data-dir data/raw] [--seed 42]
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

# Allow running from the project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from PIL import Image, UnidentifiedImageError
from sklearn.model_selection import train_test_split

from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.ml.model import save_class_names
from app.ml.utils import check_class_imbalance, set_seed

setup_logging(level=settings.log_level)
logger = get_logger(__name__)

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def discover_images(data_dir: Path) -> tuple[list[Path], list[str], list[str]]:
    """
    Walk data_dir/<class>/<image> and return parallel lists of
    (image_paths, labels, class_names).

    Corrupt files are logged and skipped.
    """
    class_dirs = sorted(
        [d for d in data_dir.iterdir() if d.is_dir()],
        key=lambda d: d.name,
    )
    if not class_dirs:
        logger.error("No class sub-directories found in '%s'.", data_dir)
        sys.exit(1)

    class_names = [d.name for d in class_dirs]
    logger.info("Discovered %d classes: %s", len(class_names), class_names)

    image_paths: list[Path] = []
    labels: list[str] = []
    corrupt: list[str] = []

    for cls_dir in class_dirs:
        class_images = 0
        for img_path in sorted(cls_dir.iterdir()):
            if img_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            try:
                with Image.open(img_path) as img:
                    img.verify()
                image_paths.append(img_path)
                labels.append(cls_dir.name)
                class_images += 1
            except (UnidentifiedImageError, Exception) as exc:
                corrupt.append(str(img_path))
                logger.warning("Corrupt image (skipped): %s — %s", img_path, exc)

        logger.info("  %-30s  %d images", cls_dir.name, class_images)

    if corrupt:
        logger.warning("%d corrupt files were skipped.", len(corrupt))

    return image_paths, labels, class_names


def split_dataset(
    image_paths: list[Path],
    labels: list[str],
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    seed: int = 42,
) -> tuple[list[Path], list[Path], list[Path], list[str], list[str], list[str]]:
    """Stratified train / val / test split."""
    test_ratio = 1.0 - train_ratio - val_ratio

    train_paths, temp_paths, train_labels, temp_labels = train_test_split(
        image_paths,
        labels,
        test_size=(1.0 - train_ratio),
        stratify=labels,
        random_state=seed,
    )

    relative_val = val_ratio / (val_ratio + test_ratio)
    val_paths, test_paths, val_labels, test_labels = train_test_split(
        temp_paths,
        temp_labels,
        test_size=(1.0 - relative_val),
        stratify=temp_labels,
        random_state=seed,
    )

    logger.info(
        "Split: train=%d  val=%d  test=%d",
        len(train_paths),
        len(val_paths),
        len(test_paths),
    )
    return train_paths, val_paths, test_paths, train_labels, val_labels, test_labels


def copy_split(
    paths: list[Path],
    labels: list[str],
    dest_dir: Path,
) -> None:
    """Copy images into dest_dir/<class>/<filename> without modifying originals."""
    for img_path, label in zip(paths, labels):
        target_dir = dest_dir / label
        target_dir.mkdir(parents=True, exist_ok=True)
        dest = target_dir / img_path.name
        if not dest.exists():
            shutil.copy2(img_path, dest)
    logger.info("Copied %d images to '%s'.", len(paths), dest_dir)


def generate_report(
    image_paths: list[Path],
    labels: list[str],
    class_names: list[str],
    corrupt: list[str],
    output_path: Path,
) -> None:
    """Save a dataset summary JSON report."""
    from collections import Counter

    counts = Counter(labels)
    total = len(image_paths)
    is_imbalanced, ratio = check_class_imbalance(dict(counts))

    report = {
        "total_images": total,
        "num_classes": len(class_names),
        "classes": class_names,
        "class_counts": dict(counts),
        "class_distribution_pct": {
            cls: round(counts[cls] / total * 100, 2) if total else 0.0
            for cls in class_names
        },
        "corrupt_files": corrupt,
        "num_corrupt": len(corrupt),
        "is_imbalanced": is_imbalanced,
        "imbalance_ratio": round(ratio, 2),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)

    logger.info("Dataset report saved to '%s'.", output_path)
    logger.info("Total images : %d", total)
    logger.info("Classes      : %d", len(class_names))
    if is_imbalanced:
        logger.warning(
            "Imbalanced dataset detected (ratio=%.2f). "
            "Consider enabling USE_CLASS_WEIGHTS=true in .env.",
            ratio,
        )


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="WheatGuard AI – Dataset Preparation")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=settings.data_dir,
        help="Path to raw dataset root (contains one sub-folder per class).",
    )
    parser.add_argument("--seed", type=int, default=settings.random_seed)
    parser.add_argument(
        "--train-split", type=float, default=settings.train_split
    )
    parser.add_argument("--val-split", type=float, default=settings.val_split)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data"),
        help="Parent directory for train/validation/test splits.",
    )
    args = parser.parse_args()

    set_seed(args.seed)

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        logger.error("Data directory '%s' does not exist.", data_dir)
        sys.exit(1)

    logger.info("Preparing dataset from '%s'", data_dir)

    # Discover & validate
    image_paths, labels, class_names = discover_images(data_dir)
    corrupt: list[str] = []  # Already filtered inside discover_images

    if len(image_paths) == 0:
        logger.error("No valid images found. Aborting.")
        sys.exit(1)

    # Save class names
    save_class_names(class_names, Path("models/class_names.json"))

    # Generate report
    generate_report(
        image_paths,
        labels,
        class_names,
        corrupt,
        Path("artifacts/reports/dataset_report.json"),
    )

    # Split
    train_paths, val_paths, test_paths, train_labels, val_labels, test_labels = (
        split_dataset(
            image_paths,
            labels,
            train_ratio=args.train_split,
            val_ratio=args.val_split,
            seed=args.seed,
        )
    )

    # Copy splits (preserves originals in data/raw)
    copy_split(train_paths, train_labels, args.output_dir / "train")
    copy_split(val_paths, val_labels, args.output_dir / "validation")
    copy_split(test_paths, test_labels, args.output_dir / "test")

    logger.info("Dataset preparation complete.")


if __name__ == "__main__":
    main()
