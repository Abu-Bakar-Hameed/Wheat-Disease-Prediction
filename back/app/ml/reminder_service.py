"""
WheatGuard AI – Reminder Dispatch Service
Decides which calendar reminders have come due and delivers their notification.

Design (mirrors alert_service.py on purpose):
  * This service never raises. A reminder that fails to dispatch simply stays
    undispatched for the next sweep — it must never break the calendar page or
    the scheduler loop.
  * Idempotency lives in the `notified_at` column: once a reminder is stamped it
    is never re-dispatched, so the in-process loop and the "on-open" sweep can
    both run without ever producing duplicate notifications.
  * The actual delivery (in-app bell row + SMTP) is handed to the auth backend
    over POST /api/internal/reminder-alert, guarded by the shared internal
    secret — the same trust boundary the disease alerts already use. This module
    only ever ships data that exists server-side.

Recurrence is NOT handled here: a repeating reminder advances only when the user
completes it (see calendar.py), so there are never infinite pre-generated rows.
"""

from __future__ import annotations

import asyncio
import time
from datetime import date as _date, datetime, time as _time, timedelta
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.database.database import get_supabase_client
from app.ml.alert_service import resolve_recipient

logger = get_logger(__name__)

_REMINDERS_TABLE = "calendar_reminders"

# Default time-of-day when a reminder has no explicit reminder_time set.
_DEFAULT_TIME = _time(9, 0)

# A reminder is only considered "due and dispatchable" within this window so the
# sweep query stays bounded and cheap even with a large history.
_LOOKBACK_DAYS = 8
_LOOKAHEAD_DAYS = 1

# Until back/supabase/schema_reminders.sql is applied the reminder columns
# (status, notified_at, …) do not exist and the sweep query fails with PostgREST
# error 42703. Dispatch cannot be made idempotent without notified_at, so the
# scheduler stays dormant in that state and logs an actionable hint at most once
# every _SCHEMA_WARN_INTERVAL seconds instead of flooding the log every tick.
_SCHEMA_WARN_INTERVAL = 1800  # 30 minutes
_last_schema_warn = -float("inf")


def _is_missing_schema_error(exc: Exception) -> bool:
    """True when a query failed because the reminder columns/table are absent."""
    text = str(exc).lower()
    return "42703" in text or "does not exist" in text


def _warn_schema_not_ready() -> None:
    """Throttled, actionable warning for the pre-migration state."""
    global _last_schema_warn
    now = time.monotonic()
    if now - _last_schema_warn >= _SCHEMA_WARN_INTERVAL:
        _last_schema_warn = now
        logger.warning(
            "Reminder scheduler dormant: calendar_reminders is missing the "
            "reminder columns (status/notified_at). Run "
            "back/supabase/schema_reminders.sql in the Supabase SQL Editor to "
            "enable automatic reminder notifications. This hint repeats at most "
            "every %d minutes.",
            _SCHEMA_WARN_INTERVAL // 60,
        )


# ── Due-time maths ─────────────────────────────────────────────────────────────

def _parse_date(raw: Any) -> Optional[_date]:
    try:
        return _date.fromisoformat(str(raw)[:10])
    except Exception:
        return None


def _parse_time(raw: Any) -> _time:
    if not raw:
        return _DEFAULT_TIME
    try:
        parts = str(raw).split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        return _time(hour=min(23, max(0, hour)), minute=min(59, max(0, minute)))
    except Exception:
        return _DEFAULT_TIME


def compute_due(row: dict[str, Any]) -> Optional[datetime]:
    """Return the moment a reminder should fire (naive, server-local).

    due = (date + reminder_time) - notification_offset minutes. A missing time
    defaults to 09:00; a missing/None offset is treated as 0 (fire at due).
    Returns None if the date cannot be parsed.
    """
    d = _parse_date(row.get("date"))
    if d is None:
        return None
    t = _parse_time(row.get("reminder_time"))
    due = datetime.combine(d, t)
    try:
        offset = int(row.get("notification_offset") or 0)
    except (TypeError, ValueError):
        offset = 0
    if offset > 0:
        due -= timedelta(minutes=offset)
    return due


