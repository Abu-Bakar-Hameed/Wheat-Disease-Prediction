"""
WheatGuard AI – Calendar Routes
Serves the prediction calendar and per-user reminders.

Endpoints
---------
GET  /api/v1/users/me/calendar/scans          → all prediction entries mapped for the calendar
GET  /api/v1/users/me/calendar                → scans + reminders for a given month (year/month params)
GET  /api/v1/users/me/reminders               → all reminders
POST /api/v1/users/me/reminders               → create reminder
PATCH /api/v1/users/me/reminders/{id}         → update reminder
DELETE /api/v1/users/me/reminders/{id}        → delete reminder

Data sources
------------
Scans   → the existing `predictions` table (user-scoped, read-only from this module)
Reminders → `calendar_reminders` table (full CRUD)

The frontend CalendarView already knows how to consume these:
  fetchAllCalendarScans()   → GET /api/v1/users/me/calendar/scans
  fetchAllCalendarReminders()→ GET /api/v1/users/me/reminders
  createReminder()          → POST /api/v1/users/me/reminders
  updateReminder()          → PATCH /api/v1/users/me/reminders/{id}
  deleteReminder()          → DELETE /api/v1/users/me/reminders/{id}
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time as _time, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from app.core.auth import get_current_user_id
from app.core.logging import get_logger
from app.database.database import get_supabase_client

router = APIRouter(prefix="/api/v1/users/me", tags=["Calendar"])
logger = get_logger(__name__)

_PREDICTIONS_TABLE = "predictions"
_REMINDERS_TABLE   = "calendar_reminders"

# Allowed enum-style values for the Reminder Center (validated in Python so a
# bad category/priority can never reach the column, whatever the client sends).
_CATEGORIES = {"scan", "disease", "weather", "farm", "general"}
_PRIORITIES = {"low", "medium", "high"}
_STATUSES   = {"pending", "completed"}
_REPEATS    = {"none", "daily", "weekly", "monthly", "custom"}
_SOURCES    = {"manual", "prediction_followup", "weather_risk"}

# Columns a client is allowed to set on create/update. `user_id`, `id`,
# `created_at`, `updated_at`, `notified_at`, `completed_at` are server-owned.
_EDITABLE_FIELDS = (
    "date", "title", "note", "category", "priority", "reminder_time",
    "notification_enabled", "notification_offset", "repeat_rule",
    "repeat_interval_days", "source", "related_prediction_id",
    "related_disease", "related_weather_risk_disease",
)

# ── Pydantic models ───────────────────────────────────────────────────────────

class CalendarScanEntry(BaseModel):
    prediction_id: str
    date: str                          # YYYY-MM-DD  (local date of the scan)
    disease_name: str
    severity: str
    thumbnail_url: Optional[str] = None
    created_at: Optional[str]   = None


class CalendarScansResponse(BaseModel):
    scans: list[CalendarScanEntry]


class CalendarReminder(BaseModel):
    id: str
    date: str                          # YYYY-MM-DD
    title: str
    note: Optional[str] = None
    category: str = "general"
    priority: str = "medium"
    status: str = "pending"
    reminder_time: Optional[str] = None    # HH:MM
    notification_enabled: bool = True
    notification_offset: int = 0
    notified_at: Optional[str] = None
    repeat_rule: str = "none"
    repeat_interval_days: Optional[int] = None
    source: str = "manual"
    related_prediction_id: Optional[str] = None
    related_disease: Optional[str] = None
    related_weather_risk_disease: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CalendarMonthResponse(BaseModel):
    scans: list[CalendarScanEntry]
    reminders: list[CalendarReminder]
    usingFallback: bool = False


def _clean_date(v: str) -> str:
    try:
        date.fromisoformat(str(v)[:10])
    except ValueError:
        raise ValueError("date must be a valid ISO date (YYYY-MM-DD)")
    return str(v)[:10]


def _clean_time(v: Optional[str]) -> Optional[str]:
    """Accept HH:MM or HH:MM:SS (from an <input type=time>), store HH:MM:SS."""
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        parts = s.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        sec = int(parts[2]) if len(parts) > 2 else 0
        _time(hour=hour, minute=minute, second=sec)   # raises if out of range
    except Exception:
        raise ValueError("reminder_time must be HH:MM (24-hour)")
    return f"{hour:02d}:{minute:02d}:{sec:02d}"


class ReminderCreate(BaseModel):
    date: str = Field(..., min_length=10, max_length=10,
                      description="ISO date YYYY-MM-DD")
    title: str = Field(..., min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=1000)
    category: str = Field(default="general", max_length=20)
    priority: str = Field(default="medium", max_length=10)
    reminder_time: Optional[str] = Field(default=None, max_length=8)
    notification_enabled: bool = True
    notification_offset: int = Field(default=0, ge=0, le=10080)
    repeat_rule: str = Field(default="none", max_length=20)
    repeat_interval_days: Optional[int] = Field(default=None, ge=1, le=3650)
    source: str = Field(default="manual", max_length=30)
    related_prediction_id: Optional[str] = Field(default=None, max_length=64)
    related_disease: Optional[str] = Field(default=None, max_length=120)
    related_weather_risk_disease: Optional[str] = Field(default=None, max_length=120)

    @field_validator("date")
    @classmethod
    def _valid_date(cls, v: str) -> str:
        return _clean_date(v)

    @field_validator("reminder_time")
    @classmethod
    def _valid_time(cls, v: Optional[str]) -> Optional[str]:
        return _clean_time(v)

    @field_validator("category")
    @classmethod
    def _valid_cat(cls, v: str) -> str:
        v = (v or "general").strip().lower()
        if v not in _CATEGORIES:
            raise ValueError("category must be one of " + ", ".join(sorted(_CATEGORIES)))
        return v

    @field_validator("priority")
    @classmethod
    def _valid_prio(cls, v: str) -> str:
        v = (v or "medium").strip().lower()
        if v not in _PRIORITIES:
            raise ValueError("priority must be one of " + ", ".join(sorted(_PRIORITIES)))
        return v

    @field_validator("repeat_rule")
    @classmethod
    def _valid_repeat(cls, v: str) -> str:
        v = (v or "none").strip().lower()
        if v not in _REPEATS:
            raise ValueError("repeat_rule must be one of " + ", ".join(sorted(_REPEATS)))
        return v

    @field_validator("source")
    @classmethod
    def _valid_source(cls, v: str) -> str:
        v = (v or "manual").strip().lower()
        if v not in _SOURCES:
            raise ValueError("source must be one of " + ", ".join(sorted(_SOURCES)))
        return v


class ReminderUpdate(BaseModel):
    date: Optional[str] = Field(default=None, min_length=10, max_length=10)
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=1000)
    category: Optional[str] = Field(default=None, max_length=20)
    priority: Optional[str] = Field(default=None, max_length=10)
    reminder_time: Optional[str] = Field(default=None, max_length=8)
    notification_enabled: Optional[bool] = None
    notification_offset: Optional[int] = Field(default=None, ge=0, le=10080)
    repeat_rule: Optional[str] = Field(default=None, max_length=20)
    repeat_interval_days: Optional[int] = Field(default=None, ge=1, le=3650)
    status: Optional[str] = Field(default=None, max_length=12)

    @field_validator("date")
    @classmethod
    def _valid_date(cls, v: Optional[str]) -> Optional[str]:
        return _clean_date(v) if v is not None else None

    @field_validator("reminder_time")
    @classmethod
    def _valid_time(cls, v: Optional[str]) -> Optional[str]:
        return _clean_time(v)

    @field_validator("category")
    @classmethod
    def _valid_cat(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in _CATEGORIES:
            raise ValueError("category must be one of " + ", ".join(sorted(_CATEGORIES)))
        return v

    @field_validator("priority")
    @classmethod
    def _valid_prio(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in _PRIORITIES:
            raise ValueError("priority must be one of " + ", ".join(sorted(_PRIORITIES)))
        return v

    @field_validator("repeat_rule")
    @classmethod
    def _valid_repeat(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in _REPEATS:
            raise ValueError("repeat_rule must be one of " + ", ".join(sorted(_REPEATS)))
        return v

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in _STATUSES:
            raise ValueError("status must be one of " + ", ".join(sorted(_STATUSES)))
        return v


class ReminderSnooze(BaseModel):
    """Snooze presets OR an explicit minutes bump. One of the two styles."""
    until: Optional[str] = Field(default=None, max_length=20)   # today|tomorrow|in3d|in7d|custom
    custom_datetime: Optional[str] = Field(default=None, max_length=16)  # YYYY-MM-DDTHH:MM
    minutes: Optional[int] = Field(default=None, ge=1, le=60 * 24 * 365)


class ReminderReschedule(BaseModel):
    date: str = Field(..., min_length=10, max_length=10)
    reminder_time: Optional[str] = Field(default=None, max_length=8)

    @field_validator("date")
    @classmethod
    def _valid_date(cls, v: str) -> str:
        return _clean_date(v)

    @field_validator("reminder_time")
    @classmethod
    def _valid_time(cls, v: Optional[str]) -> Optional[str]:
        return _clean_time(v)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_scan(row: dict[str, Any]) -> CalendarScanEntry:
    """Map a predictions row → CalendarScanEntry."""
    created_iso: str | None = None
    raw_ts = row.get("created_at")
    if raw_ts:
        try:
            created_iso = str(raw_ts)
            # Build a local YYYY-MM-DD from the UTC timestamp so the calendar
            # dot lands on the correct day in the browser's locale.  We keep
            # the full ISO string in `created_at` so the UI can format the time.
        except Exception:
            pass

    # Derive a plain YYYY-MM-DD date key from created_at
    date_key = ""
    if raw_ts:
        try:
            dt = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
            date_key = dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
        except Exception:
            date_key = str(raw_ts)[:10]

    return CalendarScanEntry(
        prediction_id=str(row["id"]),
        date=date_key,
        disease_name=str(row.get("predicted_class") or "Unknown"),
        severity=str(row.get("severity") or "unknown"),
        thumbnail_url=row.get("image_url") or None,
        created_at=created_iso,
    )


def _row_to_reminder(row: dict[str, Any]) -> CalendarReminder:
    d = row.get("date", "")
    rt = row.get("reminder_time")
    reminder_time: str | None = None
    if rt:
        # Postgres TIME may serialise as HH:MM:SS or with microseconds; keep HH:MM.
        reminder_time = str(rt)[:5]
    return CalendarReminder(
        id=str(row["id"]),
        date=str(d)[:10] if d else "",
        title=str(row.get("title") or ""),
        note=row.get("note") or None,
        category=str(row.get("category") or "general"),
        priority=str(row.get("priority") or "medium"),
        status=str(row.get("status") or "pending"),
        reminder_time=reminder_time,
        notification_enabled=bool(row.get("notification_enabled", True)),
        notification_offset=int(row.get("notification_offset") or 0),
        notified_at=str(row["notified_at"]) if row.get("notified_at") else None,
        repeat_rule=str(row.get("repeat_rule") or "none"),
        repeat_interval_days=(
            int(row["repeat_interval_days"])
            if row.get("repeat_interval_days") not in (None, "") else None
        ),
        source=str(row.get("source") or "manual"),
        related_prediction_id=row.get("related_prediction_id") or None,
        related_disease=row.get("related_disease") or None,
        related_weather_risk_disease=row.get("related_weather_risk_disease") or None,
        completed_at=str(row["completed_at"]) if row.get("completed_at") else None,
        created_at=str(row["created_at"]) if row.get("created_at") else None,
        updated_at=str(row["updated_at"]) if row.get("updated_at") else None,
    )


def _next_occurrence(current_date: str, repeat_rule: str,
                     repeat_interval_days: Optional[int]) -> Optional[date]:
    """Compute the next due date for a recurring reminder (spec §23).

    Returns None for non-recurring reminders. Monthly clamps to the last valid
    day of the target month (e.g. 31 Jan → 28/29 Feb).
    """
    try:
        base = date.fromisoformat(str(current_date)[:10])
    except Exception:
        return None
    if repeat_rule == "daily":
        return base + timedelta(days=1)
    if repeat_rule == "weekly":
        return base + timedelta(days=7)
    if repeat_rule == "custom":
        step = int(repeat_interval_days or 0)
        return base + timedelta(days=step) if step > 0 else None
    if repeat_rule == "monthly":
        month_idx = base.month - 1 + 1
        year = base.year + month_idx // 12
        month = month_idx % 12 + 1
        # Clamp day to the last day of the target month.
        if month == 12:
            next_first = date(year + 1, 1, 1)
        else:
            next_first = date(year, month + 1, 1)
        last_day = (next_first - timedelta(days=1)).day
        return date(year, month, min(base.day, last_day))
    return None


def _fetch_all_scans(user_id: str) -> list[CalendarScanEntry]:
    """Return all prediction rows for this user as CalendarScanEntry list."""
    client = get_supabase_client()
    try:
        resp = (
            client.table(_PREDICTIONS_TABLE)
            .select("id,predicted_class,severity,image_url,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [_row_to_scan(r) for r in (resp.data or [])]
    except Exception as exc:
        logger.warning("calendar: could not fetch predictions: %s", exc)
        return []


def _fetch_all_reminders(user_id: str) -> list[CalendarReminder]:
    client = get_supabase_client()
    try:
        resp = (
            client.table(_REMINDERS_TABLE)
            .select("*")
            .eq("user_id", user_id)
            .order("date", desc=True)
            .execute()
        )
        return [_row_to_reminder(r) for r in (resp.data or [])]
    except Exception as exc:
        logger.warning("calendar: could not fetch reminders: %s", exc)
        return []


# ── GET /api/v1/users/me/calendar/scans ──────────────────────────────────────

@router.get(
    "/calendar/scans",
    response_model=CalendarScansResponse,
    status_code=status.HTTP_200_OK,
    summary="All prediction scan entries for the calendar",
)
async def get_calendar_scans(
    user_id: str = Depends(get_current_user_id),
) -> CalendarScansResponse:
    """Return all predictions as lightweight CalendarScanEntry objects.

    The frontend CalendarView fetches this once on mount and uses it for
    all view modes (daily/weekly/monthly/yearly) — no date range filtering
    happens server-side here so the client can navigate freely without
    additional API calls.
    """
    scans = _fetch_all_scans(user_id)
    return CalendarScansResponse(scans=scans)


# ── GET /api/v1/users/me/calendar ────────────────────────────────────────────

@router.get(
    "/calendar",
    response_model=CalendarMonthResponse,
    status_code=status.HTTP_200_OK,
    summary="Scans + reminders for a calendar month",
)
async def get_calendar_month(
    year:  int = Query(default=..., ge=2000, le=2100, description="4-digit year"),
    month: int = Query(default=..., ge=1,    le=12,   description="Month 1–12"),
    user_id: str = Depends(get_current_user_id),
) -> CalendarMonthResponse:
    """Return predictions and reminders for a single calendar month.

    Used by `fetchCalendarMonth(year, month)` in api.ts.
    Scans are filtered to the requested month; reminders likewise.
    """
    mm = str(month).zfill(2)
    prefix = f"{year}-{mm}-"

    all_scans = _fetch_all_scans(user_id)
    month_scans = [s for s in all_scans if str(s.date).startswith(prefix)]

    all_reminders = _fetch_all_reminders(user_id)
    month_reminders = [r for r in all_reminders if str(r.date).startswith(prefix)]

    return CalendarMonthResponse(
        scans=month_scans,
        reminders=month_reminders,
        usingFallback=False,
    )


# ── GET /api/v1/users/me/reminders ───────────────────────────────────────────

@router.get(
    "/reminders",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="List all reminders",
)
async def list_reminders(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    reminders = _fetch_all_reminders(user_id)
    return {"reminders": [r.model_dump() for r in reminders]}


# ── POST /api/v1/users/me/reminders ──────────────────────────────────────────

@router.post(
    "/reminders",
    response_model=CalendarReminder,
    status_code=status.HTTP_201_CREATED,
    summary="Create a reminder",
)
async def create_reminder(
    body: ReminderCreate,
    user_id: str = Depends(get_current_user_id),
) -> CalendarReminder:
    client = get_supabase_client()
    try:
        resp = (
            client.table(_REMINDERS_TABLE)
            .insert({
                "id":      str(uuid.uuid4()),
                "user_id": user_id,
                "date":    body.date,
                "title":   body.title.strip(),
                "note":    body.note.strip() if body.note else None,
                "category": body.category,
                "priority": body.priority,
                "status":  "pending",
                "reminder_time": body.reminder_time,
                "notification_enabled": body.notification_enabled,
                "notification_offset": body.notification_offset,
                "repeat_rule": body.repeat_rule,
                "repeat_interval_days": body.repeat_interval_days,
                "source": body.source,
                "related_prediction_id": body.related_prediction_id,
                "related_disease": body.related_disease,
                "related_weather_risk_disease": body.related_weather_risk_disease,
            })
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to create reminder.")
        return _row_to_reminder(resp.data[0])
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("calendar: create_reminder failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not save reminder.") from exc


# ── PATCH /api/v1/users/me/reminders/{reminder_id} ───────────────────────────

@router.patch(
    "/reminders/{reminder_id}",
    response_model=CalendarReminder,
    status_code=status.HTTP_200_OK,
    summary="Update a reminder",
)
async def update_reminder(
    reminder_id: str,
    body: ReminderUpdate,
    user_id: str = Depends(get_current_user_id),
) -> CalendarReminder:
    client = get_supabase_client()

    # Verify ownership
    check = (
        client.table(_REMINDERS_TABLE)
        .select("id")
        .eq("id", reminder_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Reminder not found.")

    patch: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    # Only apply the fields the client actually sent (exclude_unset), restricted
    # to the editable whitelist so server-owned columns can never be forged.
    for key, value in body.model_dump(exclude_unset=True).items():
        if key not in _EDITABLE_FIELDS and key != "status":
            continue
        if key == "title" and value is not None:
            patch["title"] = str(value).strip()
        elif key == "note":
            patch["note"] = (str(value).strip() or None) if value is not None else None
        else:
            patch[key] = value

    # Editing a pending reminder's schedule should let it re-fire, so clear the
    # notification stamp whenever the due timing or notification flag changes.
    if ({"date", "reminder_time", "notification_offset", "notification_enabled"}
            & set(patch.keys())):
        patch["notified_at"] = None

    try:
        resp = (
            client.table(_REMINDERS_TABLE)
            .update(patch)
            .eq("id", reminder_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=500, detail="Update returned no data.")
        return _row_to_reminder(resp.data[0])
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("calendar: update_reminder failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not update reminder.") from exc


# ── DELETE /api/v1/users/me/reminders/{reminder_id} ──────────────────────────

@router.delete(
    "/reminders/{reminder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a reminder",
)
async def delete_reminder(
    reminder_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    client = get_supabase_client()

    # Verify ownership before deleting
    check = (
        client.table(_REMINDERS_TABLE)
        .select("id")
        .eq("id", reminder_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Reminder not found.")

    try:
        client.table(_REMINDERS_TABLE).delete().eq("id", reminder_id).execute()
    except Exception as exc:
        logger.error("calendar: delete_reminder failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not delete reminder.") from exc


# ── Ownership helper for the action endpoints ─────────────────────────────────

def _fetch_reminder_row(client, reminder_id: str, user_id: str) -> dict[str, Any]:
    """Return the full reminder row, or raise 404. Enforces user ownership (§27)."""
    check = (
        client.table(_REMINDERS_TABLE)
        .select("*")
        .eq("id", reminder_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Reminder not found.")
    return check.data


# ── POST /api/v1/users/me/reminders/sweep  (on-open notification delivery) ───

@router.post(
    "/reminders/sweep",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Deliver any of this user's reminders that have come due",
)
async def sweep_reminders(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Run the on-open sweep for the current user only.

    Called when the Calendar mounts so a reminder that came due while the
    server was stopped is still delivered. Idempotent via `notified_at`, so a
    second call delivers nothing. Best-effort: any dispatch failure is logged
    inside the service and never turns into a 500 for the calendar page.
    """
    from app.ml.reminder_service import run_due_sweep

    delivered = await run_due_sweep(user_id)
    return {"delivered": delivered}


