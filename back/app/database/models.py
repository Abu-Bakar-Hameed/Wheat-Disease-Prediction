"""
WheatGuard AI – Database Table Definitions (Supabase / PostgreSQL)

This module provides:
  1.  SQL DDL strings to create/migrate the required tables in Supabase.
  2.  Python dataclass representations of each row – used as typed return
      objects from CRUD functions so the rest of the app never sees raw dicts.

Run the SQL in ``CREATE_TABLES_SQL`` once inside Supabase's SQL Editor
(Dashboard → SQL Editor → New query → paste → Run).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# SQL DDL – paste into Supabase SQL Editor to initialise/migrate the schema
# ─────────────────────────────────────────────────────────────────────────────

CREATE_TABLES_SQL = """
-- ============================================================
-- WheatGuard AI – Database Schema v2
-- Run this in: Supabase Dashboard → SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── predictions table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions (
    id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename             TEXT         NOT NULL,
    predicted_class      TEXT         NOT NULL,
    confidence           FLOAT        NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    confidence_pct       FLOAT        NOT NULL,
    confidence_level     TEXT         NOT NULL DEFAULT 'Unknown',
    low_confidence       BOOLEAN      NOT NULL DEFAULT FALSE,
    severity             TEXT         NOT NULL DEFAULT 'unknown',
    top_predictions      JSONB        NOT NULL DEFAULT '[]',
    recommendation       TEXT,
    inference_time_ms    FLOAT,
    model_version        TEXT,
    image_hash           TEXT,
    image_url            TEXT,
    gradcam_available    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Gemini-generated PROBLEM / RECOMMENDATION / SOLUTION report, persisted
    -- so it doesn't have to be regenerated every time the record is viewed.
    ai_report            JSONB,

    -- Owner of this prediction (the Supabase auth user id / JWT 'sub' claim).
    -- Nullable so pre-migration rows don't break; every NEW prediction from
    -- the app going forward will always populate this.
    user_id              UUID
);

-- Add new columns to existing table if they don't exist yet (migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='severity') THEN
        ALTER TABLE predictions ADD COLUMN severity TEXT NOT NULL DEFAULT 'unknown';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='confidence_level') THEN
        ALTER TABLE predictions ADD COLUMN confidence_level TEXT NOT NULL DEFAULT 'Unknown';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='image_url') THEN
        ALTER TABLE predictions ADD COLUMN image_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='user_id') THEN
        ALTER TABLE predictions ADD COLUMN user_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='ai_report') THEN
        ALTER TABLE predictions ADD COLUMN ai_report JSONB;
    END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_predictions_created_at
    ON predictions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_predictions_user_id
    ON predictions (user_id);

CREATE INDEX IF NOT EXISTS idx_predictions_image_hash
    ON predictions (image_hash)
    WHERE image_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_predictions_class
    ON predictions (predicted_class);

CREATE INDEX IF NOT EXISTS idx_predictions_severity
    ON predictions (severity);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE predictions DISABLE ROW LEVEL SECURITY;

-- ── Summary view ─────────────────────────────────────────────
CREATE OR REPLACE VIEW prediction_class_summary AS
SELECT
    predicted_class,
    COUNT(*)                                  AS total,
    ROUND(AVG(confidence_pct)::numeric, 2)    AS avg_confidence_pct,
    ROUND(AVG(inference_time_ms)::numeric, 2) AS avg_inference_ms,
    MAX(created_at)                           AS last_seen
FROM predictions
GROUP BY predicted_class
ORDER BY total DESC;
"""


# ─────────────────────────────────────────────────────────────────────────────
# Python dataclass models (typed wrappers around raw Supabase dicts)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PredictionRecord:
    """
    Typed representation of a row in the ``predictions`` table.
    All fields map 1-to-1 to the DDL columns above.
    """

    id: str
    filename: str
    predicted_class: str
    confidence: float
    confidence_pct: float
    low_confidence: bool
    severity: str
    confidence_level: str
    top_predictions: list[dict[str, Any]]
    recommendation: str | None
    inference_time_ms: float | None
    model_version: str | None
    image_hash: str | None
    image_url: str | None
    gradcam_available: bool
    created_at: datetime
    ai_report: dict[str, Any] | None = None
    user_id: str | None = None

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_dict(cls, row: dict[str, Any]) -> "PredictionRecord":
        """
        Build a PredictionRecord from a raw Supabase response dict.
        Handles type coercion for fields that arrive as strings or raw JSON.
        """
        top_preds = row.get("top_predictions", [])
        if isinstance(top_preds, str):
            try:
                top_preds = json.loads(top_preds)
            except json.JSONDecodeError:
                top_preds = []

        created_raw = row.get("created_at", "")
        if isinstance(created_raw, str):
            created_at = datetime.fromisoformat(
                created_raw.replace("Z", "+00:00")
            )
        elif isinstance(created_raw, datetime):
            created_at = created_raw
        else:
            created_at = datetime.utcnow()

        return cls(
            id=str(row.get("id", "")),
            filename=str(row.get("filename", "")),
            predicted_class=str(row.get("predicted_class", "")),
            confidence=float(row.get("confidence", 0.0)),
            confidence_pct=float(row.get("confidence_pct", 0.0)),
            low_confidence=bool(row.get("low_confidence", False)),
            severity=str(row.get("severity") or "unknown"),
            confidence_level=str(row.get("confidence_level") or "Unknown"),
            top_predictions=top_preds,
            recommendation=row.get("recommendation"),
            inference_time_ms=row.get("inference_time_ms"),
            model_version=row.get("model_version"),
            image_hash=row.get("image_hash"),
            image_url=row.get("image_url"),  # None for older rows without the column
            gradcam_available=bool(row.get("gradcam_available", False)),
            created_at=created_at,
            ai_report=row.get("ai_report"),
            user_id=row.get("user_id"),
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialise the record to a plain dict (JSON-safe)."""
        return {
            "id": self.id,
            "filename": self.filename,
            "predicted_class": self.predicted_class,
            "confidence": self.confidence,
            "confidence_pct": self.confidence_pct,
            "low_confidence": self.low_confidence,
            "severity": self.severity,
            "confidence_level": self.confidence_level,
            "top_predictions": self.top_predictions,
            "recommendation": self.recommendation,
            "inference_time_ms": self.inference_time_ms,
            "model_version": self.model_version,
            "image_hash": self.image_hash,
            "image_url": self.image_url,
            "gradcam_available": self.gradcam_available,
            "created_at": self.created_at.isoformat(),
            "ai_report": self.ai_report,
            "user_id": self.user_id,
        }