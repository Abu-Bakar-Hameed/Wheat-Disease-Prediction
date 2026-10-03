"""
WheatGuard AI – Grad-CAM Explainability
Implements Gradient-weighted Class Activation Mapping (Grad-CAM) to produce
visual explanations of model predictions.

Disclaimer: Grad-CAM is an approximate explanation technique. The highlighted
regions indicate which image areas most influenced the model's decision, but
this is NOT a scientific diagnosis. Always consult an agricultural expert.

Reference: Selvaraju et al., "Grad-CAM: Visual Explanations from Deep Networks
via Gradient-based Localization", ICCV 2017.
"""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
import torch.nn as nn
from PIL import Image

from app.core.config import settings
from app.core.exceptions import InferenceError, ModelNotLoadedError
from app.core.logging import get_logger
from app.ml.preprocessing import bytes_to_pil, get_eval_transforms, tensor_to_numpy

logger = get_logger(__name__)


class GradCAM:
    """
    Grad-CAM implementation that works with any CNN backbone.

    It hooks into the last convolutional layer to capture activations and
    gradients, then upsamples the resulting heatmap to match the input image.

    Args:
        model:       Trained PyTorch model in eval mode.
        target_layer: The ``nn.Module`` representing the last conv layer.
    """

    def __init__(self, model: nn.Module, target_layer: nn.Module) -> None:
        self._model = model
        self._target_layer = target_layer
        self._activations: torch.Tensor | None = None
        self._gradients: torch.Tensor | None = None
        self._hooks: list[Any] = []
        self._register_hooks()

    # ── Hook registration ─────────────────────────────────────────────────────

    def _register_hooks(self) -> None:
        """Attach forward and backward hooks to the target layer."""

        def _fwd_hook(module: nn.Module, input: Any, output: torch.Tensor) -> None:  # noqa: A002
            self._activations = output.detach()

        def _bwd_hook(module: nn.Module, grad_in: Any, grad_out: tuple[torch.Tensor, ...]) -> None:
            self._gradients = grad_out[0].detach()

        self._hooks.append(self._target_layer.register_forward_hook(_fwd_hook))
        self._hooks.append(self._target_layer.register_full_backward_hook(_bwd_hook))

    def remove_hooks(self) -> None:
        """Remove all registered hooks (call when done to free memory)."""
        for hook in self._hooks:
            hook.remove()
        self._hooks.clear()

    # ── CAM computation ───────────────────────────────────────────────────────

    def generate(
        self,
        tensor: torch.Tensor,
        class_idx: int | None = None,
    ) -> np.ndarray:
        """
        Produce a Grad-CAM heatmap for the given input tensor.

        Args:
            tensor:    Preprocessed input tensor of shape [1, C, H, W].
            class_idx: Index of the class to explain. If None, uses the
                       predicted (argmax) class.

        Returns:
            Float32 NumPy array of shape [H, W] with values in [0, 1].
            H, W match the spatial dimensions of the input tensor.
        """
        self._model.eval()
        tensor = tensor.clone().requires_grad_(True)

        # Forward pass
        logits = self._model(tensor)  # [1, num_classes]

        if class_idx is None:
            class_idx = int(logits.argmax(dim=1).item())

        # Zero existing gradients, then back-prop the chosen class score
        self._model.zero_grad()
        class_score = logits[0, class_idx]
        class_score.backward()

        if self._gradients is None or self._activations is None:
            raise InferenceError(
                "Grad-CAM hooks did not fire. "
                "Ensure the target layer is correct for this architecture."
            )

        # Global average pool the gradients: [C] importance weights
        weights = self._gradients.mean(dim=(2, 3), keepdim=True)  # [1, C, 1, 1]

        # Weighted sum of activation maps
        cam: torch.Tensor = (weights * self._activations).sum(dim=1, keepdim=True)  # [1, 1, h, w]
        cam = torch.relu(cam)  # Keep only positive contributions

        # Normalise to [0, 1]
        cam_min = cam.min()
        cam_max = cam.max()
        if cam_max - cam_min > 1e-8:
            cam = (cam - cam_min) / (cam_max - cam_min)

        # Upsample to input spatial size
        _, _, H, W = tensor.shape
        cam_resized = torch.nn.functional.interpolate(
            cam,
            size=(H, W),
            mode="bilinear",
            align_corners=False,
        )

        return cam_resized.squeeze().detach().cpu().numpy()  # [H, W]


def _find_last_conv_layer(model: nn.Module) -> nn.Module:
    """
    Heuristically locate the last Conv2d layer in a model.

    Walks the module tree in reverse registration order. Works reliably with
    EfficientNet-B0 (timm/torchvision) and ResNet-50.

    Raises:
        ValueError: If no Conv2d layer can be found.
    """
    last_conv: nn.Module | None = None
    for module in model.modules():
        if isinstance(module, nn.Conv2d):
            last_conv = module
    if last_conv is None:
        raise ValueError(
            "Could not locate a Conv2d layer in the model. "
            "Please specify the target layer manually."
        )
    return last_conv


