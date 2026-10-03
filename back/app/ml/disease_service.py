"""
WheatGuard AI – Disease Information Service
Loads disease_info.json once and provides query helpers used by the
prediction API to attach agronomic context to model outputs.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Sentinel key for unknown/uncertain predictions
_UNKNOWN_KEY = "_unknown"


@lru_cache(maxsize=1)
def _load_disease_db(path: str) -> dict[str, Any]:
    """
    Load and cache the disease information JSON file.

    The ``path`` argument is a plain string (not Path) so lru_cache can hash it.

    Returns:
        Dictionary mapping class name → disease metadata dict.
    """
    p = Path(path)
    if not p.exists():
        logger.warning(
            "disease_info.json not found at '%s'. "
            "Disease information will not be available.",
            path,
        )
        return {}
    with open(p, encoding="utf-8") as fh:
        data: dict[str, Any] = json.load(fh)
    # Strip internal comment key
    data.pop("_comment", None)
    logger.info("Loaded disease info for %d classes from %s", len(data), path)
    return data


def get_disease_info(class_name: str) -> dict[str, Any]:
    """
    Return the disease metadata for a given class name.

    Performs a case-insensitive, normalised lookup (replaces spaces and hyphens
    with underscores) so minor naming mismatches between dataset folders and
    the JSON keys are handled gracefully.

    Args:
        class_name: The predicted class name string.

    Returns:
        Disease info dictionary.  Falls back to the ``_unknown`` entry if the
        class is not found in the database.
    """
    db = _load_disease_db(str(settings.disease_info_path))
    if not db:
        return _fallback_entry(class_name)

    # Exact match first
    if class_name in db:
        return db[class_name]

    # Normalised match
    normalised = class_name.replace(" ", "_").replace("-", "_")
    for key, value in db.items():
        if key.replace(" ", "_").replace("-", "_").lower() == normalised.lower():
            return value  # type: ignore[return-value]

    logger.warning(
        "Class '%s' not found in disease_info.json. Using unknown fallback.",
        class_name,
    )
    return db.get(_UNKNOWN_KEY, _fallback_entry(class_name))


def get_recommendation(class_name: str, low_confidence: bool = False) -> str:
    """
    Build a concise recommendation string for the API response.

    Args:
        class_name:     Predicted class name.
        low_confidence: When True, prepends a low-confidence warning.

    Returns:
        Human-readable recommendation string.
    """
    info = get_disease_info(class_name)
    management: list[str] = info.get("management", [])
    disclaimer: str = info.get(
        "disclaimer",
        "Consult an agricultural expert for confirmation.",
    )

    parts: list[str] = []

    if low_confidence:
        parts.append(
            "⚠️ Low confidence prediction. "
            "Please upload a clearer wheat-leaf image."
        )

    if management:
        parts.append(management[0])  # Lead with the most actionable item

    parts.append(disclaimer)

    return " | ".join(parts)


def get_all_diseases() -> dict[str, Any]:
    """
    Return the complete disease database dict (excluding _unknown sentinel).
    Used by the /api/v1/diseases endpoint.
    """
    db = _load_disease_db(str(settings.disease_info_path))
    return {k: v for k, v in db.items() if not k.startswith("_")}


def list_all_diseases() -> list[dict[str, Any]]:
    """
    Return a summary list of all diseases in the database.

    Useful for building 'supported classes' documentation.
    """
    db = _load_disease_db(str(settings.disease_info_path))
    results = []
    for key, info in db.items():
        if key.startswith("_"):
            continue
        results.append(
            {
                "key": key,
                "display_name": info.get("display_name", key),
                "severity": info.get("severity", "unknown"),
                "risk_level": info.get("risk_level", "unknown"),
            }
        )
    return results


# ── Internal helpers ──────────────────────────────────────────────────────────

def _fallback_entry(class_name: str) -> dict[str, Any]:
    """Minimal fallback when the disease DB is empty or key is missing."""
    return {
        "display_name": class_name,
        "description": "No additional information is available for this class.",
        "symptoms": [],
        "prevention": [],
        "management": ["Consult a local agricultural extension officer for treatment recommendations."],
        "severity": "unknown",
        "risk_level": "unknown",
        "disclaimer": (
            "This is an AI Prediction. "
            "Consult an agricultural expert for confirmation."
        ),
    }
