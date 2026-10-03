"""
WheatGuard AI – Image Preprocessing
Provides reusable transforms for training, validation/test, and inference.
All transforms are defined once here so there is zero leakage between splits.
"""

from __future__ import annotations

import io
from typing import Literal

import numpy as np
import torch
from PIL import Image, UnidentifiedImageError
from torchvision import transforms

from app.core.config import settings
from app.core.exceptions import InvalidImageError
from app.core.logging import get_logger

logger = get_logger(__name__)

# ImageNet statistics – used because we fine-tune pretrained backbones
_IMAGENET_MEAN = (0.485, 0.456, 0.406)
_IMAGENET_STD = (0.229, 0.224, 0.225)


def get_train_transforms(image_size: int | None = None) -> transforms.Compose:
    """
    Return augmented transforms for the training split.

    Augmentations applied:
        - RandomResizedCrop
        - RandomHorizontalFlip
        - RandomVerticalFlip
        - RandomRotation (±15°)
        - ColorJitter (brightness / contrast / saturation)
        - RandomAffine (shear)
        - ToTensor + Normalise (ImageNet stats)

    Args:
        image_size: Target spatial dimension. Defaults to settings.image_size.

    Returns:
        Composed torchvision transform pipeline.
    """
    size = image_size or settings.image_size
    return transforms.Compose(
        [
            transforms.RandomResizedCrop(size, scale=(0.7, 1.0)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomVerticalFlip(p=0.2),
            transforms.RandomRotation(degrees=15),
            transforms.ColorJitter(
                brightness=0.3,
                contrast=0.3,
                saturation=0.3,
                hue=0.05,
            ),
            transforms.RandomAffine(degrees=0, shear=10),
            transforms.ToTensor(),
            transforms.Normalize(mean=_IMAGENET_MEAN, std=_IMAGENET_STD),
        ]
    )


def get_eval_transforms(image_size: int | None = None) -> transforms.Compose:
    """
    Return deterministic transforms for validation, test, and inference.

    No random operations – ensures reproducible evaluation metrics.

    Args:
        image_size: Target spatial dimension. Defaults to settings.image_size.

    Returns:
        Composed torchvision transform pipeline.
    """
    size = image_size or settings.image_size
    return transforms.Compose(
        [
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=_IMAGENET_MEAN, std=_IMAGENET_STD),
        ]
    )


def bytes_to_pil(image_bytes: bytes) -> Image.Image:
    """
    Convert raw image bytes to a PIL Image in RGB mode.

    Args:
        image_bytes: Raw bytes from an uploaded file or disk read.

    Returns:
        PIL Image object in RGB mode.

    Raises:
        InvalidImageError: If the bytes cannot be decoded as an image.
    """
    try:
        pil_image = Image.open(io.BytesIO(image_bytes))
        # Force RGB conversion – handles RGBA, L (greyscale), CMYK, etc.
        pil_image = pil_image.convert("RGB")
        return pil_image
    except UnidentifiedImageError as exc:
        logger.warning("bytes_to_pil failed – UnidentifiedImageError: %s", exc)
        raise InvalidImageError(
            "The uploaded file could not be identified as an image. "
            "Please upload a valid JPG, PNG, or WebP photograph."
        ) from exc
    except Exception as exc:
        logger.error("bytes_to_pil failed unexpectedly: %s", exc)
        raise InvalidImageError(
            "Failed to open the image. It may be corrupt or unsupported."
        ) from exc


def preprocess_for_inference(
    image_bytes: bytes,
    image_size: int | None = None,
) -> torch.Tensor:
    """
    Full pipeline: bytes → validated PIL image → normalised tensor.

    The returned tensor has shape ``[1, 3, H, W]`` ready for model.forward().

    Args:
        image_bytes: Raw uploaded bytes.
        image_size:  Override the default image size from settings.

    Returns:
        Float32 tensor on CPU with shape [1, 3, image_size, image_size].

    Raises:
        InvalidImageError: If bytes cannot be decoded.
    """
    pil_image = bytes_to_pil(image_bytes)
    transform = get_eval_transforms(image_size)
    tensor = transform(pil_image)          # [3, H, W]
    return tensor.unsqueeze(0)             # [1, 3, H, W]


def tensor_to_numpy(tensor: torch.Tensor) -> np.ndarray:
    """
    Convert a [C, H, W] or [1, C, H, W] float tensor to a uint8 NumPy array.

    Used by Grad-CAM to overlay heatmaps onto the original image pixels.

    Args:
        tensor: Normalised image tensor.

    Returns:
        NumPy array with shape [H, W, 3] and dtype uint8.
    """
    if tensor.ndim == 4:
        tensor = tensor.squeeze(0)

    # Detach from graph, move to CPU, remove gradient
    img = tensor.detach().cpu().numpy()

    # Denormalise using ImageNet stats
    mean = np.array(_IMAGENET_MEAN, dtype=np.float32).reshape(3, 1, 1)
    std = np.array(_IMAGENET_STD, dtype=np.float32).reshape(3, 1, 1)
    img = img * std + mean

    # Clip to [0, 1] then scale to uint8
    img = np.clip(img, 0.0, 1.0)
    img = (img * 255).astype(np.uint8)

    # [C, H, W] → [H, W, C]
    return np.transpose(img, (1, 2, 0))


def get_augmentation_examples(
    pil_image: Image.Image,
    n: int = 4,
    image_size: int | None = None,
) -> list[Image.Image]:
    """
    Generate *n* augmented variants of a PIL image for visualisation.

    Each call applies the training transform pipeline independently so each
    result is a different random augmentation of the same source image.

    Args:
        pil_image:  Source image.
        n:          Number of augmented copies to produce.
        image_size: Target spatial dimension.

    Returns:
        List of augmented PIL Images (denormalised, uint8).
    """
    transform = get_train_transforms(image_size)
    examples: list[Image.Image] = []

    for _ in range(n):
        tensor = transform(pil_image)
        np_img = tensor_to_numpy(tensor)
        examples.append(Image.fromarray(np_img))

    return examples