def _heatmap_to_colormap(heatmap: np.ndarray) -> np.ndarray:
    """
    Convert a [H, W] float32 heatmap in [0, 1] to a BGR uint8 colour map.

    Uses OpenCV's JET colour map (blue=low activation, red=high activation).
    """
    heatmap_uint8 = np.uint8(255 * heatmap)
    colormap = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    return colormap  # BGR, uint8


def _overlay_heatmap(
    original_rgb: np.ndarray,
    heatmap: np.ndarray,
    alpha: float = 0.45,
) -> np.ndarray:
    """
    Blend a coloured heatmap onto the original RGB image.

    Args:
        original_rgb: uint8 RGB array [H, W, 3].
        heatmap:      float32 array [H, W] in [0, 1].
        alpha:        Heatmap opacity (0 = invisible, 1 = fully opaque).

    Returns:
        Blended uint8 RGB array [H, W, 3].
    """
    colormap_bgr = _heatmap_to_colormap(heatmap)
    colormap_rgb = cv2.cvtColor(colormap_bgr, cv2.COLOR_BGR2RGB)

    # Resize colormap to match original if needed
    if colormap_rgb.shape[:2] != original_rgb.shape[:2]:
        colormap_rgb = cv2.resize(
            colormap_rgb,
            (original_rgb.shape[1], original_rgb.shape[0]),
            interpolation=cv2.INTER_LINEAR,
        )

    overlay = cv2.addWeighted(original_rgb, 1 - alpha, colormap_rgb, alpha, 0)
    return overlay.astype(np.uint8)


def _array_to_base64_png(array: np.ndarray) -> str:
    """Encode a uint8 RGB NumPy array as a base64 PNG data URI."""
    pil_img = Image.fromarray(array.astype(np.uint8))
    buffer = io.BytesIO()
    pil_img.save(buffer, format="PNG", optimize=True)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def run_gradcam(
    model: nn.Module,
    image_bytes: bytes,
    class_idx: int | None = None,
    save_dir: Path | None = None,
    filename_prefix: str = "gradcam",
) -> dict[str, str]:
    """
    Full Grad-CAM pipeline: image bytes → explanation images.

    Returns base64-encoded PNG data URIs so the FastAPI response can carry
    the images directly without writing to disk (unless save_dir is given).

    Args:
        model:           Trained model in eval mode.
        image_bytes:     Raw uploaded image bytes.
        class_idx:       Class index to explain; None → predicted class.
        save_dir:        Optional directory to save PNG files to disk.
        filename_prefix: Prefix for saved filenames.

    Returns:
        Dictionary with keys:
            - ``original``  – base64 data URI of the original image.
            - ``heatmap``   – base64 data URI of the raw heatmap.
            - ``overlay``   – base64 data URI of the blended overlay.

    Raises:
        ModelNotLoadedError: If model is None.
        InferenceError:      On any unexpected failure.
    """
    if model is None:
        raise ModelNotLoadedError()

    # ── Prepare input ─────────────────────────────────────────────────────────
    pil_image = bytes_to_pil(image_bytes)
    transform = get_eval_transforms()
    tensor = transform(pil_image).unsqueeze(0)  # [1, C, H, W]

    device = next(model.parameters()).device
    tensor = tensor.to(device)

    # Original image as RGB numpy array (same spatial size as model input)
    original_np = tensor_to_numpy(tensor)  # [H, W, 3] uint8

    # ── Grad-CAM ──────────────────────────────────────────────────────────────
    try:
        target_layer = _find_last_conv_layer(model)
        cam = GradCAM(model=model, target_layer=target_layer)
        heatmap = cam.generate(tensor, class_idx=class_idx)
        cam.remove_hooks()
    except Exception as exc:
        logger.error("Grad-CAM generation failed: %s", exc, exc_info=True)
        raise InferenceError(f"Grad-CAM failed: {exc}") from exc

    # ── Build output images ───────────────────────────────────────────────────
    heatmap_uint8 = np.uint8(255 * heatmap)
    heatmap_color_bgr = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    heatmap_color_rgb = cv2.cvtColor(heatmap_color_bgr, cv2.COLOR_BGR2RGB)
    overlay_np = _overlay_heatmap(original_np, heatmap)

    # ── Optional disk save ────────────────────────────────────────────────────
    if save_dir is not None:
        save_dir = Path(save_dir)
        save_dir.mkdir(parents=True, exist_ok=True)
        Image.fromarray(original_np).save(save_dir / f"{filename_prefix}_original.png")
        Image.fromarray(heatmap_color_rgb).save(save_dir / f"{filename_prefix}_heatmap.png")
        Image.fromarray(overlay_np).save(save_dir / f"{filename_prefix}_overlay.png")
        logger.info("Grad-CAM images saved to %s", save_dir)

    return {
        "original": _array_to_base64_png(original_np),
        "heatmap": _array_to_base64_png(heatmap_color_rgb),
        "overlay": _array_to_base64_png(overlay_np),
    }
