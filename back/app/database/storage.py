"""
WheatGuard AI – Supabase Storage helper
Uploads wheat leaf images to a Supabase Storage bucket and returns the
public URL. All storage operations are non-fatal: if the upload fails the
prediction still succeeds, just without a stored image.

Bucket name: wheat-images
Access:      Public (read) — so the frontend can display the image via URL.

How to create the bucket in Supabase:
  1. Go to Storage → New bucket
  2. Name: wheat-images
  3. Public bucket: ✓ (enable public access)
  4. Click Create
"""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

from app.core.logging import get_logger
from app.database.database import get_supabase_client

logger = get_logger(__name__)

_BUCKET = "wheat-images"


def upload_image(image_bytes: bytes, filename: str) -> str | None:
    """
    Upload raw image bytes to Supabase Storage.
    Falls back to a Data URI if Supabase storage is unavailable.
    """
    try:
        client = get_supabase_client()

        ext = Path(filename).suffix.lower()
        content_type = {
            ".jpg":  "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png":  "image/png",
            ".webp": "image/webp",
        }.get(ext, "image/jpeg")

        storage_path = f"disease-media/images/{filename}"

        client.storage.from_(_BUCKET).upload(
            path=storage_path,
            file=image_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
        )

        result = client.storage.from_(_BUCKET).get_public_url(storage_path)
        url: str = result if isinstance(result, str) else result.get("publicUrl", "")

        if url:
            logger.info("Image uploaded to Storage: %s", url)
            return url

    except Exception as exc:
        logger.warning("Supabase image upload failed; using Data URI fallback: %s", exc)

    ext = Path(filename).suffix.lower().lstrip(".")
    mime = "image/jpeg" if ext in ("jpg", "jpeg") else (f"image/{ext}" if ext in ("png", "webp") else "image/jpeg")
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def upload_video(video_bytes: bytes, filename: str) -> str | None:
    """
    Upload raw video bytes to Supabase Storage.
    Falls back to a Data URI if Supabase storage is unavailable.
    """
    try:
        client = get_supabase_client()

        ext = Path(filename).suffix.lower()
        content_type = {
            ".mp4":  "video/mp4",
            ".webm": "video/webm",
            ".mov":  "video/quicktime",
        }.get(ext, "video/mp4")

        storage_path = f"disease-media/videos/{filename}"

        client.storage.from_(_BUCKET).upload(
            path=storage_path,
            file=video_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
        )

        result = client.storage.from_(_BUCKET).get_public_url(storage_path)
        url: str = result if isinstance(result, str) else result.get("publicUrl", "")

        if url:
            logger.info("Video uploaded to Storage: %s", url)
            return url

    except Exception as exc:
        logger.warning("Supabase video upload failed; using Data URI fallback: %s", exc)

    ext = Path(filename).suffix.lower().lstrip(".")
    mime = "video/mp4" if ext == "mp4" else ("video/webm" if ext == "webm" else "video/quicktime")
    encoded = base64.b64encode(video_bytes).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def delete_file_from_storage(file_url: str | None) -> bool:
    """
    Delete a file from Supabase Storage given its public URL.
    Returns True if deletion succeeded, False otherwise.
    """
    if not file_url:
        return False
    try:
        client = get_supabase_client()
        # Parse storage path from URL (e.g. .../wheat-images/disease-media/images/filename.jpg)
        if _BUCKET in file_url:
            path_part = file_url.split(f"/{_BUCKET}/")[-1]
            # Strip query params if any
            path_part = path_part.split("?")[0]
            # Remove from storage
            client.storage.from_(_BUCKET).remove([path_part])
            logger.info("Deleted file from Storage: %s", path_part)
            return True
    except Exception as exc:
        logger.warning("Failed to delete file from Storage: %s", exc)
    return False

