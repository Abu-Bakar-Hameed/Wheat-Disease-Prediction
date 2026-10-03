"""
WheatGuard AI – Training Script
Trains an EfficientNet-B0 classifier on the prepared dataset splits.

Usage:
    python scripts/train.py [--epochs 20] [--batch-size 32] [--lr 0.0001]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

# Allow running from the project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision.datasets import ImageFolder

from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.ml.model import build_model, load_class_names, save_model_metadata
from app.ml.preprocessing import get_eval_transforms, get_train_transforms
from app.ml.utils import compute_class_weights, set_seed

setup_logging(level=settings.log_level)
logger = get_logger(__name__)


# ── Dataset helpers ───────────────────────────────────────────────────────────

def load_datasets(
    data_dir: Path,
    image_size: int,
) -> tuple[ImageFolder, ImageFolder, ImageFolder]:
    """Load train / validation / test ImageFolder datasets."""
    train_dir = data_dir / "train"
    val_dir = data_dir / "validation"
    test_dir = data_dir / "test"

    for d in (train_dir, val_dir, test_dir):
        if not d.exists():
            logger.error(
                "Split directory '%s' not found. "
                "Run scripts/prepare_dataset.py first.",
                d,
            )
            sys.exit(1)

    train_ds = ImageFolder(root=str(train_dir), transform=get_train_transforms(image_size))
    val_ds = ImageFolder(root=str(val_dir), transform=get_eval_transforms(image_size))
    test_ds = ImageFolder(root=str(test_dir), transform=get_eval_transforms(image_size))

    logger.info(
        "Loaded datasets — train: %d  val: %d  test: %d",
        len(train_ds),
        len(val_ds),
        len(test_ds),
    )
    return train_ds, val_ds, test_ds


def build_loaders(
    train_ds: ImageFolder,
    val_ds: ImageFolder,
    test_ds: ImageFolder,
    batch_size: int,
    use_class_weights: bool,
    num_workers: int = 2,
) -> tuple[DataLoader, DataLoader, DataLoader]:
    """Build DataLoaders with optional WeightedRandomSampler for imbalanced data."""
    train_loader_kwargs: dict = {
        "batch_size": batch_size,
        "num_workers": num_workers,
        "pin_memory": True,
    }

    if use_class_weights:
        labels = [label for _, label in train_ds.samples]
        class_weights = compute_class_weights(labels, num_classes=len(train_ds.classes))
        sample_weights = [class_weights[label].item() for _, label in train_ds.samples]
        sampler = WeightedRandomSampler(
            weights=sample_weights,
            num_samples=len(sample_weights),
            replacement=True,
        )
        train_loader_kwargs["sampler"] = sampler
        logger.info("WeightedRandomSampler enabled for imbalanced training data.")
    else:
        train_loader_kwargs["shuffle"] = True

    train_loader = DataLoader(train_ds, **train_loader_kwargs)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False,
                            num_workers=num_workers, pin_memory=True)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False,
                             num_workers=num_workers, pin_memory=True)

    return train_loader, val_loader, test_loader


# ── Training loop ─────────────────────────────────────────────────────────────

class EarlyStopping:
    """Stops training when validation loss does not improve for *patience* epochs."""

    def __init__(self, patience: int = 5, min_delta: float = 1e-4) -> None:
        self.patience = patience
        self.min_delta = min_delta
        self.best_loss = float("inf")
        self.counter = 0
        self.triggered = False

    def step(self, val_loss: float) -> bool:
        """Return True if training should stop."""
        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.triggered = True
        return self.triggered


def run_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    optimizer: torch.optim.Optimizer | None = None,
) -> tuple[float, float]:
    """
    Run one epoch (train or eval).

    Args:
        optimizer: Pass None for evaluation mode.

    Returns:
        (avg_loss, accuracy_pct)
    """
    is_train = optimizer is not None
    model.train() if is_train else model.eval()

    total_loss = 0.0
    correct = 0
    total = 0

    context = torch.enable_grad() if is_train else torch.no_grad()
    with context:
        for images, labels in loader:
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            logits = model(images)
            loss = criterion(logits, labels)

            if is_train and optimizer is not None:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

            total_loss += loss.item() * images.size(0)
            preds = logits.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += images.size(0)

    avg_loss = total_loss / total if total > 0 else 0.0
    accuracy = (correct / total * 100) if total > 0 else 0.0
    return avg_loss, accuracy


def train(args: argparse.Namespace) -> None:
    set_seed(args.seed)

    device = torch.device(
        "cuda" if torch.cuda.is_available() and args.device != "cpu" else "cpu"
    )
    logger.info("Training device: %s", device)

    # ── Data ──────────────────────────────────────────────────────────────────
    data_dir = Path(args.data_dir)
    train_ds, val_ds, test_ds = load_datasets(data_dir, args.image_size)
    class_names = train_ds.classes
    num_classes = len(class_names)

    train_loader, val_loader, _ = build_loaders(
        train_ds, val_ds, test_ds,
        batch_size=args.batch_size,
        use_class_weights=args.use_class_weights,
    )

    # ── Model ─────────────────────────────────────────────────────────────────
    model = build_model(
        architecture=args.architecture,
        num_classes=num_classes,
        pretrained=True,
    )
    model = model.to(device)

    # ── Loss & optimiser ──────────────────────────────────────────────────────
    if args.use_class_weights:
        labels_all = [label for _, label in train_ds.samples]
        weights = compute_class_weights(labels_all, num_classes).to(device)
        criterion: nn.Module = nn.CrossEntropyLoss(weight=weights)
        logger.info("Using weighted CrossEntropyLoss.")
    else:
        criterion = nn.CrossEntropyLoss()

    optimizer = AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs)
    early_stop = EarlyStopping(patience=args.patience)

    # ── Training loop ─────────────────────────────────────────────────────────
    checkpoint_dir = Path("models/checkpoints")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    best_val_loss = float("inf")
    best_val_acc = 0.0
    history: list[dict] = []

    logger.info(
        "Starting training: epochs=%d  batch=%d  lr=%g  patience=%d",
        args.epochs,
        args.batch_size,
        args.lr,
        args.patience,
    )

    for epoch in range(1, args.epochs + 1):
        t0 = time.perf_counter()

        train_loss, train_acc = run_epoch(model, train_loader, criterion, device, optimizer)
        val_loss, val_acc = run_epoch(model, val_loader, criterion, device)
        scheduler.step()

        elapsed = time.perf_counter() - t0
        logger.info(
            "Epoch %3d/%d | train_loss=%.4f acc=%.2f%% | "
            "val_loss=%.4f acc=%.2f%% | %.1fs",
            epoch,
            args.epochs,
            train_loss,
            train_acc,
            val_loss,
            val_acc,
            elapsed,
        )

        history.append({
            "epoch": epoch,
            "train_loss": round(train_loss, 6),
            "train_acc": round(train_acc, 4),
            "val_loss": round(val_loss, 6),
            "val_acc": round(val_acc, 4),
        })

        # ── Checkpoint every epoch ────────────────────────────────────────────
        ckpt_path = checkpoint_dir / f"checkpoint_epoch_{epoch:03d}.pth"
        torch.save(
            {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_loss": val_loss,
                "val_acc": val_acc,
                "class_names": class_names,
            },
            ckpt_path,
        )

        # ── Save best model ───────────────────────────────────────────────────
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_val_acc = val_acc
            torch.save(model.state_dict(), "models/best_model.pth")
            logger.info(
                "  ✓ New best model saved (val_loss=%.4f  val_acc=%.2f%%)",
                best_val_loss,
                best_val_acc,
            )

        # ── Early stopping ────────────────────────────────────────────────────
        if early_stop.step(val_loss):
            logger.info(
                "Early stopping triggered after epoch %d "
                "(no improvement for %d consecutive epochs).",
                epoch,
                args.patience,
            )
            break

    # ── Save class names & training history ───────────────────────────────────
    import json as _json
    Path("models/class_names.json").parent.mkdir(parents=True, exist_ok=True)
    with open("models/class_names.json", "w") as fh:
        _json.dump(class_names, fh, indent=2)

    Path("artifacts/reports").mkdir(parents=True, exist_ok=True)
    with open("artifacts/reports/training_history.json", "w") as fh:
        _json.dump(history, fh, indent=2)

    # ── Save model metadata ───────────────────────────────────────────────────
    metadata = {
        "model_version": f"1.0.0-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        "training_date": datetime.utcnow().isoformat(),
        "architecture": args.architecture,
        "image_size": args.image_size,
        "num_classes": num_classes,
        "class_names": class_names,
        "epochs_trained": len(history),
        "best_val_loss": round(best_val_loss, 6),
        "best_val_acc": round(best_val_acc, 4),
        "hyperparameters": {
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "weight_decay": args.weight_decay,
            "patience": args.patience,
            "use_class_weights": args.use_class_weights,
            "seed": args.seed,
        },
    }
    save_model_metadata(metadata, Path("models/model_metadata.json"))

    logger.info(
        "Training complete. Best val_acc=%.2f%%  val_loss=%.4f",
        best_val_acc,
        best_val_loss,
    )


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WheatGuard AI – Training")
    parser.add_argument("--data-dir", type=str, default="data")
    parser.add_argument("--architecture", type=str, default="efficientnet_b0")
    parser.add_argument("--epochs", type=int, default=settings.epochs)
    parser.add_argument("--batch-size", type=int, default=settings.batch_size)
    parser.add_argument("--lr", type=float, default=settings.learning_rate)
    parser.add_argument("--weight-decay", type=float, default=settings.weight_decay)
    parser.add_argument("--patience", type=int, default=settings.early_stopping_patience)
    parser.add_argument("--seed", type=int, default=settings.random_seed)
    parser.add_argument("--image-size", type=int, default=settings.image_size)
    parser.add_argument("--device", type=str, default="auto")
    parser.add_argument(
        "--use-class-weights",
        action="store_true",
        default=settings.use_class_weights,
    )
    return parser.parse_args()


if __name__ == "__main__":
    train(parse_args())
