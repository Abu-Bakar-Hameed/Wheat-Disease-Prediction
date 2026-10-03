"""
WheatGuard AI – Test-set metrics (name-aligned)

Computes REAL accuracy / precision / recall / F1 for the deployed model on the
held-out test split and persists them so the dashboard "AI Model Performance"
card can show genuine numbers instead of placeholders.

Unlike scripts/evaluate.py, this maps predictions to class NAMES (not the
ImageFolder positional index), so it stays correct when the test split contains
fewer classes than the model was trained on.

Usage:
    python scripts/compute_test_metrics.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import torch
from sklearn.metrics import classification_report
from torch.utils.data import DataLoader
from torchvision.datasets import ImageFolder

from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.ml.model import (
    build_model,
    load_class_names,
    load_model_metadata,
    save_model_metadata,
)
from app.ml.preprocessing import get_eval_transforms

setup_logging(level=settings.log_level)
logger = get_logger(__name__)


def main() -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    class_names = load_class_names(Path("models/class_names.json"))
    metadata = load_model_metadata(Path("models/model_metadata.json"))
    architecture = metadata.get("architecture", "efficientnet_b0")

    model = build_model(
        architecture=architecture,
        num_classes=len(class_names),
        pretrained=False,
    )
    state = torch.load("models/best_model.pth", map_location=device, weights_only=True)
    if isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]
    model.load_state_dict(state)
    model = model.to(device).eval()

    test_dir = Path("data/test")
    if not test_dir.exists():
        logger.error("Test directory '%s' not found.", test_dir)
        sys.exit(1)

    test_ds = ImageFolder(root=str(test_dir), transform=get_eval_transforms(settings.image_size))
    loader = DataLoader(test_ds, batch_size=8, shuffle=False, num_workers=0)
    # Directory names (test_ds.classes) are the ground-truth labels.
    folder_to_name = {i: test_ds.classes[i] for i in range(len(test_ds.classes))}

    y_true: list[str] = []
    y_pred: list[str] = []
    with torch.no_grad():
        for images, labels in loader:
            logits = model(images.to(device))
            preds = logits.argmax(dim=1).cpu().tolist()
            for lab, pred in zip(labels.tolist(), preds):
                y_true.append(folder_to_name[lab])
                y_pred.append(class_names[pred])

    if not y_true:
        logger.error("No test images found under %s.", test_dir)
        sys.exit(1)

    labels = sorted(set(y_true) | set(y_pred))
    accuracy = sum(t == p for t, p in zip(y_true, y_pred)) / len(y_true) * 100
    report = classification_report(
        y_true, y_pred, labels=labels, output_dict=True, zero_division=0
    )
    weighted = report.get("weighted avg", {})
    macro = report.get("macro avg", {})

    metrics = {
        "n_test_images": len(y_true),
        "classes_evaluated": labels,
        "accuracy": round(accuracy, 2),
        "precision": round(float(weighted.get("precision", 0.0)) * 100, 2),
        "recall": round(float(weighted.get("recall", 0.0)) * 100, 2),
        "f1": round(float(weighted.get("f1-score", 0.0)) * 100, 2),
        "macro_f1": round(float(macro.get("f1-score", 0.0)) * 100, 2),
        "per_class": report,
    }

    Path("artifacts/reports").mkdir(parents=True, exist_ok=True)
    with open("artifacts/reports/classification_report.json", "w") as fh:
        json.dump(metrics, fh, indent=2)

    # Persist the headline metrics into model metadata too, so they survive even
    # if the artifacts folder is regenerated.
    metadata["test_accuracy"] = metrics["accuracy"]
    metadata["test_precision"] = metrics["precision"]
    metadata["test_recall"] = metrics["recall"]
    metadata["test_f1"] = metrics["f1"]
    metadata["test_metrics_source"] = "scripts/compute_test_metrics.py"
    save_model_metadata(metadata, Path("models/model_metadata.json"))

    logger.info(
        "Real test metrics on %d images -> acc=%.1f%% precision=%.1f%% recall=%.1f%% f1=%.1f%%",
        metrics["n_test_images"],
        metrics["accuracy"],
        metrics["precision"],
        metrics["recall"],
        metrics["f1"],
    )
    print(json.dumps({k: v for k, v in metrics.items() if k != "per_class"}, indent=2))


if __name__ == "__main__":
    main()
