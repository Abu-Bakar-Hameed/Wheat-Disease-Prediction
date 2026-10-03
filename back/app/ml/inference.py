"""
WheatGuard AI – Inference Engine (ModelManager)
Loads the model once at startup and exposes a thread-safe predict() method.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F

from app.core.config import settings
from app.core.exceptions import InferenceError, ModelLoadError, ModelNotLoadedError
from app.core.logging import get_logger
from app.ml.model import build_model, load_class_names, load_model_metadata
from app.ml.preprocessing import preprocess_for_inference

logger = get_logger(__name__)


# Per-disease "low confidence" cut-offs. A top-1 prediction below its class's
# moderate threshold is flagged ``low_confidence``. These mirror the frontend
# tier table (front/src/lib/confidence.ts) so the UI label and this flag never
# disagree. Unknown classes fall back to the global settings.confidence_threshold.
_LOW_CONFIDENCE_BY_CLASS: dict[str, float] = {
    "healthy": 0.60,
    "stem rust": 0.60,
    "fusarium head blight": 0.60,
    "leaf rust": 0.55,
    "brown rust": 0.55,
    "yellow rust": 0.55,
    "powdery mildew": 0.55,
    "septoria leaf blotch": 0.55,
    "septoria": 0.55,
    "tan spot": 0.55,
}


def _low_confidence_threshold(class_name: str) -> float:
    """Resolve the low-confidence cut-off for a predicted class."""
    return _LOW_CONFIDENCE_BY_CLASS.get(
        class_name.lower().strip(), settings.confidence_threshold
    )


def _resolve_device(device_str: str) -> torch.device:
    """
    Resolve the configured device string to a torch.device.

    'auto' → cuda if available, else cpu
    'cuda' → requires CUDA; raises RuntimeError if unavailable
    'cpu'  → always CPU
    """
    if device_str == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device_str == "cuda":
        if not torch.cuda.is_available():
            logger.warning("CUDA requested but not available. Falling back to CPU.")
            return torch.device("cpu")
        return torch.device("cuda")
    return torch.device("cpu")


class ModelManager:
    """
    Singleton-style manager that owns the model lifecycle.

    Usage::

        manager = ModelManager()
        manager.load()                        # called once at startup
        result = manager.predict(image_bytes) # called per request
    """

    def __init__(self) -> None:
        self._model: torch.nn.Module | None = None
        self._class_names: list[str] = []
        self._metadata: dict[str, Any] = {}
        self._device: torch.device = torch.device("cpu")
        self._loaded: bool = False

    # ── Loading ───────────────────────────────────────────────────────────────

    def load(
        self,
        model_path: Path | None = None,
        class_names_path: Path | None = None,
        metadata_path: Path | None = None,
    ) -> None:
        """
        Load the model weights and class names from disk.

        Safe to call at application startup.  Logs a warning (rather than
        raising) when no weights file exists yet, so the API can start and
        report a degraded health status instead of refusing to boot.

        Args:
            model_path:       Override the model .pth path from settings.
            class_names_path: Override the class names JSON path.
            metadata_path:    Override the metadata JSON path.
        """
        model_path = Path(model_path or settings.model_path)
        class_names_path = Path(class_names_path or settings.class_names_path)
        metadata_path = Path(metadata_path or settings.model_metadata_path)

        self._device = _resolve_device(settings.device)
        logger.info("Inference device: %s", self._device)

        # ── Class names ───────────────────────────────────────────────────────
        try:
            self._class_names = load_class_names(class_names_path)
        except FileNotFoundError:
            logger.warning(
                "class_names.json not found at '%s'. "
                "Model cannot be loaded until training is complete.",
                class_names_path,
            )
            self._loaded = False
            return

        num_classes = len(self._class_names)

        # ── Model weights ─────────────────────────────────────────────────────
        architecture = self._metadata.get("architecture", "efficientnet_b0")
        try:
            self._model = build_model(
                architecture=architecture,
                num_classes=num_classes,
                pretrained=False,  # We load our own weights
            )
        except Exception as exc:
            raise ModelLoadError(
                f"Failed to build model architecture '{architecture}': {exc}"
            ) from exc

        if not model_path.exists():
            logger.warning(
                "Model weights not found at '%s'. "
                "API will start in degraded mode (predictions unavailable).",
                model_path,
            )
            self._loaded = False
            return

        try:
            state_dict = torch.load(
                model_path,
                map_location=self._device,
                weights_only=True,
            )
            # Handle checkpoints that wrap state_dict in a dict
            if isinstance(state_dict, dict) and "model_state_dict" in state_dict:
                state_dict = state_dict["model_state_dict"]
            self._model.load_state_dict(state_dict)
        except Exception as exc:
            raise ModelLoadError(
                f"Failed to load weights from '{model_path}': {exc}"
            ) from exc

        self._model.to(self._device)
        self._model.eval()

        # ── Metadata ──────────────────────────────────────────────────────────
        self._metadata = load_model_metadata(metadata_path)

        self._loaded = True
        logger.info(
            "Model loaded successfully | classes=%d | device=%s | version=%s",
            num_classes,
            self._device,
            self._metadata.get("model_version", "unknown"),
        )

    # ── Prediction ────────────────────────────────────────────────────────────

    def predict(
        self,
        image_bytes: bytes,
        top_k: int | None = None,
    ) -> dict[str, Any]:
        """
        Run inference on raw image bytes.

        Args:
            image_bytes: Raw bytes of the uploaded image.
            top_k:       Number of top predictions to return.
                         Defaults to settings.top_k_predictions.

        Returns:
            Dictionary containing:
                - prediction (str): Top-1 class name.
                - confidence (float): Top-1 probability [0, 1].
                - confidence_percentage (float): Top-1 probability × 100.
                - top_predictions (list[dict]): Top-k classes with probabilities.
                - low_confidence (bool): True when confidence < threshold.
                - inference_time_ms (float): Wall-clock inference duration.
                - model_version (str): Version tag from metadata.

        Raises:
            ModelNotLoadedError: If load() has not been called successfully.
            InvalidImageError:   Propagated from preprocessing.
            InferenceError:      On unexpected model forward-pass failure.
        """
        if not self._loaded or self._model is None:
            raise ModelNotLoadedError()

        k = min(top_k or settings.top_k_predictions, len(self._class_names))

        # ── Pre-process ───────────────────────────────────────────────────────
        tensor = preprocess_for_inference(image_bytes)
        tensor = tensor.to(self._device)

        # ── Forward pass ──────────────────────────────────────────────────────
        t0 = time.perf_counter()
        try:
            with torch.no_grad():
                logits = self._model(tensor)          # [1, num_classes]
                probabilities = F.softmax(logits, dim=1).squeeze(0)  # [num_classes]
        except Exception as exc:
            logger.error("Model forward pass failed: %s", exc, exc_info=True)
            raise InferenceError(f"AI inference failed: {exc}") from exc
        inference_ms = (time.perf_counter() - t0) * 1000

        # ── Top-k results ─────────────────────────────────────────────────────
        top_probs, top_indices = torch.topk(probabilities, k=k)
        top_probs_list = top_probs.cpu().tolist()
        top_indices_list = top_indices.cpu().tolist()

        top_predictions = [
            {
                "rank": rank + 1,
                "class_name": self._class_names[idx],
                "confidence": round(prob, 6),
                "confidence_percentage": round(prob * 100, 2),
            }
            for rank, (prob, idx) in enumerate(
                zip(top_probs_list, top_indices_list)
            )
        ]

        best = top_predictions[0]
        low_confidence = best["confidence"] < _low_confidence_threshold(
            best["class_name"]
        )

        logger.info(
            "Prediction: class=%s confidence=%.2f%% low_confidence=%s time=%.1fms",
            best["class_name"],
            best["confidence_percentage"],
            low_confidence,
            inference_ms,
        )

        return {
            "prediction": best["class_name"],
            "confidence": best["confidence"],
            "confidence_percentage": best["confidence_percentage"],
            "top_predictions": top_predictions,
            "low_confidence": low_confidence,
            "inference_time_ms": round(inference_ms, 2),
            "model_version": self._metadata.get("model_version", "unknown"),
        }

    # ── Accessors ─────────────────────────────────────────────────────────────

    @property
    def is_loaded(self) -> bool:
        """True when the model is ready for inference."""
        return self._loaded

    @property
    def class_names(self) -> list[str]:
        return list(self._class_names)

    @property
    def num_classes(self) -> int:
        return len(self._class_names)

    @property
    def metadata(self) -> dict[str, Any]:
        return dict(self._metadata)

    @property
    def device(self) -> str:
        return str(self._device)

    @property
    def model(self) -> torch.nn.Module | None:
        """Expose raw model (needed by Grad-CAM)."""
        return self._model


# ── Application-level singleton ───────────────────────────────────────────────
# Imported by the FastAPI app and the Grad-CAM module.
model_manager = ModelManager()
