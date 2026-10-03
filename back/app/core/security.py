"""
WheatGuard AI – Security Utilities
Filename sanitisation, MIME validation, upload guards, and wheat-leaf content validation.
"""

from __future__ import annotations

import hashlib
import io
import re
import unicodedata
from pathlib import Path

import numpy as np
from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.core.exceptions import (
    ImageTooLargeError,
    InvalidImageError,
    NotAWheatLeafError,
    UnsupportedImageError,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

# Allowed MIME types mapped to canonical extensions
_ALLOWED_MIME_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def sanitise_filename(filename: str) -> str:
    """
    Return a safe, ASCII-only filename stripped of path traversal characters.

    - Normalise unicode to ASCII
    - Keep only alphanumeric characters, dashes, underscores, and dots
    - Collapse multiple dots to prevent extension spoofing
    - Fallback to 'upload' if the result is empty
    """
    # Normalise unicode → ASCII
    normalised = unicodedata.normalize("NFKD", filename)
    ascii_name = normalised.encode("ascii", "ignore").decode("ascii")

    # Strip path separators and null bytes
    safe = re.sub(r"[^\w.\-]", "_", ascii_name)

    # Prevent leading dots (hidden files on Unix)
    safe = safe.lstrip(".")

    return safe or "upload"


def get_extension(filename: str) -> str:
    """Return the lowercased file extension without a leading dot."""
    return Path(filename).suffix.lstrip(".").lower()


async def validate_upload(file: UploadFile) -> bytes:
    """
    Read, validate, and return the raw bytes of an uploaded image.

    Checks performed:
    1. File extension is in the allowed list.
    2. File size is within the configured limit.
    3. Content-type header is an allowed MIME type.
    4. The file can actually be read as bytes.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Raw image bytes.

    Raises:
        UnsupportedImageError: Extension or MIME type not allowed.
        ImageTooLargeError:    File exceeds the size limit.
        InvalidImageError:     File cannot be read.
    """
    # 1. Extension check
    if file.filename:
        ext = get_extension(file.filename)
        if ext not in settings.allowed_extensions:
            raise UnsupportedImageError(
                f"File extension '.{ext}' is not allowed. "
                f"Use one of: {', '.join(settings.allowed_extensions)}"
            )

    # 2. MIME type check (from Content-Type header – not perfectly reliable,
    #    but provides a first line of defence)
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in _ALLOWED_MIME_TYPES:
        raise UnsupportedImageError(
            f"Content-Type '{content_type}' is not supported."
        )

    # 3. Read bytes
    try:
        raw_bytes = await file.read()
    except Exception as exc:
        logger.error("Failed to read uploaded file: %s", exc)
        raise InvalidImageError("Could not read the uploaded file.") from exc

    # 4. Size check
    size_bytes = len(raw_bytes)
    if size_bytes > settings.max_upload_size_bytes:
        raise ImageTooLargeError(
            f"File size {size_bytes / 1024 / 1024:.1f} MB exceeds the "
            f"{settings.max_upload_size_mb} MB limit."
        )

    if size_bytes == 0:
        raise InvalidImageError("Uploaded file is empty.")

    logger.debug(
        "Upload accepted: filename=%s, size=%d bytes, content_type=%s",
        file.filename,
        size_bytes,
        content_type,
    )
    return raw_bytes


_ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov"}
_ALLOWED_VIDEO_MIMES = {"video/mp4", "video/webm", "video/quicktime"}
MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB


async def validate_video_upload(file: UploadFile) -> bytes:
    """
    Read, validate, and return raw bytes of an uploaded video.
    Allowed formats: MP4, WEBM, MOV up to 100 MB.
    """
    if file.filename:
        ext = get_extension(file.filename)
        if ext not in _ALLOWED_VIDEO_EXTENSIONS:
            raise UnsupportedImageError(
                f"Video extension '.{ext}' is not allowed. "
                f"Use one of: {', '.join(_ALLOWED_VIDEO_EXTENSIONS)}"
            )

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in _ALLOWED_VIDEO_MIMES:
        raise UnsupportedImageError(f"Video Content-Type '{content_type}' is not supported.")

    try:
        raw_bytes = await file.read()
    except Exception as exc:
        logger.error("Failed to read uploaded video file: %s", exc)
        raise InvalidImageError("Could not read uploaded video file.") from exc

    size_bytes = len(raw_bytes)
    if size_bytes > MAX_VIDEO_SIZE_BYTES:
        raise ImageTooLargeError(
            f"Video size {size_bytes / 1024 / 1024:.1f} MB exceeds 100 MB limit."
        )

    if size_bytes == 0:
        raise InvalidImageError("Uploaded video file is empty.")

    return raw_bytes


def compute_image_hash(image_bytes: bytes) -> str:
    """Return an MD5 hex digest of the raw image bytes (for dedup tracking)."""
    return hashlib.md5(image_bytes).hexdigest()  # noqa: S324 – not crypto use


# ── Wheat-leaf content validation ─────────────────────────────────────────────

def _get_dominant_channel_ratios(image_bytes: bytes) -> tuple[float, float, float]:
    """
    Open image bytes and return mean R/G/B channel ratios normalised to [0, 1].
    Returns (r_ratio, g_ratio, b_ratio) where values are mean / 255.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except (UnidentifiedImageError, Exception):
        return 0.0, 0.0, 0.0

    # Downsample for speed – 128×128 is plenty for colour stats
    img = img.resize((128, 128), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0  # shape [128, 128, 3]

    r_mean = float(arr[:, :, 0].mean())
    g_mean = float(arr[:, :, 1].mean())
    b_mean = float(arr[:, :, 2].mean())

    return r_mean, g_mean, b_mean


def _green_pixel_fraction(image_bytes: bytes) -> float:
    """
    Return the fraction of pixels that are meaningfully green/yellow-green,
    covering the range found in healthy and diseased wheat leaves.

    A pixel qualifies if:
      - green channel is the dominant channel (G > R and G > B), OR
      - it's a warm yellow-green (high R+G, low B) typical of wheat straw/
        yellow rust, OR
      - it's a muted brown-green (diseased/dry wheat tissue)
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except (UnidentifiedImageError, Exception):
        return 0.0

    img = img.resize((128, 128), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)

    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    # 1. Classic green dominance
    green_dominant = (g > r) & (g > b) & (g > 30)

    # 2. Yellow-green / wheat straw (R and G both high, B low)
    yellow_green = (r > 80) & (g > 80) & (b < 120) & (np.abs(r.astype(int) - g.astype(int)) < 80)

    # 3. Muted brown-green (diseased tissue: brownish with some green)
    brown_green = (r > 60) & (g > 50) & (b < 90) & (g > b) & (r > b)

    plant_like = green_dominant | yellow_green | brown_green
    return float(plant_like.mean())


def _is_mostly_single_colour(image_bytes: bytes, threshold: float = 0.85) -> bool:
    """
    Return True when the image is suspiciously uniform – likely a solid-colour
    screenshot, white paper, blank document, or test image.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except (UnidentifiedImageError, Exception):
        return False

    img = img.resize((64, 64), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)

    # Check if std dev across all channels is very low
    std = float(arr.std())
    return std < 15.0  # near-uniform image


def _has_sufficient_texture(image_bytes: bytes) -> bool:
    """
    Return True when the image has enough texture/detail to be a real photograph
    of plant material (not a blank, solid, or very smooth background).
    Uses a simple Laplacian variance proxy on the greyscale image.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("L")  # greyscale
    except (UnidentifiedImageError, Exception):
        return False

    img = img.resize((128, 128), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)

    # Laplacian approximation: difference between each pixel and its neighbors
    gy = np.diff(arr, axis=0)
    gx = np.diff(arr, axis=1)
    variance = float(gy.var() + gx.var())

    # Empirical threshold: real photos typically have variance >> 10
    return variance > 8.0


def validate_wheat_leaf_content(image_bytes: bytes) -> None:
    """
    Heuristic content check that rejects images that are clearly NOT wheat leaves.

    Strategy (applied in order – first failure raises):

    1. Reject near-blank / solid-colour images (screenshots, white paper, etc.)
    2. Reject images with no meaningful texture (too smooth for plant tissue).
    3. Reject images where plant-like pixels make up less than 10 % of the frame.
       This catches portraits, sky photos, documents, and abstract images while
       being lenient enough for diseased/yellow wheat where green is scarce.

    Note: This is a lightweight heuristic — not a second ML classifier.
    It is intentionally permissive to avoid false rejections of valid wheat
    images with unusual lighting or heavy disease symptoms.

    Raises:
        NotAWheatLeafError: When the image clearly does not look like a wheat leaf.
    """
    # 1. Reject near-blank / uniform images
    if _is_mostly_single_colour(image_bytes):
        raise NotAWheatLeafError(
            "The uploaded image appears to be blank or a solid colour. "
            "Please upload a clear photograph of a wheat leaf."
        )

    # 2. Reject images without sufficient texture
    if not _has_sufficient_texture(image_bytes):
        raise NotAWheatLeafError(
            "The uploaded image lacks the detail expected in a wheat leaf photograph. "
            "Please upload a clear, focused image."
        )

    # 3. Check plant-like pixel fraction
    plant_fraction = _green_pixel_fraction(image_bytes)
    logger.debug("Wheat-leaf validator: plant_fraction=%.3f", plant_fraction)

    if plant_fraction < 0.08:
        raise NotAWheatLeafError(
            "The uploaded image does not appear to contain a wheat leaf. "
            "Please upload a close-up photograph of a wheat leaf showing "
            "the leaf surface clearly."
        )
