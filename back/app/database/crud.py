"""
WheatGuard AI – CRUD Operations (Supabase)
All database reads and writes go through these functions.
No raw Supabase calls should appear outside this module.

NOTE: The Supabase schema may not have the 'severity' and 'confidence_level'
columns yet if the migration in supabase/schema.sql has not been run.
All functions in this module are written to work correctly whether or not
those columns exist, by deriving severity from predicted_class when needed.
"""

from __future__ import annotations

import math
import secrets
from datetime import datetime, timezone
from typing import Any

from app.core.exceptions import DatabaseError, RecordNotFoundError
from app.core.logging import get_logger
from app.database.database import get_supabase_client
from app.database.models import PredictionRecord

logger = get_logger(__name__)

_TABLE = "predictions"

# Severity lookup used when the 'severity' column doesn't exist in the DB yet
_SEVERITY_FROM_CLASS: dict[str, str] = {
    "healthy": "none",
    "leaf rust": "high", "leaf_rust": "high", "brown rust": "high", "brown_rust": "high",
    "yellow rust": "high", "yellow_rust": "high",
    "stem rust": "critical", "stem_rust": "critical",
    "powdery mildew": "moderate", "powdery_mildew": "moderate",
    "septoria leaf blotch": "high", "septoria_leaf_blotch": "high",
    "fusarium head blight": "critical", "fusarium_head_blight": "critical",
    "tan spot": "moderate", "tan_spot": "moderate",
}


def _derive_severity(cls: str) -> str:
    """Derive severity from class name (used for pre-migration rows)."""
    return _SEVERITY_FROM_CLASS.get(cls.lower().strip(), "unknown")


# ── Capability detection ──────────────────────────────────────────────────────

_severity_col_exists: bool | None = None  # cached after first check


def _check_severity_column() -> bool:
    """Check whether the severity column exists in Supabase. Caches result."""
    global _severity_col_exists
    if _severity_col_exists is not None:
        return _severity_col_exists
    try:
        client = get_supabase_client()
        client.table(_TABLE).select("severity").limit(1).execute()
        _severity_col_exists = True
    except Exception:
        _severity_col_exists = False
    return _severity_col_exists


_image_url_col_exists: bool | None = None


def _check_image_url_column() -> bool:
    """Check whether the image_url column exists in Supabase. Caches result."""
    global _image_url_col_exists
    if _image_url_col_exists is not None:
        return _image_url_col_exists
    try:
        client = get_supabase_client()
        client.table(_TABLE).select("image_url").limit(1).execute()
        _image_url_col_exists = True
    except Exception:
        _image_url_col_exists = False
    return _image_url_col_exists


_ai_report_col_exists: bool | None = None


def _check_ai_report_column() -> bool:
    """Check whether the ai_report column exists in Supabase. Caches result."""
    global _ai_report_col_exists
    if _ai_report_col_exists is not None:
        return _ai_report_col_exists
    try:
        client = get_supabase_client()
        client.table(_TABLE).select("ai_report").limit(1).execute()
        _ai_report_col_exists = True
    except Exception:
        _ai_report_col_exists = False
    return _ai_report_col_exists


_user_id_col_exists: bool | None = None


def _check_user_id_column() -> bool:
    """
    Check whether the user_id column exists in Supabase. Caches result.

    This column is what makes per-user data isolation possible at all.
    If it's missing (migration not yet run), every function below logs a
    CRITICAL warning and falls back to returning/deleting UNFILTERED,
    cross-user data rather than crashing — but this must be treated as
    a "run the migration now" alarm, not normal behaviour.
    """
    global _user_id_col_exists
    if _user_id_col_exists is not None:
        return _user_id_col_exists
    try:
        client = get_supabase_client()
        client.table(_TABLE).select("user_id").limit(1).execute()
        _user_id_col_exists = True
    except Exception:
        _user_id_col_exists = False
    return _user_id_col_exists


# ── Create ────────────────────────────────────────────────────────────────────

