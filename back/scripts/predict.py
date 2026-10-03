"""
WheatGuard AI – CLI Prediction Script
Run inference on a single image from the command line.

Usage:
    python scripts/predict.py --image path/to/wheat_leaf.jpg
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running from the project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.ml.inference import ModelManager

setup_logging(level="INFO")
logger = get_logger(__name__)


def predict_image(image_path: Path, top_k: int = 3) -> None:
    """
    Load the trained model and run inference on a single image.

    Args:
        image_path: Path to the input image file.
        top_k:      Number of top predictions to display.
    """
    if not image_path.exists():
        logger.error("Image not found: '%s'", image_path)
        sys.exit(1)

    # Load model
    manager = ModelManager()
    try:
        manager.load()
    except Exception as exc:
        logger.error("Failed to load model: %s", exc)
        sys.exit(1)

    if not manager.is_loaded:
        logger.error(
            "Model is not available. "
            "Run scripts/train.py first to train the model."
        )
        sys.exit(1)

    # Read image bytes
    image_bytes = image_path.read_bytes()

    # Run prediction
    try:
        result = manager.predict(image_bytes, top_k=top_k)
    except Exception as exc:
        logger.error("Prediction failed: %s", exc)
        sys.exit(1)

    # ── Display results ───────────────────────────────────────────────────────
    print("\n" + "=" * 55)
    print(f"  WheatGuard AI – Prediction Result")
    print("=" * 55)
    print(f"  Image          : {image_path.name}")
    print(f"  Prediction     : {result['prediction']}")
    print(f"  Confidence     : {result['confidence_percentage']:.2f}%")
    print(f"  Inference Time : {result['inference_time_ms']:.1f} ms")
    print(f"  Model Version  : {result['model_version']}")

    if result["low_confidence"]:
        print(
            "\n  ⚠  Low confidence prediction.\n"
            "     Please upload a clearer image or consult an agricultural expert."
        )

    print(f"\n  Top {len(result['top_predictions'])} Predictions:")
    print("  " + "-" * 40)
    for p in result["top_predictions"]:
        bar_len = int(p["confidence_percentage"] / 5)
        bar = "█" * bar_len
        print(
            f"  {p['rank']}. {p['class_name']:<25} {p['confidence_percentage']:6.2f}%  {bar}"
        )

    print("\n  Disclaimer: AI Prediction only.")
    print("  Consult an agricultural expert for confirmation.")
    print("=" * 55 + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WheatGuard AI – CLI Prediction")
    parser.add_argument(
        "--image",
        type=Path,
        required=True,
        help="Path to the input wheat image.",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=3,
        help="Number of top predictions to display.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    predict_image(args.image, top_k=args.top_k)
