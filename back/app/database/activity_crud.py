"""
WheatGuard AI – User-Activity CRUD (Supabase `user_activity`)

Central activity-event layer for the retention analytics feature.

Design rules:
  • Every write is BEST-EFFORT — recording an activity event must never
    break or slow the user-facing request that triggered it.
  • ``record_activity`` is the single write path; it validates nothing
    beyond basic presence, because server-side callers (auth service,
    prediction route) are trusted. The public HTTP endpoint in
    ``app/api/routes/activity.py`` is what enforces the client whitelist.
  • Reads are also best-effort: a missing table (migration not yet run)
    yields an empty list instead of an error.

Event types (see supabase/schema_activity.sql for the full contract):
  user_registered · user_login · user_logout · prediction_created ·
  calendar_opened · prediction_history_opened · prediction_viewed ·
  prediction_completed_viewed · notification_viewed · notification_clicked ·
  assistant_used · profile_viewed · settings_viewed
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from app.core.logging import get_logger
from app.database.database import get_supabase_client

logger = get_logger(__name__)

_TABLE = "user_activity"

# Event types the CLIENT is allowed to report through the public activity
# endpoint. Server-side events (user_registered / user_login / user_logout /
# prediction_created) are written by trusted services and are NOT accepted
# from the client — a user can never forge a login or prediction event.
CLIENT_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "calendar_opened",
        "prediction_history_opened",
        "prediction_viewed",
        "prediction_completed_viewed",
        "notification_viewed",
        "notification_clicked",
        "profile_viewed",
        "settings_viewed",
        "assistant_used",
    }
)

# Event types that count as MEANINGFUL ACTIVITY for retention computation
# (spec §6): login, make prediction, view prediction, open calendar, view
# history, view complete prediction, use notification functionality.
# NOTE: registration and logout are recorded but deliberately excluded —
# registering is not a "return", and logout is the end of an activity
# period rather than engagement.
MEANINGFUL_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "prediction_created",
        "user_login",
        "login",  # legacy alias
        "calendar_opened",
        "prediction_history_opened",
        "prediction_viewed",
        "prediction_completed_viewed",
        "assistant_used",
        "notification_viewed",
        "notification_clicked",
    }
)

# Legacy event-type aliases → canonical names.
_EVENT_ALIASES: dict[str, str] = {
    "login": "user_login",
    "logout": "user_logout",
    "signup": "user_registered",
    "history_viewed": "prediction_history_opened",  # pre-rename rows
}


def canonical_event_type(event_type: str) -> str:
    """Map legacy aliases to canonical event-type names."""
    evt = (event_type or "").strip().lower()
    return _EVENT_ALIASES.get(evt, evt)


# Schema-drift warnings would otherwise repeat on every request and flood the
# log; each distinct key is therefore warned once per process.
_WARNED_KEYS: set[str] = set()


def _warn_once(key: str, message: str) -> None:
    if key in _WARNED_KEYS:
        return
    _WARNED_KEYS.add(key)
    logger.warning(message)


def _is_missing_column(exc: Exception) -> bool:
    """True when PostgREST rejected a column that does not exist (code 42703)."""
    text = str(exc)
    return "42703" in text or ("column" in text and "does not exist" in text.lower())


def record_activity(
    user_id: str,
    event_type: str,
    prediction_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> bool:
    """
    Insert one activity row. Returns True on success.

    NEVER raises: any failure (missing table, network, RLS) is logged and
    swallowed so activity tracking can never break a user request.
    """
    if not user_id or not event_type:
        return False
    try:
        client = get_supabase_client()
        payload: dict[str, Any] = {
            "user_id": str(user_id),
            "event_type": canonical_event_type(event_type),
        }
        if prediction_id:
            payload["prediction_id"] = str(prediction_id)
        if metadata:
            payload["metadata"] = metadata
        try:
            client.table(_TABLE).insert(payload).execute()
            return True
        except Exception as exc:  # noqa: BLE001 - inspected below
            optional = [k for k in ("prediction_id", "metadata") if k in payload]
            if not optional or not _is_missing_column(exc):
                raise
            # Older deployments of user_activity may predate the optional
            # columns — record the base event instead of losing it entirely.
            base = {k: v for k, v in payload.items() if k not in optional}
            client.table(_TABLE).insert(base).execute()
            _warn_once(
                "record_activity:reduced-columns",
                "user_activity is missing optional column(s) "
                f"{', '.join(optional)} — events are recorded without them; "
                "run supabase/schema_activity.sql to add the columns.",
            )
            return True
    except Exception as exc:  # noqa: BLE001 - best-effort by design
        logger.warning(
            "record_activity failed (user=%s event=%s): %s", user_id, event_type, exc
        )
        return False


def fetch_activity_rows(
    *,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    user_ids: Optional[list[str]] = None,
    event_types: Optional[list[str]] = None,
    limit: Optional[int] = None,
    ascending: bool = True,
) -> list[dict]:
    """
    Read activity rows (best-effort — returns [] if the table is missing).

    Columns: id, user_id, event_type, prediction_id, metadata, created_at.
    Older deployments without prediction_id/metadata are supported through a
    reduced-column fallback.
    """
    def _apply(query):
        if start is not None:
            query = query.gte("created_at", start.isoformat())
        if end is not None:
            query = query.lte("created_at", end.isoformat())
        if user_ids is not None:
            query = query.in_("user_id", [str(u) for u in user_ids])
        if event_types is not None:
            query = query.in_("event_type", list(event_types))
        query = query.order("created_at", desc=not ascending)
        if limit is not None:
            query = query.limit(limit)
        return query

    try:
        client = get_supabase_client()
        try:
            resp = _apply(
                client.table(_TABLE).select(
                    "id,user_id,event_type,prediction_id,metadata,created_at"
                )
            ).execute()
        except Exception as exc:  # noqa: BLE001 - inspected below
            if not _is_missing_column(exc):
                raise
            # Older deployments of user_activity lack these columns.
            resp = _apply(
                client.table(_TABLE).select("id,user_id,event_type,created_at")
            ).execute()
            _warn_once(
                "fetch_activity_rows:reduced-columns",
                "user_activity is missing prediction_id/metadata — reading "
                "reduced columns; run supabase/schema_activity.sql to add them.",
            )
        return resp.data or []
    except Exception as exc:  # noqa: BLE001 - best-effort by design
        flavor = (
            "42703" if "42703" in str(exc)
            else "PGRST205" if "PGRST205" in str(exc)
            else "other"
        )
        _warn_once(
            f"fetch_activity_rows:failed:{flavor}",
            f"fetch_activity_rows failed: {exc}",
        )
        return []
