"""
WheatGuard AI – Admin User Retention Routes
All endpoints are admin-only (require_admin dependency on the router).

Retention is computed from FOUR data sources, merged per user:
  1. `profiles`      — registration date (the cohort anchor)
  2. `predictions`   — prediction counts / timestamps
  3. `user_activity` — user_registered / user_login / user_logout /
                       calendar_opened / history_viewed / prediction views /
                       notification interactions (written by the auth service,
                       the prediction route and the frontend activity endpoint)
  4. `notifications` — per-user notification counts + the historical login
                       signal (auth service writes a type='login' row on
                       every successful login)

Meaningful activity (spec §6) = login · make prediction · view prediction ·
open calendar · view prediction history · use notification functionality.
Registration and logout are recorded but deliberately NOT counted as
"returns" (registering is not a return; logout ends a session).

Cohort retention formula (D1 / D7 / D14 / D30), registration-anchored:
  For each user, anchor R = profiles.created_at (fallback: first activity):
    - D1  retained → ≥1 meaningful activity in [R+1d,  R+1d]
    - D7  retained → ≥1 meaningful activity in [R+6d,  R+8d]
    - D14 retained → ≥1 meaningful activity in [R+13d, R+15d]
    - D30 retained → ≥1 meaningful activity in [R+29d, R+31d]
  (The ±1-day tolerance keeps calendar-day semantics correct across
  timezones — spec §6 examples use single calendar days.)
  Retention rate = (retained_count / cohort_size) × 100.
  A window is only DISPLAYED once it has fully elapsed; users whose D30 has
  not yet occurred show "not yet reached" — never 0%%.

Per-user status rules (consolidated spec §16) — explicit, applied consistently:
  New       — registered within the last 7 days
  Active    — last meaningful activity ≤ 7 days ago, 1 distinct active day
  Returning — last meaningful activity ≤ 7 days ago, ≥ 2 distinct active days
  Inactive  — no meaningful activity within the last 7 days (or never active)

Logins appear in two sources (auth-service notifications AND user_activity
rows). Login events from different sources that fall within 60 seconds of
each other are treated as ONE login, so no login is double-counted.

Endpoints:
  GET /api/v1/admin/retention/summary         → KPI cards
  GET /api/v1/admin/retention/trend           → retention curve D1/D7/D14/D30
  GET /api/v1/admin/retention/users           → compact recent-activity table
  GET /api/v1/admin/retention/individual-users→ full per-user table
                                                (search/filter/sort/pagination)
  GET /api/v1/admin/retention/new-users       → new-user analytics + funnel
  GET /api/v1/admin/retention/wheat           → wheat prediction summary
  GET /api/v1/admin/retention/activity        → per-activity-type counts
  GET /api/v1/admin/retention/users/{user_id} → full per-user retention detail
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.auth import require_admin
from app.core.logging import get_logger
from app.database.activity_crud import (
    MEANINGFUL_EVENT_TYPES,
    canonical_event_type,
    fetch_activity_rows,
)
from app.database.database import get_supabase_client

router = APIRouter(
    prefix="/api/v1/admin/retention",
    tags=["Admin – Retention"],
    dependencies=[Depends(require_admin)],
)
logger = get_logger(__name__)

# ── helpers ───────────────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _start_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _period_bounds(days: int) -> tuple[datetime, datetime]:
    """Return (start, end) for the last `days` days including today."""
    end   = _now_utc()
    start = _start_of_day(end - timedelta(days=days - 1))
    return start, end


def _prev_period_bounds(days: int) -> tuple[datetime, datetime]:
    """Return the equal-length period immediately before the current one."""
    cur_start, _ = _period_bounds(days)
    prev_end   = cur_start - timedelta(seconds=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return prev_start, prev_end


def _pct_change(current: int, previous: int) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round((current - previous) / previous * 100, 1)


# Schema-drift warnings would otherwise repeat on every request and flood the
# log; each distinct key is therefore warned once per process.
_WARNED_KEYS: set[str] = set()


def _warn_once(key: str, message: str) -> None:
    if key in _WARNED_KEYS:
        return
    _WARNED_KEYS.add(key)
    logger.warning(message)


def _error_flavor(exc: Exception) -> str:
    """Coarse error classification used to de-duplicate repeated warnings."""
    text = str(exc)
    if "42703" in text:
        return "42703"        # column does not exist
    if "PGRST205" in text:
        return "PGRST205"     # table not in schema cache
    return "other"


def _safe_get(client: Any, table: str, query_fn) -> list[dict]:
    try:
        resp = query_fn(client.table(table))
        return resp.data or []
    except Exception as exc:
        _warn_once(
            f"_safe_get:{table}:{_error_flavor(exc)}",
            f"retention: {table} query failed: {exc}",
        )
        return []


def _all_profiles() -> list[dict]:
    client = get_supabase_client()
    rows: list[dict] = []
    try:
        resp = (
            client.table("profiles")
            .select("id,name,email,email_verified,created_at,avatar_url")
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        # Older databases may lack newer profile columns (e.g. avatar_url).
        # Fall back to select("*") so every other column still arrives —
        # consumers already read optional fields with .get().
        try:
            resp = client.table("profiles").select("*").execute()
            rows = resp.data or []
            _warn_once(
                "profiles:reduced-columns",
                "retention: profiles read via select(*) — extended column(s) "
                f"unavailable ({exc}); run supabase/schema.sql to add them.",
            )
        except Exception as exc2:
            _warn_once(
                f"profiles:failed:{_error_flavor(exc2)}",
                f"retention: profiles query failed: {exc2}",
            )
    return rows


def _predictions_in_range(start: datetime, end: datetime) -> list[dict]:
    """All predictions in [start, end] — returns minimal columns."""
    client = get_supabase_client()
    try:
        resp = (
            client.table("predictions")
            .select("id,user_id,severity,predicted_class,confidence_pct,image_url,created_at")
            .gte("created_at", start.isoformat())
            .lte("created_at", end.isoformat())
            .order("created_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        logger.warning("retention: predictions query failed: %s", exc)
        return []


def _predictions_for_user(user_id: str) -> list[dict]:
    client = get_supabase_client()
    try:
        resp = (
            client.table("predictions")
            .select("id,created_at,severity,predicted_class,confidence_pct")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        logger.warning("retention: user predictions query failed: %s", exc)
        return []


def _parse_dt(s: Any) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


# ── multi-source retention engine ─────────────────────────────────────────────

# Standardized retention windows: (label, low_offset, high_offset) in days
# after the registration anchor. The ±1-day span keeps calendar-day semantics
# correct across timezones (spec §6 examples use single calendar days).
RETENTION_WINDOWS: list[tuple[str, int, int]] = [
    ("D1",  1,  1),
    ("D7",  6,  8),
    ("D14", 13, 15),
    ("D30", 29, 31),
]

# One login is written to TWO stores (auth-service notification + activity
# row). Events from different sources within this many seconds are the SAME
# login and must be collapsed before counting.
LOGIN_DEDUP_SECONDS = 60


def _all_predictions_slim() -> list[dict]:
    """(user_id, created_at) for every prediction — retention math only."""
    client = get_supabase_client()
    try:
        resp = (
            client.table("predictions")
            .select("user_id,created_at")
            .order("created_at", desc=False)
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        logger.warning("retention: slim predictions query failed: %s", exc)
        return []


def _all_notifications_minimal() -> list[dict]:
    """(user_id, type, created_at) for every notification row."""
    return _safe_get(
        get_supabase_client(),
        "notifications",
        lambda q: q.select("user_id,type,created_at").execute(),
    )


def _collapse_login_times(times: list[datetime]) -> list[datetime]:
    """
    Merge login timestamps that fall within LOGIN_DEDUP_SECONDS of each other
    (the two-store duplicate of a single login) keeping the first of each
    cluster. Returns the distinct login events, ascending.
    """
    merged: list[datetime] = []
    for dt in sorted(times):
        if merged and (dt - merged[-1]).total_seconds() <= LOGIN_DEDUP_SECONDS:
            continue
        merged.append(dt)
    return merged


def _is_retained(anchor: datetime | None, times: list[datetime], lo: int, hi: int) -> bool:
    """True when at least one event happened in [anchor+lo days, anchor+hi days]."""
    if anchor is None:
        return False
    w_start = anchor + timedelta(days=lo)
    w_end   = anchor + timedelta(days=hi)
    return any(w_start <= t <= w_end for t in times)


def _is_observable(anchor: datetime | None, hi: int, now: datetime) -> bool:
    """A DN window is only shown once anchor + N days has fully elapsed."""
    if anchor is None:
        return False
    return now >= anchor + timedelta(days=hi)


def _compute_status(
    registered: datetime | None,
    last_active: datetime | None,
    active_days: int,
    now: datetime,
) -> str:
    """
    Documented 4-state per-user status (consolidated spec §4 / §16 — the
    speculative "At Risk" category was removed):

      new       — registered within the last 7 days
      returning — meaningful activity within 7 days on ≥ 2 distinct days
      active    — meaningful activity within 7 days on exactly 1 day
      inactive  — no meaningful activity within the 7-day inactivity
                  threshold (or no activity recorded at all)

    One single inactivity threshold (7 days) is used everywhere and the
    four states partition every user exactly once.
    """
    if registered and (now - registered).days <= 7:
        return "new"
    if last_active is None:
        return "inactive"
    days_since = (now - last_active).days
    if days_since <= 7:
        return "returning" if active_days >= 2 else "active"
    return "inactive"


def _collect_meaningful_times(
    pred_times: list[datetime],
    activity_rows: list[dict],
    login_times: list[datetime],
) -> list[datetime]:
    """
    Merged meaningful-activity timeline for ONE user (spec §6): predictions,
    meaningful user_activity rows, and deduplicated logins. Registration and
    logout are excluded by design.
    """
    times: list[datetime] = list(pred_times)
    for row in activity_rows:
        evt = canonical_event_type(str(row.get("event_type") or ""))
        if evt == "user_login":
            continue  # represented by the deduplicated login stream
        if evt in MEANINGFUL_EVENT_TYPES:
            dt = _parse_dt(row.get("created_at"))
            if dt:
                times.append(dt)
    times.extend(login_times)
    times.sort()
    return times


def _metrics_by_user(now: datetime, profiles: list[dict] | None = None) -> dict[str, dict]:
    """
    Build per-user retention metrics from ALL FOUR sources in a fixed number
    of queries (no N+1). Keyed by user id; every profile gets an entry even
    with zero activity.

    Each entry exposes:
      profile           raw profile row (id/name/email/created_at/avatar_url)
      registered        datetime | None — profile.created_at (cohort anchor)
      pred_times        list[datetime]  — every prediction (ascending)
      pred_count        int
      login_times       list[datetime]  — deduplicated logins (ascending)
      login_count       int
      logout_times      list[datetime]
      logout_count      int
      notif_count       int             — all notifications addressed to user
      calendar_views    int             — calendar_opened events
      calendar_times    list[datetime]  — calendar_opened timestamps
      history_views     int             — prediction_history_opened events
      prediction_views  int             — prediction_*_viewed events
      notif_times       list[datetime]  — notifications received (any type)
      counts_by_type    dict[str, int]  — canonical per-event-type counts
      meaningful_times  list[datetime]  — merged meaningful activity
      activity_days     int             — distinct calendar days with activity
      last_active       datetime | None
    """
    if profiles is None:
        profiles = _all_profiles()

    metrics: dict[str, dict] = {}

    def _entry(uid: str) -> dict:
        return metrics.setdefault(uid, {
            "profile": {},
            "registered": None,
            "pred_times": [],
            "login_times": [],
            "logout_times": [],
            "notif_count": 0,
            "notif_times": [],
            "calendar_views": 0,
            "calendar_times": [],
            "history_views": 0,
            "prediction_views": 0,
            "counts_by_type": {},
            "meaningful_times": [],
        })

    # 1. Registration anchors (cohort source)
    for p in profiles:
        uid = str(p.get("id") or "")
        if uid:
            entry = _entry(uid)
            entry["profile"] = p
            entry["registered"] = _parse_dt(p.get("created_at"))

    # 2. Predictions
    for row in _all_predictions_slim():
        uid = str(row.get("user_id") or "")
        dt  = _parse_dt(row.get("created_at"))
        if uid and dt:
            _entry(uid)["pred_times"].append(dt)

    # 3. user_activity rows (server + client events)
    for row in fetch_activity_rows():
        uid = str(row.get("user_id") or "")
        dt  = _parse_dt(row.get("created_at"))
        if not uid or not dt:
            continue
        evt = canonical_event_type(str(row.get("event_type") or ""))
        entry = _entry(uid)
        entry["counts_by_type"][evt] = entry["counts_by_type"].get(evt, 0) + 1
        if evt == "user_login":
            entry["login_times"].append(dt)
        elif evt == "user_logout":
            entry["logout_times"].append(dt)
        elif evt == "calendar_opened":
            entry["calendar_times"].append(dt)
        elif evt == "prediction_history_opened":
            entry["history_views"] += 1
        elif evt in ("prediction_viewed", "prediction_completed_viewed"):
            entry["prediction_views"] += 1
        if evt in MEANINGFUL_EVENT_TYPES and evt != "user_login":
            entry["meaningful_times"].append(dt)

    # 4. Notifications — every row counts as a received notification; the
    #    historical login signal lives in type='login' rows written by the
    #    auth service on each successful password/admin login.
    for row in _all_notifications_minimal():
        uid = str(row.get("user_id") or "")
        if not uid:
            continue
        entry = _entry(uid)
        dt = _parse_dt(row.get("created_at"))
        if dt:
            entry["notif_times"].append(dt)
        if str(row.get("type") or "").lower() == "login" and dt:
            entry["login_times"].append(dt)

    # Finalize aggregates
    for entry in metrics.values():
        entry["pred_times"].sort()
        entry["login_times"] = _collapse_login_times(entry["login_times"])
        entry["logout_times"].sort()
        entry["meaningful_times"].extend(entry["login_times"])
        entry["meaningful_times"].sort()
        entry["pred_count"]     = len(entry["pred_times"])
        entry["login_count"]    = len(entry["login_times"])
        entry["logout_count"]   = len(entry["logout_times"])
        entry["calendar_views"] = len(entry["calendar_times"])
        entry["notif_count"]    = len(entry["notif_times"])
        entry["activity_days"]  = len({t.date() for t in entry["meaningful_times"]})
        entry["last_active"]   = entry["meaningful_times"][-1] if entry["meaningful_times"] else None

    return metrics


# ── Pydantic models ───────────────────────────────────────────────────────────

class RetentionSummary(BaseModel):
    total_users: int
    active_today: int
    active_this_week: int
    active_this_month: int
    new_today: int
    new_this_week: int
    new_this_month: int
    total_change_pct: float
    active_today_change_pct: float
    active_week_change_pct: float
    active_month_change_pct: float
    new_today_change_pct: float
    new_week_change_pct: float
    new_month_change_pct: float


class RetentionRate(BaseModel):
    label: str           # "D1", "D7", "D14", "D30"
    rate: float          # 0–100
    cohort_size: int


class RetentionTrend(BaseModel):
    rates: list[RetentionRate]


class ActivityUser(BaseModel):
    id: str
    name: str
    email: str
    registered: str
    last_active: Optional[str]
    predictions: int
    logins: int = 0
    notifications: int = 0
    status: str
    avatar_url: Optional[str] = None


class ActivityUsersResponse(BaseModel):
    users: list[ActivityUser]
    total: int


class SeverityCount(BaseModel):
    low_healthy: int
    medium: int
    high_critical: int


class LatestPrediction(BaseModel):
    id: str
    disease: str
    confidence_pct: float
    image_url: Optional[str]
    created_at: str
    created_at_iso: Optional[str] = None


class WheatSummary(BaseModel):
    period_days: int
    total_predictions: int
    severity: SeverityCount
    reminders: int = 0
    latest: Optional[LatestPrediction]


# ── GET /api/v1/admin/retention/summary ──────────────────────────────────────

@router.get(
    "/summary",
    response_model=RetentionSummary,
    status_code=status.HTTP_200_OK,
    summary="KPI summary cards",
)
async def retention_summary(
    days: int = Query(default=30, ge=7, le=365, description="Period in days (7/30/90/365)"),
) -> RetentionSummary:
    now   = _now_utc()
    today_start = _start_of_day(now)
    week_start  = today_start - timedelta(days=6)
    month_start = today_start - timedelta(days=days - 1)

    prev_month_start = month_start - timedelta(days=days)
    prev_month_end   = month_start - timedelta(seconds=1)

    profiles     = _all_profiles()
    total_users  = len(profiles)

    # ── Active users: ≥1 MEANINGFUL activity in the window (multi-source) ────
    metrics = _metrics_by_user(now, profiles=profiles)

    def _active_between(start: datetime, end: datetime) -> int:
        return sum(
            1 for m in metrics.values()
            if any(start <= t <= end for t in m["meaningful_times"])
        )

    active_today = _active_between(today_start, now)
    active_week  = _active_between(week_start, now)
    active_month = _active_between(month_start, now)

    # Previous period active users for % change
    prev_month_end_dt = month_start - timedelta(seconds=1)
    prev_week_start   = prev_month_end_dt.replace(hour=0, minute=0, second=0) - timedelta(days=6)
    prev_today_start  = prev_month_end_dt.replace(hour=0, minute=0, second=0)

    prev_active_today = _active_between(prev_today_start, prev_month_end)
    prev_active_week  = _active_between(prev_week_start, prev_month_end)
    prev_active_month = _active_between(prev_month_start, prev_month_end)

    # ── New users in period ───────────────────────────────────────────────────
    def _new_in(start: datetime, end: datetime) -> int:
        count = 0
        for p in profiles:
            dt = _parse_dt(p.get("created_at"))
            if dt and start <= dt <= end:
                count += 1
        return count

    new_today = _new_in(today_start, now)
    new_week  = _new_in(week_start, now)
    new_month = _new_in(month_start, now)

    prev_new_today = _new_in(prev_today_start, prev_month_end_dt)
    prev_new_week  = _new_in(prev_week_start,  prev_month_end_dt)
    prev_new_month = _new_in(prev_month_start, prev_month_end_dt)

    prev_total = max(0, total_users - new_month)

    return RetentionSummary(
        total_users=total_users,
        active_today=active_today,
        active_this_week=active_week,
        active_this_month=active_month,
        new_today=new_today,
        new_this_week=new_week,
        new_this_month=new_month,
        total_change_pct=_pct_change(total_users, prev_total),
        active_today_change_pct=_pct_change(active_today, prev_active_today),
        active_week_change_pct=_pct_change(active_week,  prev_active_week),
        active_month_change_pct=_pct_change(active_month, prev_active_month),
        new_today_change_pct=_pct_change(new_today, prev_new_today),
        new_week_change_pct=_pct_change(new_week,  prev_new_week),
        new_month_change_pct=_pct_change(new_month, prev_new_month),
    )


# ── GET /api/v1/admin/retention/trend ────────────────────────────────────────

@router.get(
    "/trend",
    response_model=RetentionTrend,
    status_code=status.HTTP_200_OK,
    summary="D1/D7/D14/D30 cohort retention curve",
)
async def retention_trend() -> RetentionTrend:
    """
    Registration-anchored D1/D7/D14/D30 cohort retention.

    Cohort = every user whose registration anchor (profiles.created_at) is at
    least 31 days old, so all four windows have fully elapsed — a user who
    registered yesterday must not drag D30 down.

    "Retained at DN" = at least one MEANINGFUL activity event (login, make
    prediction, view prediction, open calendar, view history, notification
    use) inside [registered + (N-1)d, registered + (N+1)d]. Registration
    itself never counts as a return.
    """
    now = _now_utc()
    metrics = _metrics_by_user(now)

    cohort = [
        m for m in metrics.values()
        if _is_observable(m["registered"], 30, now)
    ]
    cohort_size = len(cohort)

    rates: list[RetentionRate] = []
    for label, lo, hi in RETENTION_WINDOWS:
        retained = sum(
            1 for m in cohort
            if _is_retained(m["registered"], m["meaningful_times"], lo, hi)
        )
        rate = round(retained / cohort_size * 100, 1) if cohort_size else 0.0
        rates.append(RetentionRate(label=label, rate=rate, cohort_size=cohort_size))

    return RetentionTrend(rates=rates)


# ── GET /api/v1/admin/retention/users ────────────────────────────────────────

@router.get(
    "/users",
    response_model=ActivityUsersResponse,
    status_code=status.HTTP_200_OK,
    summary="Per-user activity table for the retention page",
)
async def retention_users(
    days: int = Query(default=30, ge=7, le=365, description="Accepted for compatibility; this table shows lifetime totals"),
    limit: int = Query(default=20, ge=1, le=100),
    page: int  = Query(default=1,  ge=1),
) -> ActivityUsersResponse:
    """
    Compact "most recently active" table (bottom row of the retention page).

    Counts are lifetime totals computed by the multi-source engine; rows are
    ordered by most recent meaningful activity (never-active users last).
    Status uses the documented 4-state rules (new / active / returning /
    inactive).
    """
    now = _now_utc()
    metrics = _metrics_by_user(now)

    epoch = datetime.min.replace(tzinfo=timezone.utc)
    ordered = sorted(
        metrics.items(),
        key=lambda kv: kv[1]["last_active"] or epoch,
        reverse=True,
    )
    total = len(ordered)
    start_idx  = (page - 1) * limit
    page_items = ordered[start_idx : start_idx + limit]

    users: list[ActivityUser] = []
    for uid, m in page_items:
        profile = m["profile"]
        reg  = m["registered"]
        last = m["last_active"]
        users.append(ActivityUser(
            id=uid,
            name=str(profile.get("name") or profile.get("email") or "User"),
            email=str(profile.get("email") or ""),
            registered=reg.strftime("%b %d, %Y") if reg else "—",
            last_active=last.strftime("%b %d, %Y") if last else None,
            predictions=m["pred_count"],
            logins=m["login_count"],
            notifications=m["notif_count"],
            status=_compute_status(reg, last, m["activity_days"], now),
            avatar_url=profile.get("avatar_url") or None,
        ))

    return ActivityUsersResponse(users=users, total=total)


# ── Individual User Retention models (spec §15) ──────────────────────────────

class IndividualUser(BaseModel):
    id: str
    name: str
    email: str
    avatar_url: Optional[str] = None
    registered: str              # formatted "Sep 25, 2026"
    registered_iso: str
    last_login: Optional[str]
    last_logout: Optional[str]
    last_active: Optional[str]
    last_active_iso: Optional[str]
    total_sessions: int          # one session per login (documented proxy)
    logins: int
    sign_outs: int
    predictions: int             # scoped to the selected period
    calendar_views: int          # scoped to the selected period
    notifications: int           # scoped to the selected period
    retained_d1: bool
    retained_d7: bool
    retained_d14: bool
    retained_d30: bool
    d1_observable: bool
    d7_observable: bool
    d14_observable: bool
    d30_observable: bool
    status: str                  # new | active | returning | inactive


class IndividualUsersResponse(BaseModel):
    users: list[IndividualUser]
    total: int
    page: int
    page_size: int


_INDIVIDUAL_SORTS = (
    "newest", "oldest", "last_active", "most_active", "most_predictions",
    "most_logins", "highest_retention", "lowest_retention",
)
_INDIVIDUAL_STATUSES = ("all", "new", "active", "returning", "inactive")


# ── GET /api/v1/admin/retention/individual-users ─────────────────────────────

@router.get(
    "/individual-users",
    response_model=IndividualUsersResponse,
    status_code=status.HTTP_200_OK,
    summary="Individual user retention table (search/filter/sort/pagination)",
    description=(
        "Full per-user retention table. Search matches name or email. "
        "The Predictions / Calendar Views / Notifications columns are scoped "
        "to the selected period; logins, sign-outs, sessions, retention "
        "flags, last login/active and status are lifetime values. "
        "has_predictions / has_notifications filter on the same period-scoped "
        "counts shown in the table."
    ),
)
async def retention_individual_users(
    days: int = Query(default=30, ge=7, le=365),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=5, le=100),
    search: str = Query(default="", max_length=120),
    status_filter: str = Query(default="all", alias="status"),
    has_predictions: Optional[bool] = Query(default=None),
    has_notifications: Optional[bool] = Query(default=None),
    sort: str = Query(default="last_active"),
) -> IndividualUsersResponse:
    if sort not in _INDIVIDUAL_SORTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported sort '{sort}'. Use one of: {', '.join(_INDIVIDUAL_SORTS)}.",
        )
    if status_filter not in _INDIVIDUAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported status '{status_filter}'. Use one of: {', '.join(_INDIVIDUAL_STATUSES)}.",
        )

    now = _now_utc()
    period_start = _start_of_day(now - timedelta(days=days - 1))
    metrics = _metrics_by_user(now)
    needle = search.strip().lower()
    epoch = datetime.min.replace(tzinfo=timezone.utc)

    def _retention_score(m: dict) -> int:
        """How many observable retention windows this user was retained in."""
        return sum(
            1 for _label, lo, hi in RETENTION_WINDOWS
            if _is_observable(m["registered"], hi, now)
            and _is_retained(m["registered"], m["meaningful_times"], lo, hi)
        )

    # ── Filter + pre-compute sort/display values ─────────────────────────────
    filtered: list[dict] = []
    for uid, m in metrics.items():
        profile = m["profile"]
        name  = str(profile.get("name") or profile.get("email") or "User")
        email = str(profile.get("email") or "")

        if needle and needle not in name.lower() and needle not in email.lower():
            continue

        user_status = _compute_status(m["registered"], m["last_active"], m["activity_days"], now)
        if status_filter != "all" and user_status != status_filter:
            continue

        period_preds  = sum(1 for t in m["pred_times"] if t >= period_start)
        period_cals   = sum(1 for t in m["calendar_times"] if t >= period_start)
        period_notifs = sum(1 for t in m["notif_times"] if t >= period_start)

        if has_predictions is not None and (period_preds > 0) != has_predictions:
            continue
        if has_notifications is not None and (period_notifs > 0) != has_notifications:
            continue

        filtered.append({
            "uid": uid,
            "m": m,
            "status": user_status,
            "period_preds": period_preds,
            "period_cals": period_cals,
            "period_notifs": period_notifs,
            "period_activity": sum(1 for t in m["meaningful_times"] if t >= period_start),
            "retention_score": _retention_score(m),
        })

    # ── Sort ──────────────────────────────────────────────────────────────────
    def _sort_key(r: dict) -> Any:
        m = r["m"]
        if sort in ("newest", "oldest"):
            return m["registered"] or epoch
        if sort == "most_active":
            return r["period_activity"]
        if sort == "most_predictions":
            return r["period_preds"]
        if sort == "most_logins":
            return m["login_count"]
        if sort in ("highest_retention", "lowest_retention"):
            return r["retention_score"]
        return m["last_active"] or epoch   # last_active (default)

    reverse = sort not in ("oldest", "lowest_retention")
    filtered.sort(key=_sort_key, reverse=reverse)

    # ── Paginate + build rows ─────────────────────────────────────────────────
    total = len(filtered)
    start_idx  = (page - 1) * page_size
    page_items = filtered[start_idx : start_idx + page_size]

    users: list[IndividualUser] = []
    for r in page_items:
        m = r["m"]
        profile = m["profile"]
        reg  = m["registered"]
        last = m["last_active"]
        login_times = m["login_times"]
        anchor = reg or (m["pred_times"][0] if m["pred_times"] else None)

        users.append(IndividualUser(
            id=r["uid"],
            name=str(profile.get("name") or profile.get("email") or "User"),
            email=str(profile.get("email") or ""),
            avatar_url=profile.get("avatar_url") or None,
            registered=reg.strftime("%b %d, %Y") if reg else "—",
            registered_iso=reg.isoformat() if reg else "",
            last_login=login_times[-1].strftime("%b %d, %Y") if login_times else None,
            last_logout=m["logout_times"][-1].strftime("%b %d, %Y") if m["logout_times"] else None,
            last_active=last.strftime("%b %d, %Y") if last else None,
            last_active_iso=last.isoformat() if last else None,
            total_sessions=m["login_count"],
            logins=m["login_count"],
            sign_outs=m["logout_count"],
            predictions=r["period_preds"],
            calendar_views=r["period_cals"],
            notifications=r["period_notifs"],
            retained_d1=_is_retained(anchor, m["meaningful_times"], 1, 1),
            retained_d7=_is_retained(anchor, m["meaningful_times"], 6, 8),
            retained_d14=_is_retained(anchor, m["meaningful_times"], 13, 15),
            retained_d30=_is_retained(anchor, m["meaningful_times"], 29, 31),
            d1_observable=_is_observable(anchor, 1, now),
            d7_observable=_is_observable(anchor, 8, now),
            d14_observable=_is_observable(anchor, 15, now),
            d30_observable=_is_observable(anchor, 31, now),
            status=r["status"],
        ))

    return IndividualUsersResponse(users=users, total=total, page=page, page_size=page_size)


# ── New-user analytics + funnel models (spec §9 / §10) ───────────────────────

class FunnelStage(BaseModel):
    key: str
    label: str
    count: int
    pct_of_previous: float    # conversion from the previous stage
    pct_of_registered: float  # conversion from the registration base


class NewUserAnalytics(BaseModel):
    period_days: int
    new_today: int
    new_this_week: int
    new_this_month: int
    new_in_period: int
    logged_in_again: int
    made_prediction: int
    opened_calendar: int
    returned: int
    funnel: list[FunnelStage]


# ── GET /api/v1/admin/retention/new-users ────────────────────────────────────

@router.get(
    "/new-users",
    response_model=NewUserAnalytics,
    status_code=status.HTTP_200_OK,
    summary="New-user analytics + journey conversion funnel",
)
async def retention_new_users(
    days: int = Query(default=30, ge=7, le=365),
) -> NewUserAnalytics:
    """
    The funnel runs over users who REGISTERED inside the selected period
    (spec §10):

      Registration → First Login → First Prediction → First Calendar Visit
      → First Notification → Return Visit

    • "Logged in again" counts a login on a calendar day AFTER the
      registration day (the OAuth creation login happens on the
      registration day and is not a return).
    • "First Notification" counts users who opened or clicked at least one
      notification (interaction, not mere receipt).
    • "Return Visit" counts users with meaningful activity on ≥2 distinct
      calendar days.

    All numbers come from real events; empty sets yield zeros, never
    placeholder values.
    """
    now = _now_utc()
    today_start = _start_of_day(now)
    week_start  = today_start - timedelta(days=6)
    month_start = today_start - timedelta(days=days - 1)

    profiles = _all_profiles()

    new_today = new_week = new_month = 0
    for p in profiles:
        dt = _parse_dt(p.get("created_at"))
        if dt is None:
            continue
        if dt >= today_start:
            new_today += 1
        if dt >= week_start:
            new_week += 1
        if dt >= month_start:
            new_month += 1

    metrics = _metrics_by_user(now, profiles=profiles)

    period_start = _start_of_day(now - timedelta(days=days - 1))
    new_users = [
        m for m in metrics.values()
        if m["registered"] is not None and period_start <= m["registered"] <= now
    ]

    registered = len(new_users)
    first_login = first_prediction = first_calendar = first_notification = 0
    logged_in_again = returned = 0

    for m in new_users:
        reg = m["registered"]
        if reg is None:
            continue
        if any(t >= reg for t in m["login_times"]):
            first_login += 1
        if any(t.date() > reg.date() for t in m["login_times"]):
            logged_in_again += 1
        if m["pred_count"] > 0:
            first_prediction += 1
        if m["calendar_views"] > 0:
            first_calendar += 1
        interactions = (
            m["counts_by_type"].get("notification_viewed", 0)
            + m["counts_by_type"].get("notification_clicked", 0)
        )
        if interactions > 0:
            first_notification += 1
        if m["activity_days"] >= 2:
            returned += 1

    def _pct(part: int, whole: int) -> float:
        return round(part / whole * 100, 1) if whole else 0.0

    funnel = [
        FunnelStage(key="registered",         label="Registration",
                    count=registered,         pct_of_previous=100.0,
                    pct_of_registered=100.0),
        FunnelStage(key="first_login",        label="First Login",
                    count=first_login,        pct_of_previous=_pct(first_login, registered),
                    pct_of_registered=_pct(first_login, registered)),
        FunnelStage(key="first_prediction",   label="First Prediction",
                    count=first_prediction,   pct_of_previous=_pct(first_prediction, first_login),
                    pct_of_registered=_pct(first_prediction, registered)),
        FunnelStage(key="first_calendar",     label="First Calendar Visit",
                    count=first_calendar,     pct_of_previous=_pct(first_calendar, first_prediction),
                    pct_of_registered=_pct(first_calendar, registered)),
        FunnelStage(key="first_notification", label="First Notification Interaction",
                    count=first_notification, pct_of_previous=_pct(first_notification, first_calendar),
                    pct_of_registered=_pct(first_notification, registered)),
        FunnelStage(key="return_visit",       label="Return Visit",
                    count=returned,           pct_of_previous=_pct(returned, first_notification),
                    pct_of_registered=_pct(returned, registered)),
    ]

    return NewUserAnalytics(
        period_days=days,
        new_today=new_today,
        new_this_week=new_week,
        new_this_month=new_month,
        new_in_period=registered,
        logged_in_again=logged_in_again,
        made_prediction=first_prediction,
        opened_calendar=first_calendar,
        returned=returned,
        funnel=funnel,
    )


# ── GET /api/v1/admin/retention/wheat ────────────────────────────────────────

@router.get(
    "/wheat",
    response_model=WheatSummary,
    status_code=status.HTTP_200_OK,
    summary="Wheat prediction summary for the selected period",
)
async def retention_wheat(
    days: int = Query(default=30, ge=7, le=365),
) -> WheatSummary:
    now    = _now_utc()
    start  = _start_of_day(now - timedelta(days=days - 1))
    preds  = _predictions_in_range(start, now)

    low_healthy  = 0
    medium       = 0
    high_critical = 0
    for p in preds:
        sev = (p.get("severity") or "unknown").lower()
        if "high" in sev or "critical" in sev or "severe" in sev:
            high_critical += 1
        elif "medium" in sev or "moderate" in sev:
            medium += 1
        else:
            low_healthy += 1

    latest: LatestPrediction | None = None
    if preds:
        p0 = preds[0]
        dt0 = _parse_dt(p0.get("created_at"))
        latest = LatestPrediction(
            id=str(p0.get("id") or ""),
            disease=str(p0.get("predicted_class") or "Unknown").replace("_", " ").title(),
            confidence_pct=float(p0.get("confidence_pct") or 0),
            image_url=p0.get("image_url") or None,
            created_at=dt0.strftime("%b %d, %Y %I:%M %p") if dt0 else "—",
            created_at_iso=dt0.isoformat() if dt0 else None,
        )

    # Calendar reminders created during the period (best-effort)
    reminders = len(_safe_get(
        get_supabase_client(),
        "calendar_reminders",
        lambda q: q.select("id")
        .gte("created_at", start.isoformat())
        .lte("created_at", now.isoformat())
        .execute(),
    ))

    return WheatSummary(
        period_days=days,
        total_predictions=len(preds),
        severity=SeverityCount(
            low_healthy=low_healthy,
            medium=medium,
            high_critical=high_critical,
        ),
        reminders=reminders,
        latest=latest,
    )


# ── GET /api/v1/admin/retention/activity ─────────────────────────────────────

class ActivityBreakdown(BaseModel):
    period_days: int
    predictions: int
    calendar_views: int
    history_views: int
    logins: int
    notifications: int
    assistant_uses: int
    other_events: int


@router.get(
    "/activity",
    response_model=ActivityBreakdown,
    status_code=status.HTTP_200_OK,
    summary="Per-activity-type counts for the selected period",
)
async def retention_activity(
    days: int = Query(default=30, ge=7, le=365),
) -> ActivityBreakdown:
    """
    Counts for the Activity Distribution / User Engagement cards. Every number
    comes from a real event source (no synthetic estimates):

      predictions      → rows in `predictions` created in the period
      calendar_views   → `user_activity` calendar_opened rows (best-effort —
      history_views      the table only has rows once the user-facing
      assistant_uses     endpoints start recording them)
      logins           → deduplicated real logins: `user_activity` user_login
                         rows + auth-service "login" notifications, clustered
                         per user within 60 seconds (one login is written to
                         both stores)
      notifications    → `notifications` rows (excluding login-type rows)
      other_events     → remaining `user_activity` rows (logout, signup, …)
                         plus "failed_login" notifications
    """
    now   = _now_utc()
    start = _start_of_day(now - timedelta(days=days - 1))
    client = get_supabase_client()

    predictions = len(_predictions_in_range(start, now))

    calendar_views = history_views = assistant_uses = 0
    raw_activity_logins = 0
    login_stream: dict[str, list[datetime]] = {}
    activity_rows = _safe_get(
        client,
        "user_activity",
        lambda q: q.select("user_id,event_type,created_at")
        .gte("created_at", start.isoformat())
        .lte("created_at", now.isoformat())
        .execute(),
    )
    for row in activity_rows:
        evt = canonical_event_type(str(row.get("event_type") or ""))
        if evt == "calendar_opened":
            calendar_views += 1
        elif evt == "prediction_history_opened":
            history_views += 1
        elif evt == "assistant_used":
            assistant_uses += 1
        elif evt == "user_login":
            raw_activity_logins += 1
            uid = str(row.get("user_id") or "")
            dt  = _parse_dt(row.get("created_at"))
            if uid and dt:
                login_stream.setdefault(uid, []).append(dt)

    notif_other  = 0
    failed_logins = 0
    for row in _safe_get(
        client,
        "notifications",
        lambda q: q.select("user_id,type,created_at")
        .gte("created_at", start.isoformat())
        .lte("created_at", now.isoformat())
        .execute(),
    ):
        t = str(row.get("type") or "").lower()
        if t == "login":
            uid = str(row.get("user_id") or "")
            dt  = _parse_dt(row.get("created_at"))
            if uid and dt:
                login_stream.setdefault(uid, []).append(dt)
        elif t == "failed_login":
            failed_logins += 1
        else:
            notif_other += 1

    # One real login is written to BOTH stores; cluster per user within
    # LOGIN_DEDUP_SECONDS so the same login is never counted twice.
    logins = sum(len(_collapse_login_times(times)) for times in login_stream.values())

    other_events = (
        len(activity_rows)
        - calendar_views
        - history_views
        - assistant_uses
        - raw_activity_logins
    ) + failed_logins

    return ActivityBreakdown(
        period_days=days,
        predictions=predictions,
        calendar_views=calendar_views,
        history_views=history_views,
        logins=logins,
        notifications=notif_other,
        assistant_uses=assistant_uses,
        other_events=other_events,
    )


# ── Per-user detail models ────────────────────────────────────────────────────

class UserPredictionDetail(BaseModel):
    id: str
    disease: str
    confidence_pct: float
    severity: str
    image_url: Optional[str]
    created_at: str
    created_date: str   # YYYY-MM-DD local
    created_time: str   # e.g. "04:35 PM"


class ActivityEvent(BaseModel):
    event_type: str          # signup | prediction_created | user_login | user_logout | …
    label: str               # human-readable label
    timestamp: str           # ISO string
    display_time: str        # e.g. "Sep 25, 2026 · 04:35 PM"
    prediction_id: Optional[str] = None
    disease: Optional[str]   = None
    severity: Optional[str]  = None
    confidence_pct: Optional[float] = None
    image_url: Optional[str] = None


class UserRetentionDetail(BaseModel):
    # ── Identity ──────────────────────────────────────────────────────────────
    id: str
    name: str
    email: str
    organization: str
    email_verified: bool = False
    registered: str          # formatted date
    registered_iso: str      # ISO for sorting
    status: str              # new | active | returning | inactive
    avatar_url: Optional[str]
    # ── Aggregates ────────────────────────────────────────────────────────────
    total_predictions: int
    predictions_this_week: int = 0
    predictions_this_month: int = 0
    first_prediction_at: Optional[str]
    last_prediction_at: Optional[str]
    days_since_last_active: Optional[int]
    # ── Engagement (all four sources) ─────────────────────────────────────────
    first_login_at: Optional[str] = None
    last_login_at: Optional[str] = None
    last_logout_at: Optional[str] = None
    last_active: Optional[str] = None
    last_active_iso: Optional[str] = None
    logins: int = 0
    sign_outs: int = 0
    sessions: int = 0            # one login starts one session (documented proxy)
    calendar_views: int = 0
    history_views: int = 0
    prediction_views: int = 0
    notifications: int = 0
    days_active: int = 0
    # ── Retention flags + observability ───────────────────────────────────────
    retained_d1: bool
    retained_d7: bool
    retained_d14: bool
    retained_d30: bool
    d1_observable: bool = False
    d7_observable: bool = False
    d14_observable: bool = False
    d30_observable: bool = False
    # ── Lists ─────────────────────────────────────────────────────────────────
    predictions: list[UserPredictionDetail]
    timeline: list[ActivityEvent]     # merged chronological log


# ── GET /api/v1/admin/retention/users/{user_id} ───────────────────────────────

@router.get(
    "/users/{user_id}",
    response_model=UserRetentionDetail,
    status_code=status.HTTP_200_OK,
    summary="Full retention detail for a single user",
)
async def retention_user_detail(user_id: str) -> UserRetentionDetail:
    """
    Full retention detail for one user — powers the admin individual-user page.

    Combines the four data sources:
      • profile       → identity + registration anchor
      • predictions   → full prediction list + timestamps
      • user_activity → calendar/history/notification/prediction-view events,
                        logins & logouts (activity tracking since it went live)
      • notifications → received count + historical login signal (type='login')

    Logins from the activity store and the notification stream are merged with
    60-second clustering so one login is counted (and shown) exactly once.
    Sessions are defined as logins (each login starts a session); sign-outs
    are explicit logout events only.
    """
    client = get_supabase_client()
    now = _now_utc()
    fmt = "%b %d, %Y · %I:%M %p"

    # ── 1. Profile ────────────────────────────────────────────────────────────
    profile: dict = {}
    try:
        resp = (
            client.table("profiles")
            .select("id,name,email,organization_name,email_verified,created_at,avatar_url")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        profile = resp.data or {}
    except Exception as exc:
        # Older databases may lack newer profile columns (e.g. avatar_url).
        try:
            resp = (
                client.table("profiles")
                .select("*")
                .eq("id", user_id)
                .maybe_single()
                .execute()
            )
            profile = resp.data or {}
            _warn_once(
                "profiles:reduced-columns",
                "retention: profiles read via select(*) — extended column(s) "
                f"unavailable ({exc}); run supabase/schema.sql to add them.",
            )
        except Exception as exc2:
            logger.warning("retention detail: profiles query failed: %s", exc2)

    # ── 2. All predictions for this user ──────────────────────────────────────
    raw_preds: list[dict] = []
    try:
        resp2 = (
            client.table("predictions")
            .select("id,predicted_class,confidence_pct,severity,image_url,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        raw_preds = resp2.data or []
    except Exception as exc:
        logger.warning("retention detail: predictions query failed: %s", exc)

    # ── 3. user_activity rows (best-effort; column fallback handled inside) ───
    raw_activity = fetch_activity_rows(user_ids=[user_id], ascending=True)

    # ── 4. Notifications (received count + login signal) ──────────────────────
    raw_notifs = _safe_get(
        client,
        "notifications",
        lambda q: q.select("type,created_at").eq("user_id", user_id).execute(),
    )

    # ── 5. Build prediction list + timestamps ─────────────────────────────────
    pred_details: list[UserPredictionDetail] = []
    pred_times: list[datetime] = []
    for p in raw_preds:
        dt = _parse_dt(p.get("created_at"))
        if dt:
            pred_times.append(dt)
        pred_details.append(UserPredictionDetail(
            id=str(p.get("id") or ""),
            disease=str(p.get("predicted_class") or "Unknown").replace("_", " ").title(),
            confidence_pct=float(p.get("confidence_pct") or 0),
            severity=str(p.get("severity") or "unknown"),
            image_url=p.get("image_url") or None,
            created_at=str(p.get("created_at") or ""),
            created_date=dt.strftime("%b %d, %Y") if dt else "—",
            created_time=dt.strftime("%I:%M %p") if dt else "—",
        ))

    # ── 6. Activity aggregates (canonical event types) ────────────────────────
    activity_login_times: list[datetime] = []
    notif_login_times: list[datetime] = []
    logout_times: list[datetime] = []
    calendar_views = history_views = prediction_views = 0
    for a in raw_activity:
        evt = canonical_event_type(str(a.get("event_type") or ""))
        dt  = _parse_dt(a.get("created_at"))
        if not dt:
            continue
        if evt == "user_login":
            activity_login_times.append(dt)
        elif evt == "user_logout":
            logout_times.append(dt)
        elif evt == "calendar_opened":
            calendar_views += 1
        elif evt == "prediction_history_opened":
            history_views += 1
        elif evt in ("prediction_viewed", "prediction_completed_viewed"):
            prediction_views += 1

    for n in raw_notifs:
        if str(n.get("type") or "").lower() == "login":
            dt = _parse_dt(n.get("created_at"))
            if dt:
                notif_login_times.append(dt)

    login_times  = _collapse_login_times(activity_login_times + notif_login_times)
    logout_times.sort()

    # ── 7. Meaningful activity, status, retention (spec §6 / §8) ──────────────
    reg_dt = _parse_dt(profile.get("created_at"))
    first_pred = min(pred_times) if pred_times else None
    last_pred  = max(pred_times) if pred_times else None
    anchor = reg_dt or first_pred

    meaningful_times = _collect_meaningful_times(pred_times, raw_activity, login_times)
    activity_days = len({t.date() for t in meaningful_times})
    last_active = meaningful_times[-1] if meaningful_times else None
    user_status = _compute_status(reg_dt, last_active, activity_days, now)
    days_since = (now - last_active).days if last_active else None

    # ── 8. Timeline (oldest → newest; duplicates are skipped by construction)
    timeline: list[ActivityEvent] = []

    # a) Signup — from the profile anchor (user_registered rows skipped below)
    if reg_dt:
        timeline.append(ActivityEvent(
            event_type="signup",
            label="Account registered",
            timestamp=reg_dt.isoformat(),
            display_time=reg_dt.strftime(fmt),
        ))

    # b) Predictions (the predictions table is the canonical source)
    for p in reversed(raw_preds):   # oldest first for timeline
        dt = _parse_dt(p.get("created_at"))
        if not dt:
            continue
        sev = str(p.get("severity") or "unknown")
        disease = str(p.get("predicted_class") or "Unknown").replace("_", " ").title()
        timeline.append(ActivityEvent(
            event_type="prediction_created",
            label=f"Prediction: {disease}",
            timestamp=dt.isoformat(),
            display_time=dt.strftime(fmt),
            prediction_id=str(p.get("id") or ""),
            disease=disease,
            severity=sev,
            confidence_pct=float(p.get("confidence_pct") or 0),
            image_url=p.get("image_url") or None,
        ))

    # c) Deduplicated logins (one entry per real login across both stores)
    for dt in login_times:
        timeline.append(ActivityEvent(
            event_type="user_login",
            label="Logged in",
            timestamp=dt.isoformat(),
            display_time=dt.strftime(fmt),
        ))

    # d) Remaining activity rows (events already represented above are skipped)
    skip_events = {"prediction_created", "user_registered", "user_login"}
    label_map = {
        "user_logout":                 "Logged out",
        "calendar_opened":             "Opened calendar",
        "prediction_history_opened":   "Viewed prediction history",
        "prediction_viewed":           "Viewed a prediction",
        "prediction_completed_viewed": "Viewed full prediction report",
        "notification_viewed":         "Viewed a notification",
        "notification_clicked":        "Clicked a notification",
        "assistant_used":              "Used AI assistant",
        "profile_viewed":              "Viewed profile",
        "settings_viewed":             "Viewed settings",
    }
    for a in raw_activity:
        evt = canonical_event_type(str(a.get("event_type") or ""))
        if not evt or evt in skip_events:
            continue
        dt = _parse_dt(a.get("created_at"))
        if not dt:
            continue
        timeline.append(ActivityEvent(
            event_type=evt,
            label=label_map.get(evt, evt.replace("_", " ").capitalize()),
            timestamp=dt.isoformat(),
            display_time=dt.strftime(fmt),
        ))

    epoch = datetime.min.replace(tzinfo=timezone.utc)
    timeline.sort(key=lambda e: _parse_dt(e.timestamp) or epoch)

    # ── 9. Assemble ───────────────────────────────────────────────────────────
    week_ago  = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    return UserRetentionDetail(
        id=user_id,
        name=str(profile.get("name") or profile.get("email") or "User"),
        email=str(profile.get("email") or ""),
        organization=str(profile.get("organization_name") or ""),
        email_verified=bool(profile.get("email_verified")),
        registered=reg_dt.strftime("%b %d, %Y") if reg_dt else "—",
        registered_iso=reg_dt.isoformat() if reg_dt else "",
        status=user_status,
        avatar_url=profile.get("avatar_url") or None,
        total_predictions=len(raw_preds),
        predictions_this_week=sum(1 for t in pred_times if t >= week_ago),
        predictions_this_month=sum(1 for t in pred_times if t >= month_ago),
        first_prediction_at=first_pred.strftime(fmt) if first_pred else None,
        last_prediction_at=last_pred.strftime(fmt) if last_pred else None,
        days_since_last_active=days_since,
        first_login_at=login_times[0].strftime(fmt) if login_times else None,
        last_login_at=login_times[-1].strftime(fmt) if login_times else None,
        last_logout_at=logout_times[-1].strftime(fmt) if logout_times else None,
        last_active=last_active.strftime(fmt) if last_active else None,
        last_active_iso=last_active.isoformat() if last_active else None,
        logins=len(login_times),
        sign_outs=len(logout_times),
        sessions=len(login_times),   # one login starts one session (documented proxy)
        calendar_views=calendar_views,
        history_views=history_views,
        prediction_views=prediction_views,
        notifications=len(raw_notifs),
        days_active=activity_days,
        retained_d1=_is_retained(anchor, meaningful_times, 1, 1),
        retained_d7=_is_retained(anchor, meaningful_times, 6, 8),
        retained_d14=_is_retained(anchor, meaningful_times, 13, 15),
        retained_d30=_is_retained(anchor, meaningful_times, 29, 31),
        d1_observable=_is_observable(anchor, 1, now),
        d7_observable=_is_observable(anchor, 8, now),
        d14_observable=_is_observable(anchor, 15, now),
        d30_observable=_is_observable(anchor, 31, now),
        predictions=pred_details,
        timeline=timeline,
    )