def create_prediction(payload: dict[str, Any]) -> PredictionRecord:
    """
    Insert a new prediction row and return the created record.

    If the 'severity' / 'confidence_level' columns don't exist yet, they are
    stripped from the payload so the insert still succeeds.
    """
    try:
        client = get_supabase_client()

        insert_payload = dict(payload)
        if not _check_severity_column():
            insert_payload.pop("severity", None)
            insert_payload.pop("confidence_level", None)
        # Drop image_url if column doesn't exist yet in DB
        if not _check_image_url_column():
            insert_payload.pop("image_url", None)
        if not _check_ai_report_column():
            insert_payload.pop("ai_report", None)
        if not _check_user_id_column():
            logger.critical(
                "user_id column missing on 'predictions' table — this "
                "prediction will NOT be attributed to any user. Run the "
                "migration in supabase/schema.sql immediately."
            )
            insert_payload.pop("user_id", None)

        response = client.table(_TABLE).insert(insert_payload).execute()
        if not response.data:
            raise DatabaseError("Insert returned no data.")
        record = PredictionRecord.from_dict(response.data[0])
        logger.info(
            "Prediction saved: id=%s class=%s severity=%s confidence=%.2f%%",
            record.id,
            record.predicted_class,
            record.severity,
            record.confidence_pct,
        )
        return record
    except DatabaseError:
        raise
    except Exception as exc:
        logger.error("create_prediction failed: %s", exc, exc_info=True)
        raise DatabaseError(f"Failed to save prediction: {exc}") from exc


def update_prediction_ai_report(prediction_id: str, ai_report: dict[str, Any]) -> PredictionRecord:
    """Update the ai_report JSONB column for an existing prediction."""
    if not _check_ai_report_column():
        logger.warning("ai_report column not in DB – skipping update for id=%s", prediction_id)
        return get_prediction_by_id(prediction_id)
    try:
        client = get_supabase_client()
        response = (
            client.table(_TABLE)
            .update({"ai_report": ai_report})
            .eq("id", prediction_id)
            .execute()
        )
        if not response.data:
            raise RecordNotFoundError(f"Prediction {prediction_id} not found.")
        return PredictionRecord.from_dict(response.data[0])
    except RecordNotFoundError:
        raise
    except Exception as exc:
        logger.error("update_prediction_ai_report failed: %s", exc, exc_info=True)
        raise DatabaseError(f"Failed to update ai_report: {exc}") from exc


# ── Read ──────────────────────────────────────────────────────────────────────

def get_prediction_by_id(prediction_id: str, user_id: str | None = None) -> PredictionRecord:
    """
    Fetch a single prediction row by its UUID.

    Filtering by user_id here (not just id) means one user can never view
    another user's prediction by guessing/sharing a UUID — an unowned or
    someone-else's record simply raises RecordNotFoundError, same as if
    it didn't exist.

    Pass user_id=None (the admin routes do this) to intentionally fetch
    across all users, e.g. for the admin panel.
    """
    try:
        client = get_supabase_client()
        query = client.table(_TABLE).select("*").eq("id", prediction_id)
        if user_id is None:
            pass
        elif _check_user_id_column():
            query = query.eq("user_id", user_id)
        else:
            logger.critical(
                "user_id column missing on 'predictions' table — "
                "get_prediction_by_id is returning results WITHOUT "
                "per-user isolation. Run the migration in "
                "supabase/schema.sql immediately."
            )
        response = query.limit(1).execute()
        if not response.data:
            raise RecordNotFoundError(
                f"Prediction with id '{prediction_id}' not found."
            )
        row = response.data[0]
        if "severity" not in row or not row.get("severity"):
            row["severity"] = _derive_severity(row.get("predicted_class", ""))
        return PredictionRecord.from_dict(row)
    except (RecordNotFoundError, DatabaseError):
        raise
    except Exception as exc:
        logger.error("get_prediction_by_id failed: %s", exc, exc_info=True)
        raise DatabaseError(f"Failed to fetch prediction '{prediction_id}': {exc}") from exc


# ── Public share tokens ──────────────────────────────────────────────────────
#
# Require the migration in supabase/schema_share.sql (share_token,
# share_enabled, share_created_at, share_updated_at columns).

_SHARE_TOKEN_BYTES = 16  # → 22-char URL-safe token, ~122 bits of entropy


def _share_migration_hint(exc: Exception) -> DatabaseError:
    """Wrap a missing-column failure with an actionable migration hint."""
    return DatabaseError(
        "Sharing columns are missing on 'predictions'. "
        "Apply supabase/schema_share.sql in the Supabase SQL Editor. "
        f"Underlying error: {exc}"
    )


