"""
WheatGuard AI – Custom Exceptions
All domain-specific exceptions live here so HTTP error mapping is centralised.
"""

from __future__ import annotations


class WheatGuardBaseError(Exception):
    """Base class for all WheatGuard AI exceptions."""

    http_status: int = 500
    default_message: str = "An unexpected error occurred."

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)

    def __repr__(self) -> str:  # pragma: no cover
        return f"{self.__class__.__name__}({self.message!r})"


# ── Model errors ──────────────────────────────────────────────────────────────

class ModelNotLoadedError(WheatGuardBaseError):
    """Raised when inference is attempted before the model is loaded."""

    http_status = 503
    default_message = (
        "The AI model is not loaded. "
        "Please wait for the application to finish initialising."
    )


class ModelLoadError(WheatGuardBaseError):
    """Raised when the model file cannot be read or parsed."""

    http_status = 500
    default_message = "Failed to load the AI model from disk."


# ── Image / upload errors ─────────────────────────────────────────────────────

class InvalidImageError(WheatGuardBaseError):
    """Raised when an uploaded file cannot be opened as an image."""

    http_status = 422
    default_message = (
        "The uploaded file is not a valid image. "
        "Please upload a clear JPG, PNG, or WebP photograph."
    )


class UnsupportedImageError(WheatGuardBaseError):
    """Raised when the image type is not in the allowed list."""

    http_status = 415
    default_message = (
        "Unsupported image format. Allowed formats: JPG, JPEG, PNG, WebP."
    )


class ImageTooLargeError(WheatGuardBaseError):
    """Raised when the uploaded file exceeds the configured size limit."""

    http_status = 413
    default_message = "Uploaded image exceeds the maximum allowed file size."


class NotAWheatLeafError(WheatGuardBaseError):
    """Raised when the uploaded image does not appear to contain a wheat leaf."""

    http_status = 422
    default_message = (
        "The uploaded image does not appear to be a wheat leaf photograph. "
        "Please upload a clear, close-up image of a wheat leaf."
    )


# ── Prediction errors ─────────────────────────────────────────────────────────

class LowConfidenceError(WheatGuardBaseError):
    """
    Raised (or returned as a soft flag) when model confidence is below
    the configured threshold.
    """

    http_status = 200  # Not an error per se; the API returns a 200 with a flag
    default_message = (
        "Low confidence prediction. "
        "Please upload a clearer wheat-leaf image or consult an agricultural expert."
    )


class InferenceError(WheatGuardBaseError):
    """Raised when the model forward pass fails unexpectedly."""

    http_status = 500
    default_message = "An error occurred during AI inference."


# ── Database errors ───────────────────────────────────────────────────────────

class DatabaseError(WheatGuardBaseError):
    """Raised when a Supabase / database operation fails."""

    http_status = 503
    default_message = "A database error occurred. Please try again later."


class RecordNotFoundError(WheatGuardBaseError):
    """Raised when a requested database record does not exist."""

    http_status = 404
    default_message = "The requested record was not found."


# ── Dataset errors ────────────────────────────────────────────────────────────

class DatasetError(WheatGuardBaseError):
    """General dataset validation or loading error."""

    http_status = 500
    default_message = "A dataset error occurred."


class EmptyDatasetError(DatasetError):
    """Raised when a dataset directory is empty or has no valid images."""

    default_message = "The dataset directory is empty or contains no valid images."


class CorruptImageError(DatasetError):
    """Raised when a dataset image is corrupt and cannot be opened."""

    default_message = "A corrupt image was found in the dataset."