# ── POST /api/v1/users/me/reminders/{reminder_id}/complete ───────────────────

@router.post(
    "/reminders/{reminder_id}/complete",
    response_model=CalendarReminder,
    status_code=status.HTTP_200_OK,
    summary="Mark a reminder completed (and roll forward if recurring)",
)
async def complete_reminder(
    reminder_id: str,
    user_id: str = Depends(get_current_user_id),
) -> CalendarReminder:
    client = get_supabase_client()
    row = _fetch_reminder_row(client, reminder_id, user_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        resp = (
            client.table(_REMINDERS_TABLE)
            .update({"status": "completed", "completed_at": now_iso, "updated_at": now_iso})
            .eq("id", reminder_id)
            .eq("user_id", user_id)
            .execute()
        )
        completed = _row_to_reminder((resp.data or [row])[0] if resp.data else row)

        # Recurring reminder: create ONE next occurrence (bounded, spec §23).
        repeat_rule = str(row.get("repeat_rule") or "none")
        if repeat_rule != "none":
            nxt = _next_occurrence(
                str(row.get("date") or ""),
                repeat_rule,
                row.get("repeat_interval_days"),
            )
            if nxt is not None:
                client.table(_REMINDERS_TABLE).insert({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "date": nxt.isoformat(),
                    "title": row.get("title"),
                    "note": row.get("note"),
                    "category": row.get("category") or "general",
                    "priority": row.get("priority") or "medium",
                    "status": "pending",
                    "reminder_time": row.get("reminder_time"),
                    "notification_enabled": bool(row.get("notification_enabled", True)),
                    "notification_offset": int(row.get("notification_offset") or 0),
                    "repeat_rule": repeat_rule,
                    "repeat_interval_days": row.get("repeat_interval_days"),
                    "source": row.get("source") or "manual",
                    "related_prediction_id": row.get("related_prediction_id"),
                    "related_disease": row.get("related_disease"),
                    "related_weather_risk_disease": row.get("related_weather_risk_disease"),
                }).execute()
        return completed
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("calendar: complete_reminder failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not complete reminder.") from exc


# ── POST /api/v1/users/me/reminders/{reminder_id}/snooze ─────────────────────

@router.post(
    "/reminders/{reminder_id}/snooze",
    response_model=CalendarReminder,
    status_code=status.HTTP_200_OK,
    summary="Push a reminder's due date/time later",
)
async def snooze_reminder(
    reminder_id: str,
    body: ReminderSnooze,
    user_id: str = Depends(get_current_user_id),
) -> CalendarReminder:
    client = get_supabase_client()
    row = _fetch_reminder_row(client, reminder_id, user_id)

    today = datetime.now(timezone.utc).date()
    cur_time = (str(row.get("reminder_time"))[:5]
                if row.get("reminder_time") else None)

    new_date: str
    new_time: Optional[str] = cur_time

    if body.minutes is not None:
        base = _parse_dt(f"{str(row.get('date'))[:10]}T{cur_time or '09:00'}")
        bumped = base + timedelta(minutes=body.minutes)
        new_date, new_time = bumped.strftime("%Y-%m-%d"), bumped.strftime("%H:%M")
    elif body.until == "custom":
        dt = _parse_dt(body.custom_datetime or "")
        new_date, new_time = dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")
    elif body.until in ("today", "tomorrow", "in3d", "in7d"):
        offset = {"today": 0, "tomorrow": 1, "in3d": 3, "in7d": 7}[body.until]
        new_date = (today + timedelta(days=offset)).isoformat()
        if not new_time:
            # Default the snoozed-fire time so 'later today' isn't stuck at 09:00.
            now_local = datetime.now(timezone.utc)
            new_time = (now_local + timedelta(hours=1)).strftime("%H:%M")
    else:
        raise HTTPException(status_code=422, detail="Provide 'minutes' or a valid 'until'.")

    patch = {
        "date": new_date,
        "reminder_time": new_time,
        "notified_at": None,
        "status": "pending",
        "completed_at": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        resp = (
            client.table(_REMINDERS_TABLE)
            .update(patch)
            .eq("id", reminder_id)
            .eq("user_id", user_id)
            .execute()
        )
        return _row_to_reminder((resp.data or [row])[0] if resp.data else {**row, **patch})
    except Exception as exc:
        logger.error("calendar: snooze_reminder failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not snooze reminder.") from exc


# ── POST /api/v1/users/me/reminders/{reminder_id}/reschedule ─────────────────

@router.post(
    "/reminders/{reminder_id}/reschedule",
    response_model=CalendarReminder,
    status_code=status.HTTP_200_OK,
    summary="Move a reminder to a specific date/time",
)
async def reschedule_reminder(
    reminder_id: str,
    body: ReminderReschedule,
    user_id: str = Depends(get_current_user_id),
) -> CalendarReminder:
    client = get_supabase_client()
    row = _fetch_reminder_row(client, reminder_id, user_id)

    patch: dict[str, Any] = {
        "date": body.date,
        "notified_at": None,
        "status": "pending",
        "completed_at": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.reminder_time is not None:
        patch["reminder_time"] = body.reminder_time

    try:
        resp = (
            client.table(_REMINDERS_TABLE)
            .update(patch)
            .eq("id", reminder_id)
            .eq("user_id", user_id)
            .execute()
        )
        return _row_to_reminder((resp.data or [row])[0] if resp.data else {**row, **patch})
    except Exception as exc:
        logger.error("calendar: reschedule_reminder failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not reschedule reminder.") from exc


def _parse_dt(raw: str) -> datetime:
    """Parse 'YYYY-MM-DDTHH:MM' or 'YYYY-MM-DD HH:MM' into a naive datetime."""
    s = str(raw).strip().replace(" ", "T")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        d = date.fromisoformat(s[:10])
        hh = int(s[11:13]) if len(s) >= 13 and s[11:13].isdigit() else 9
        mm = int(s[14:16]) if len(s) >= 16 and s[14:16].isdigit() else 0
        return datetime.combine(d, _time(hour=min(23, hh), minute=min(59, mm)))