def _utcnow_iso() -> str:
    # Explicit ISO string — never send a "now()" literal through PostgREST.
    return datetime.now(timezone.utc).isoformat()


def get_share_status(prediction_id: str, user_id: str) -> dict[str, Any]:
    """Return {share_token, share_enabled} for the caller's own prediction."""
    try:
        client = get_supabase_client()
        response = (
            client.table(_TABLE)
            .select("id, share_token, share_enabled")
            .eq("id", prediction_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("get_share_status failed: %s", exc, exc_info=True)
        raise _share_migration_hint(exc) from exc
    if not response.data:
        raise RecordNotFoundError(
            f"Prediction with id '{prediction_id}' not found."
        )
    return response.data[0]


def enable_prediction_share(prediction_id: str, user_id: str) -> dict[str, Any]:
    """
    Generate (or re-activate) the owner's public share link.

    Idempotent: an existing token is reused so already-distributed links
    keep working; the token itself is a cryptographically random value
    completely unrelated to the row UUID.
    """
    status_row = get_share_status(prediction_id, user_id)
    token = status_row.get("share_token")

    client = get_supabase_client()
    now = _utcnow_iso()

    if token:
        update: dict[str, Any] = {"share_enabled": True, "share_updated_at": now}
    else:
        # Collisions are astronomically unlikely, but the partial unique
        # index makes a duplicate impossible — verify before writing.
        for _ in range(3):
            candidate = secrets.token_urlsafe(_SHARE_TOKEN_BYTES)
            clash = (
                client.table(_TABLE)
                .select("id")
                .eq("share_token", candidate)
                .limit(1)
                .execute()
            )
            if not clash.data:
                token = candidate
                break
        else:
            raise DatabaseError("Could not generate a unique share token.")
        update = {
            "share_token": token,
            "share_enabled": True,
            "share_created_at": now,
            "share_updated_at": now,
        }

    try:
        client.table(_TABLE).update(update).eq("id", prediction_id).eq(
            "user_id", user_id
        ).execute()
    except Exception as exc:
        logger.error("enable_prediction_share failed: %s", exc, exc_info=True)
        raise _share_migration_hint(exc) from exc

    logger.info("Share link enabled for prediction=%s by user=%s", prediction_id, user_id)
    return {"share_token": token, "share_enabled": True}


def disable_prediction_share(prediction_id: str, user_id: str) -> dict[str, Any]:
    """Turn the public link off; the token is kept so the owner can
    re-enable the SAME link later (opening share again re-activates it)."""
    get_share_status(prediction_id, user_id)  # ownership check / 404
    try:
        client = get_supabase_client()
        client.table(_TABLE).update(
            {"share_enabled": False, "share_updated_at": _utcnow_iso()}
        ).eq("id", prediction_id).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.error("disable_prediction_share failed: %s", exc, exc_info=True)
        raise _share_migration_hint(exc) from exc
    return {"share_enabled": False}


def list_shared_predictions(user_id: str, limit: int = 100) -> list[dict[str, Any]]:
    """Return the caller's predictions that currently have sharing turned on.

    Powers Settings -> Privacy & Data 'Manage shared reports'. Scoped to the
    calling user; only whitelisted, owner-safe columns are selected so the
    listing never leaks another field. Degrades gracefully if the share
    columns are absent (pre-migration) by returning an empty list.
    """
    limit = min(max(1, limit), 100)
    try:
        client = get_supabase_client()
        response = (
            client.table(_TABLE)
            .select("id, predicted_class, confidence_pct, created_at, share_token")
            .eq("user_id", user_id)
            .eq("share_enabled", True)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        # Missing share/user columns or an empty table: treat as 'nothing shared'
        # rather than failing the settings page.
        logger.info("list_shared_predictions returned empty for user=%s: %s", user_id, exc)
        return []
    return response.data or []


def get_prediction_by_share_token(share_token: str) -> tuple[PredictionRecord, bool]:
    """
    Resolve a public share token → (record, share_enabled).

    Raises RecordNotFoundError when no prediction carries this token
    (unknown, or deleted along with its row — share links die with the
    prediction automatically).
    """
    try:
        client = get_supabase_client()
        response = (
            client.table(_TABLE)
            .select("*")
            .eq("share_token", share_token)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("get_prediction_by_share_token failed: %s", exc, exc_info=True)
        raise _share_migration_hint(exc) from exc
    if not response.data:
        raise RecordNotFoundError("Shared prediction not found.")
    row = response.data[0]
    if "severity" not in row or not row.get("severity"):
        row["severity"] = _derive_severity(row.get("predicted_class", ""))
    record = PredictionRecord.from_dict(row)
    return record, bool(row.get("share_enabled"))


def get_recent_predictions(
    user_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
    disease: str | None = None,
    severity: str | None = None,
    search: str | None = None,
    sort: str = "newest",
) -> tuple[list[PredictionRecord], int]:
    """
    Fetch predictions with optional filtering, searching, and sorting.

    Pass a user_id to scope results to that one user (normal user-facing
    routes). Pass user_id=None (the admin routes do this) to intentionally
    fetch across all users, e.g. for the admin dashboard/prediction log.
    """
    limit = min(limit, 100)
    severity_col = _check_severity_column()
    user_id_col = _check_user_id_column()
    if user_id is not None and not user_id_col:
        logger.critical(
            "user_id column missing on 'predictions' table — "
            "get_recent_predictions is returning UNFILTERED, "
            "cross-user results. Run the migration in "
            "supabase/schema.sql immediately."
        )

    try:
        client = get_supabase_client()
        query = client.table(_TABLE).select("*", count="exact")

        if user_id is not None and user_id_col:
            query = query.eq("user_id", user_id)
        if disease:
            query = query.eq("predicted_class", disease)
        if severity and severity_col:
            query = query.eq("severity", severity.lower())
        if search:
            query = query.ilike("predicted_class", f"%{search}%")

        if sort == "oldest":
            query = query.order("created_at", desc=False)
        elif sort == "highest_confidence":
            query = query.order("confidence_pct", desc=True)
        elif sort == "lowest_confidence":
            query = query.order("confidence_pct", desc=False)
        else:
            query = query.order("created_at", desc=True)

        response = query.range(offset, offset + limit - 1).execute()
        rows = response.data or []

        for row in rows:
            if "severity" not in row or not row.get("severity") or row.get("severity") == "unknown":
                row["severity"] = _derive_severity(row.get("predicted_class", ""))

        records = [PredictionRecord.from_dict(row) for row in rows]
        total = response.count or len(records)

        if severity and not severity_col:
            records = [r for r in records if r.severity.lower() == severity.lower()]
            total = len(records)

        logger.debug("Fetched %d/%d predictions (limit=%d offset=%d)", len(records), total, limit, offset)
        return records, total
    except Exception as exc:
        logger.error("get_recent_predictions failed: %s", exc, exc_info=True)
        raise DatabaseError(f"Failed to fetch prediction history: {exc}") from exc


def get_prediction_stats(user_id: str | None = None) -> dict[str, Any]:
    """
    Return comprehensive aggregate statistics.

    Pass a user_id to scope stats to that one user. Pass user_id=None
    (the admin routes do this) to intentionally aggregate across all
    users for the admin dashboard/KPIs.
    """
    try:
        client = get_supabase_client()
        severity_col = _check_severity_column()
        user_id_col = _check_user_id_column()
        if user_id is not None and not user_id_col:
            logger.critical(
                "user_id column missing on 'predictions' table — "
                "get_prediction_stats is returning UNFILTERED, "
                "cross-user statistics. Run the migration in "
                "supabase/schema.sql immediately."
            )

        select_cols = "confidence_pct, predicted_class"
        if severity_col:
            select_cols += ", severity"

        query = client.table(_TABLE).select(select_cols, count="exact")
        if user_id is not None and user_id_col:
            query = query.eq("user_id", user_id)
        count_resp = query.execute()
        total = count_resp.count or 0
        rows = count_resp.data or []

        class_dist: dict[str, int] = {}
        severity_dist: dict[str, int] = {}
        healthy = 0
        critical = 0
        total_confidence = 0.0

        for row in rows:
            cls = row.get("predicted_class", "unknown")
            conf = float(row.get("confidence_pct", 0.0))

            if severity_col and row.get("severity") and row["severity"] not in ("unknown", ""):
                sev = str(row["severity"]).lower()
            else:
                sev = _derive_severity(cls)

            class_dist[cls] = class_dist.get(cls, 0) + 1
            sev_key = sev.capitalize() if sev not in ("none",) else "None"
            severity_dist[sev_key] = severity_dist.get(sev_key, 0) + 1

            if cls.lower() == "healthy" or sev == "none":
                healthy += 1
            if sev == "critical":
                critical += 1
            total_confidence += conf

        diseased = total - healthy
        avg_confidence = round(total_confidence / total, 2) if total > 0 else 0.0
        most_common = max(class_dist, key=lambda k: class_dist[k]) if class_dist else None

        return {
            "total_predictions": total,
            "healthy_predictions": healthy,
            "diseased_predictions": max(0, diseased),
            "critical_cases": critical,
            "average_confidence": avg_confidence,
            "most_common_disease": most_common,
            "class_distribution": dict(sorted(class_dist.items(), key=lambda x: x[1], reverse=True)),
            "severity_distribution": severity_dist,
        }
    except Exception as exc:
        logger.error("get_prediction_stats failed: %s", exc, exc_info=True)
        raise DatabaseError(f"Failed to fetch prediction statistics: {exc}") from exc


def get_predictions_over_time(user_id: str, days: int = 30) -> list[dict[str, Any]]:
    """Return daily prediction counts for the last N days — scoped to one user."""
    try:
        import datetime as dt
        from datetime import timedelta, timezone

        client = get_supabase_client()
        since = (dt.datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        user_id_col = _check_user_id_column()
        if not user_id_col:
            logger.critical(
                "user_id column missing on 'predictions' table — "
                "get_predictions_over_time is returning UNFILTERED, "
                "cross-user results. Run the migration in "
                "supabase/schema.sql immediately."
            )

        query = client.table(_TABLE).select("created_at").gte("created_at", since)
        if user_id_col:
            query = query.eq("user_id", user_id)
        response = query.order("created_at", desc=False).execute()

        date_counts: dict[str, int] = {}
        for row in response.data or []:
            raw = row.get("created_at", "")
            try:
                date_str = str(raw)[:10]
                date_counts[date_str] = date_counts.get(date_str, 0) + 1
            except Exception:
                pass

        return [{"date": d, "count": c} for d, c in sorted(date_counts.items())]
    except Exception as exc:
        logger.error("get_predictions_over_time failed: %s", exc, exc_info=True)
        raise DatabaseError(f"Failed to fetch time-series data: {exc}") from exc


def get_trends(range_key: str, user_id: str) -> dict[str, Any]:
    """
    Return aggregated trend data for the given time range — scoped to one user.

    Args:
        range_key: '7d' | '30d' | '90d' | 'all'
        user_id: the requesting user's id — results never include another
            user's predictions.

    Returns full stats + daily_predictions + confidence_trend,
    all filtered to the requested date range.
    """
    import datetime as dt
    from datetime import timedelta, timezone

    try:
        client = get_supabase_client()
        severity_col = _check_severity_column()
        user_id_col = _check_user_id_column()
        if not user_id_col:
            logger.critical(
                "user_id column missing on 'predictions' table — "
                "get_trends is returning UNFILTERED, cross-user results. "
                "Run the migration in supabase/schema.sql immediately."
            )
        now = dt.datetime.now(timezone.utc)

        # ── Date filter ───────────────────────────────────────────────────────
        since: str | None = None
        if range_key == "7d":
            since = (now - timedelta(days=7)).isoformat()
        elif range_key == "30d":
            since = (now - timedelta(days=30)).isoformat()
        elif range_key == "90d":
            since = (now - timedelta(days=90)).isoformat()
        # "all" → no date filter

        # ── Fetch minimal columns ─────────────────────────────────────────────
        select_cols = "confidence_pct, predicted_class, created_at"
        if severity_col:
            select_cols += ", severity"

        query = client.table(_TABLE).select(select_cols, count="exact")
        if user_id_col:
            query = query.eq("user_id", user_id)
        if since:
            query = query.gte("created_at", since)
        query = query.order("created_at", desc=False)
        response = query.execute()

        total = response.count or 0
        rows = response.data or []

        # ── Aggregate ─────────────────────────────────────────────────────────
        class_dist: dict[str, int] = {}
        severity_dist: dict[str, int] = {}
        date_counts: dict[str, int] = {}
        date_confidence_sum: dict[str, float] = {}
        date_confidence_count: dict[str, int] = {}

        healthy = 0
        critical = 0
        high_sev = 0
        moderate_sev = 0
        total_confidence = 0.0
        max_conf = 0.0
        min_conf = 100.0

        for row in rows:
            cls = row.get("predicted_class", "unknown")
            conf = float(row.get("confidence_pct", 0.0))
            raw_date = str(row.get("created_at", ""))[:10]

            if severity_col and row.get("severity") and row["severity"] not in ("unknown", ""):
                sev = str(row["severity"]).lower()
            else:
                sev = _derive_severity(cls)

            # class distribution
            class_dist[cls] = class_dist.get(cls, 0) + 1

            # severity distribution
            sev_key = sev.capitalize() if sev != "none" else "None"
            severity_dist[sev_key] = severity_dist.get(sev_key, 0) + 1

            # health counts
            if cls.lower() == "healthy" or sev == "none":
                healthy += 1
            if sev == "critical":
                critical += 1
            if sev == "high":
                high_sev += 1
            if sev == "moderate":
                moderate_sev += 1

            # confidence
            total_confidence += conf
            if conf > max_conf:
                max_conf = conf
            if conf < min_conf:
                min_conf = conf

            # daily counts
            date_counts[raw_date] = date_counts.get(raw_date, 0) + 1
            date_confidence_sum[raw_date] = date_confidence_sum.get(raw_date, 0.0) + conf
            date_confidence_count[raw_date] = date_confidence_count.get(raw_date, 0) + 1

        diseased = total - healthy
        avg_confidence = round(total_confidence / total, 2) if total > 0 else 0.0
        most_common = max(class_dist, key=lambda k: class_dist[k]) if class_dist else None

        # ── Daily prediction time series ──────────────────────────────────────
        daily_predictions = [
            {"date": d, "count": c}
            for d, c in sorted(date_counts.items())
        ]

        # ── Daily confidence trend ────────────────────────────────────────────
        confidence_trend = [
            {
                "date": d,
                "avg_confidence": round(date_confidence_sum[d] / date_confidence_count[d], 2),
                "count": date_confidence_count[d],
            }
            for d in sorted(date_confidence_sum.keys())
        ]

        return {
            "range": range_key,
            "total_predictions": total,
            "healthy_predictions": healthy,
            "diseased_predictions": max(0, diseased),
            "critical_cases": critical,
            "high_cases": high_sev,
            "moderate_cases": moderate_sev,
            "average_confidence": avg_confidence,
            "max_confidence": round(max_conf, 2) if total > 0 else 0.0,
            "min_confidence": round(min_conf, 2) if total > 0 else 0.0,
            "most_common_disease": most_common,
            "disease_distribution": dict(
                sorted(class_dist.items(), key=lambda x: x[1], reverse=True)
            ),
            "severity_distribution": severity_dist,
            "daily_predictions": daily_predictions,
            "confidence_trend": confidence_trend,
        }
    except Exception as exc:
        logger.error("get_trends failed: %s", exc, exc_info=True)
        raise DatabaseError(f"Failed to fetch trends data: {exc}") from exc


# ── Delete ────────────────────────────────────────────────────────────────────

def delete_prediction(prediction_id: str, user_id: str | None = None) -> bool:
    """
    Delete a single prediction row by its UUID.

    A user can never delete another user's prediction, even by guessing
    a valid UUID — the row simply won't match the user_id filter and the
    delete affects zero rows (returns False, same as "not found").

    Pass user_id=None (the admin routes do this) to intentionally allow
    deleting any user's prediction, e.g. from the admin panel.
    """
    try:
        client = get_supabase_client()
        query = client.table(_TABLE).delete().eq("id", prediction_id)
        if user_id is None:
            pass
        elif _check_user_id_column():
            query = query.eq("user_id", user_id)
        else:
            logger.critical(
                "user_id column missing on 'predictions' table — "
                "delete_prediction is NOT scoped to the owning user. "
                "Run the migration in supabase/schema.sql immediately."
            )
        response = query.execute()
        deleted = bool(response.data)
        if deleted:
            logger.info("Prediction deleted: id=%s", prediction_id)
        else:
            logger.warning("Delete requested for non-existent id=%s", prediction_id)
        return deleted
    except Exception as exc:
        logger.error("delete_prediction failed: %s", exc, exc_info=True)
        raise DatabaseError(f"Failed to delete prediction '{prediction_id}': {exc}") from exc