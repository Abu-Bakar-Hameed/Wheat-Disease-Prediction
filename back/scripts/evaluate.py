"""
WheatGuard AI – Evaluation Script
Evaluates the best trained model on the held-out test split.
Generates classification report, confusion matrix, and training curves.

Usage:
    python scripts/evaluate.py [--model-path models/best_model.pth]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running from the project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for servers
import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
)
from torch.utils.data import DataLoader
from torchvision.datasets import ImageFolder

from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.ml.model import build_model, load_class_names, load_model_metadata
from app.ml.preprocessing import get_eval_transforms
from app.ml.utils import set_seed

setup_logging(level=settings.log_level)
logger = get_logger(__name__)


# ── Plots ─────────────────────────────────────────────────────────────────────

def plot_training_curves(history_path: Path, output_path: Path) -> None:
    """Plot and save training loss / accuracy curves."""
    if not history_path.exists():
        logger.warning("training_history.json not found – skipping curves plot.")
        return

    with open(history_path) as fh:
        history = json.load(fh)

    epochs = [h["epoch"] for h in history]
    train_loss = [h["train_loss"] for h in history]
    val_loss = [h["val_loss"] for h in history]
    train_acc = [h["train_acc"] for h in history]
    val_acc = [h["val_acc"] for h in history]

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    axes[0].plot(epochs, train_loss, label="Train Loss", linewidth=2)
    axes[0].plot(epochs, val_loss, label="Val Loss", linewidth=2, linestyle="--")
    axes[0].set_title("Training & Validation Loss", fontsize=14)
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("Loss")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    axes[1].plot(epochs, train_acc, label="Train Accuracy", linewidth=2)
    axes[1].plot(epochs, val_acc, label="Val Accuracy", linewidth=2, linestyle="--")
    axes[1].set_title("Training & Validation Accuracy", fontsize=14)
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylabel("Accuracy (%)")
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Training curves saved to '%s'.", output_path)


def plot_confusion_matrix(
    y_true: list[int],
    y_pred: list[int],
    class_names: list[str],
    output_path: Path,
) -> None:
    """Plot and save a labelled confusion matrix heatmap."""
    import seaborn as sns

    cm = confusion_matrix(y_true, y_pred)
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)

    fig, ax = plt.subplots(figsize=(max(8, len(class_names) * 1.2),
                                    max(6, len(class_names))))
    sns.heatmap(
        cm_norm,
        annot=cm,           # Show raw counts
        fmt="d",
        cmap="Blues",
        xticklabels=class_names,
        yticklabels=class_names,
        linewidths=0.5,
        ax=ax,
    )
    ax.set_title("Confusion Matrix (normalised rows, raw counts shown)", fontsize=13)
    ax.set_ylabel("True Label")
    ax.set_xlabel("Predicted Label")
    plt.xticks(rotation=45, ha="right")
    plt.yticks(rotation=0)
    plt.tight_layout()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Confusion matrix saved to '%s'.", output_path)


# ── Evaluation ────────────────────────────────────────────────────────────────

def evaluate(args: argparse.Namespace) -> None:
    set_seed(settings.random_seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Evaluation device: %s", device)

    # ── Load class names ──────────────────────────────────────────────────────
    class_names_path = Path(args.class_names)
    try:
        class_names = load_class_names(class_names_path)
    except FileNotFoundError:
        logger.error("class_names.json not found. Run training first.")
        sys.exit(1)

    num_classes = len(class_names)

    # ── Load model ────────────────────────────────────────────────────────────
    model_path = Path(args.model_path)
    if not model_path.exists():
        logger.error("Model weights not found at '%s'. Run training first.", model_path)
        sys.exit(1)

    metadata = load_model_metadata(Path(args.metadata_path))
    architecture = metadata.get("architecture", "efficientnet_b0")

    model = build_model(architecture=architecture, num_classes=num_classes, pretrained=False)
    state_dict = torch.load(model_path, map_location=device, weights_only=True)
    if isinstance(state_dict, dict) and "model_state_dict" in state_dict:
        state_dict = state_dict["model_state_dict"]
    model.load_state_dict(state_dict)
    model = model.to(device)
    model.eval()
    logger.info("Model loaded from '%s'.", model_path)

    # ── Test dataset ──────────────────────────────────────────────────────────
    test_dir = Path(args.data_dir) / "test"
    if not test_dir.exists():
        logger.error("Test directory '%s' not found.", test_dir)
        sys.exit(1)

    test_ds = ImageFolder(
        root=str(test_dir),
        transform=get_eval_transforms(settings.image_size),
    )
    test_loader = DataLoader(
        test_ds, batch_size=args.batch_size, shuffle=False, num_workers=2
    )
    logger.info("Test dataset: %d images across %d classes.", len(test_ds), num_classes)

    # ── Run predictions ───────────────────────────────────────────────────────
    all_preds: list[int] = []
    all_labels: list[int] = []

    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(device, non_blocking=True)
            logits = model(images)
            preds = logits.argmax(dim=1).cpu().tolist()
            all_preds.extend(preds)
            all_labels.extend(labels.tolist())

    # ── Metrics ───────────────────────────────────────────────────────────────
    accuracy = sum(p == l for p, l in zip(all_preds, all_labels)) / len(all_labels) * 100
    macro_f1 = f1_score(all_labels, all_preds, average="macro", zero_division=0)
    weighted_f1 = f1_score(all_labels, all_preds, average="weighted", zero_division=0)

    report_dict = classification_report(
        all_labels,
        all_preds,
        target_names=class_names,
        output_dict=True,
        zero_division=0,
    )
    report_str = classification_report(
        all_labels,
        all_preds,
        target_names=class_names,
        zero_division=0,
    )

    logger.info("\n" + "=" * 60)
    logger.info("TEST RESULTS")
    logger.info("=" * 60)
    logger.info("Accuracy         : %.2f%%", accuracy)
    logger.info("Macro F1         : %.4f", macro_f1)
    logger.info("Weighted F1      : %.4f", weighted_f1)
    logger.info("\nClassification Report:\n%s", report_str)

    # ── Save reports ──────────────────────────────────────────────────────────
    Path("artifacts/reports").mkdir(parents=True, exist_ok=True)
    full_report = {
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 6),
        "weighted_f1": round(weighted_f1, 6),
        "per_class_metrics": report_dict,
    }
    with open("artifacts/reports/classification_report.json", "w") as fh:
        json.dump(full_report, fh, indent=2)
    logger.info("Classification report saved.")

    # Update metadata with test results
    metadata["test_accuracy"] = round(accuracy, 4)
    metadata["macro_f1"] = round(macro_f1, 6)
    metadata["weighted_f1"] = round(weighted_f1, 6)
    from app.ml.model import save_model_metadata
    save_model_metadata(metadata, Path(args.metadata_path))

    # ── Plots ─────────────────────────────────────────────────────────────────
    plot_confusion_matrix(
        all_labels,
        all_preds,
        class_names,
        Path("artifacts/plots/confusion_matrix.png"),
    )
    plot_training_curves(
        Path("artifacts/reports/training_history.json"),
        Path("artifacts/plots/training_curves.png"),
    )

    logger.info("Evaluation complete.")


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WheatGuard AI – Evaluation")
    parser.add_argument("--model-path", type=str, default="models/best_model.pth")
    parser.add_argument("--class-names", type=str, default="models/class_names.json")
    parser.add_argument("--metadata-path", type=str, default="models/model_metadata.json")
    parser.add_argument("--data-dir", type=str, default="data")
    parser.add_argument("--batch-size", type=int, default=32)
    return parser.parse_args()


if __name__ == "__main__":
    evaluate(parse_args())