def is_due(row: dict[str, Any], now: datetime) -> bool:
    """True when this (pending, notified_at-empty) row should fire by `now`."""
    if str(row.get("status") or "pending").lower() != "pending":
        return False
    if not bool(row.get("notification_enabled", True)):
        return False
    if row.get("notified_at"):
        return False
    due = compute_due(row)
    return due is not None and due <= now


# ── Candidate query ────────────────────────────────────────────────────────────

def find_due(user_id: Optional[str], now: datetime) -> list[dict[str, Any]]:
    """Fetch pending, not-yet-notified reminders inside the dispatch window.

    The heavy lifting (offset maths) is done in Python via is_due(); this query
    only narrows the candidate set with an indexed, bounded date range.
    """
    try:
        client = get_supabase_client()
    except Exception as exc:  # DB unavailable — degrade quietly
        logger.warning("reminder sweep: no supabase client: %s", exc)
        return []

    low = (now - timedelta(days=_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    high = (now + timedelta(days=_LOOKAHEAD_DAYS)).strftime("%Y-%m-%d")

    try:
        query = (
            client.table(_REMINDERS_TABLE)
            .select("*")
            .eq("status", "pending")
            .is_("notified_at", "null")
            .gte("date", low)
            .lte("date", high)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        resp = query.execute()
    except Exception as exc:
        if _is_missing_schema_error(exc):
            _warn_schema_not_ready()
        else:
            logger.warning("reminder sweep: query failed: %s", exc)
        return []

    # Query succeeded — reset the throttle so a future schema regression warns
    # again immediately rather than after the interval.
    global _last_schema_warn
    _last_schema_warn = -float("inf")

    rows = resp.data or []
    return [r for r in rows if is_due(r, now)]


# ── Delivery ───────────────────────────────────────────────────────────────────

def _stamp_notified(reminder_id: str) -> None:
    """Mark a reminder dispatched so it never re-fires (idempotency)."""
    try:
        client = get_supabase_client()
        (
            client.table(_REMINDERS_TABLE)
            .update({"notified_at": datetime.utcnow().isoformat(),
                     "updated_at": datetime.utcnow().isoformat()})
            .eq("id", reminder_id)
            .execute()
        )
    except Exception as exc:
        # Best-effort: if we cannot stamp it, the next sweep may retry the send.
        logger.warning("reminder sweep: could not stamp notified_at for %s: %s", reminder_id, exc)


async def _post_reminder_alert(payload: dict[str, Any]) -> bool:
    """Hand the reminder to the auth backend. Returns True on HTTP 200."""
    if not settings.internal_api_secret:
        logger.warning(
            "reminder dispatch skipped (no INTERNAL_API_SECRET) for reminder %s",
            payload.get("reminder_id"),
        )
        return False

    url = f"{settings.auth_backend_url.rstrip('/')}/api/internal/reminder-alert"
    try:
        async with httpx.AsyncClient(
            timeout=settings.email_alert_timeout_seconds
        ) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"x-internal-secret": settings.internal_api_secret},
            )
    except Exception as exc:
        logger.error(
            "reminder dispatch failed | reminder=%s error=%s: %s",
            payload.get("reminder_id"), type(exc).__name__, exc or "no message",
        )
        return False

    if resp.status_code != 200:
        logger.error(
            "reminder dispatch non-200 | reminder=%s status=%d body=%s",
            payload.get("reminder_id"), resp.status_code, resp.text[:200],
        )
        return False
    return True


async def dispatch(row: dict[str, Any], *, notify_email: bool = True) -> bool:
    """Dispatch one due reminder (in-app always, email optional). Idempotent.

    Returns True when the reminder was handed to the auth backend successfully
    (and therefore stamped notified_at). Never raises.
    """
    reminder_id = str(row.get("id") or "")
    user_id = str(row.get("user_id") or "")
    if not reminder_id or not user_id:
        return False

    email, name = resolve_recipient(user_id)

    due = compute_due(row)
    due_str = row.get("date")
    if row.get("reminder_time"):
        due_str = f"{row.get('date')} {str(row.get('reminder_time'))[:5]}"

    payload: dict[str, Any] = {
        "user_id": user_id,
        "user_email": email or "",
        "user_name": name or "",
        "reminder_id": reminder_id,
        "title": row.get("title") or "Reminder",
        "note": row.get("note") or "",
        "category": row.get("category") or "general",
        "priority": row.get("priority") or "medium",
        "due_date": due_str,
        "notify_email": bool(notify_email and email),
    }

    ok = await _post_reminder_alert(payload)
    if ok:
        _stamp_notified(reminder_id)
    return ok


def _reminder_prefs(user_ids: set[str]) -> dict[str, dict[str, bool]]:
    """Read each user's calendar_preferences so the sweep can honour the
    Settings → Calendar master switch (reminders_enabled) and the e-mail
    channel toggle.

    Fail-OPEN per user: a settings read error (or the columns not existing yet)
    keeps reminders ENABLED with e-mail ON, which is exactly today's behaviour —
    wiring the toggle must never silently switch existing notifications off.
    """
    prefs: dict[str, dict[str, bool]] = {
        uid: {"enabled": True, "email": True} for uid in user_ids
    }
    if not user_ids:
        return prefs
    try:
        client = get_supabase_client()
        resp = (
            client.table("user_settings")
            .select("user_id,calendar_preferences")
            .in_("user_id", list(user_ids))
            .execute()
        )
        for row in resp.data or []:
            uid = str(row.get("user_id") or "")
            if uid not in prefs:
                continue
            cal = row.get("calendar_preferences") or {}
            if not isinstance(cal, dict):
                cal = {}
            # Absent keys default True (fail-open) — same reasoning as above.
            prefs[uid] = {
                "enabled": bool(cal.get("reminders_enabled", True)),
                "email": bool(cal.get("email", True)),
            }
    except Exception as exc:
        logger.warning("reminder sweep: could not read calendar prefs: %s", exc)
    return prefs


async def run_due_sweep(user_id: Optional[str]) -> int:
    """Dispatch every due reminder (for one user, or all users when user_id is
    None). Returns the count delivered. Never raises."""
    now = datetime.now()
    try:
        due = find_due(user_id, now)
    except Exception as exc:
        logger.warning("reminder sweep errored: %s", exc)
        return 0

    # One settings read for the whole batch decides who is muted and who gets
    # an e-mail — the Settings → Calendar toggles are enforced HERE, server-
    # side, so a client can't keep firing notifications it switched off.
    prefs = _reminder_prefs({str(r.get("user_id") or "") for r in due})

    delivered = 0
    for row in due:
        uid = str(row.get("user_id") or "")
        pref = prefs.get(uid, {"enabled": True, "email": True})
        if not pref["enabled"]:
            continue  # master reminders toggle OFF → stay pending, never fire
        try:
            if await dispatch(row, notify_email=pref["email"]):
                delivered += 1
        except Exception as exc:  # one bad row must not stop the rest
            logger.error("reminder dispatch loop error for %s: %s", row.get("id"), exc)
    if delivered:
        logger.info("Reminder sweep delivered %d notification(s).", delivered)
    return delivered


# ── In-process scheduler loop ──────────────────────────────────────────────────

async def reminder_scheduler_loop() -> None:
    """Long-running asyncio task started from the FastAPI lifespan.

    Sweeps all users' due reminders every `settings.reminder_check_seconds`.
    Runs one sweep immediately on startup so a reminder that came due while the
    server was down is still delivered. A DB or delivery error never kills the
    loop — it is caught, logged, and retried on the next tick.
    """
    logger.info(
        "Reminder scheduler armed (every %ss).", settings.reminder_check_seconds
    )
    while True:
        try:
            await run_due_sweep(None)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Reminder scheduler iteration failed: %s", exc, exc_info=True)
        try:
            await asyncio.sleep(settings.reminder_check_seconds)
        except asyncio.CancelledError:
            raise
