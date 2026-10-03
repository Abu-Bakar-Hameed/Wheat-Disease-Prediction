# WheatGuard AI – Notification System: Technical Design

> Satisfies all requirements in `requirements.md`.

---

## 1. Data Model

### 1.1 New database table — `notifications`

Add to `back/supabase/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL,                  -- FK → app_users.auth_user_id
    type        TEXT        NOT NULL                   -- 'prediction'|'weather'|'report'|'system'
                            CHECK (type IN ('prediction','weather','report','system')),
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL DEFAULT '',
    severity    TEXT        NOT NULL DEFAULT 'none'    -- mirrors SeverityLevel
                            CHECK (severity IN ('none','moderate','high','critical','unknown')),
    read        BOOLEAN     NOT NULL DEFAULT FALSE,
    link        TEXT,                                  -- optional deep-link path
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications (user_id, read)
    WHERE read = FALSE;

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
```

### 1.2 New database table — `notification_preferences`

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id         UUID    PRIMARY KEY,   -- FK → app_users.auth_user_id
    high_risk       BOOLEAN NOT NULL DEFAULT TRUE,
    daily_digest    BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_email    BOOLEAN NOT NULL DEFAULT FALSE,
    weather_warnings BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;
```

---

## 2. Backend — New / Changed Files

### 2.1 `back/app/database/notification_crud.py` (new)

```python
# Functions needed:
def create_notification(user_id, type, title, body, severity, link=None) -> dict
def list_notifications(user_id, limit=20, offset=0) -> tuple[list[dict], int]
def get_unread_count(user_id) -> int
def mark_read(notification_id, user_id) -> bool        # returns False if not found/not owner
def mark_all_read(user_id) -> int                       # returns count updated
def get_preferences(user_id) -> dict                    # returns defaults if row absent
def save_preferences(user_id, prefs: dict) -> dict
```

### 2.2 `back/app/api/routes/notifications.py` (new)

All routes on this router require a valid user JWT (existing `require_user` dependency).

| Method | Path | Request | Response | AC |
|---|---|---|---|---|
| `GET` | `/api/v1/notifications` | `?limit=20&offset=0` | `{ items: Notification[], total: int, unread: int }` | AC-5.2 |
| `GET` | `/api/v1/notifications/unread-count` | — | `{ unread: int }` | AC-5.1, AC-5.6 |
| `PATCH` | `/api/v1/notifications/{id}/read` | — | `{ ok: bool }` | AC-5.3 |
| `POST` | `/api/v1/notifications/read-all` | — | `{ updated: int }` | AC-5.4 |
| `GET` | `/api/v1/notifications/preferences` | — | `NotificationPreferences` | AC-6.2 |
| `PUT` | `/api/v1/notifications/preferences` | `NotificationPreferences` | `NotificationPreferences` | AC-6.1 |

### 2.3 `back/app/api/routes/admin.py` (addition)

Add two admin-only endpoints:

| Method | Path | Request | Response | AC |
|---|---|---|---|---|
| `POST` | `/api/v1/admin/notifications/broadcast` | `{ title, body, user_ids?: string[] }` | `{ created: int }` | AC-4.1, AC-4.3 |
| `POST` | `/api/v1/weather/risk/check` | `{ user_id?: string }` | `{ notifications_created: int }` | AC-2.1 |

> **`POST /api/v1/weather/risk/check`** — Calls the existing `_current()` helper in
> `weather.py`, computes the max infection risk across `disease_risks`, then for each
> user (or the specified one) that has `weather_warnings=True` and has not received a
> weather notification in the last 6 hours, creates a notification.

### 2.4 Hook into `prediction.py` (change)

After the existing prediction-save logic in `POST /api/v1/predict`, add:

```python
# After: record = crud.save_prediction(...)
if record.severity in ("high", "critical"):
    prefs = notification_crud.get_preferences(record.user_id)
    if prefs.get("high_risk", True):
        notification_crud.create_notification(
            user_id  = record.user_id,
            type     = "prediction",
            severity = record.severity,
            title    = "High-Risk Disease Detected",
            body     = f"{record.predicted_class} detected with {record.confidence_pct:.1f}% confidence.",
            link     = f"/dashboard/history?id={record.id}",
        )
        admin_crud.add_audit(
            level="INFO",
            event_type="NOTIFICATION_CREATED",
            message=f"Notification created for user {record.user_id}: {record.predicted_class} ({record.severity})",
        )
```

### 2.5 Register new router in `main.py`

```python
from app.api.routes import notifications  # new
# …
app.include_router(notifications.router)  # /api/v1/notifications/*
```

---

## 3. TypeScript Types (`src/types/index.ts` additions)

```typescript
export type NotificationType = "prediction" | "weather" | "report" | "system";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  severity: SeverityLevel;
  read: boolean;
  link: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
  unread: number;
}

export interface UnreadCountResponse {
  unread: number;
}

export interface NotificationPreferences {
  high_risk: boolean;
  daily_digest: boolean;
  weekly_email: boolean;
  weather_warnings: boolean;
}
```

---

## 4. API Client (`src/lib/api.ts` additions)

```typescript
// ── Notifications ─────────────────────────────────────────────────────────────

export async function fetchNotifications(limit = 20, offset = 0): Promise<NotificationsResponse> {
  try {
    const { data } = await apiClient.get<NotificationsResponse>("/api/v1/notifications", {
      params: { limit, offset },
    });
    return data;
  } catch (e) { norm(e); }
}

export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  try {
    const { data } = await apiClient.get<UnreadCountResponse>("/api/v1/notifications/unread-count");
    return data;
  } catch (e) { norm(e); }
}

export async function markNotificationRead(id: string): Promise<void> {
  try { await apiClient.patch(`/api/v1/notifications/${id}/read`); }
  catch (e) { norm(e); }
}

export async function markAllNotificationsRead(): Promise<void> {
  try { await apiClient.post("/api/v1/notifications/read-all"); }
  catch (e) { norm(e); }
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const { data } = await apiClient.get<NotificationPreferences>("/api/v1/notifications/preferences");
    return data;
  } catch (e) { norm(e); }
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
  try {
    const { data } = await apiClient.put<NotificationPreferences>("/api/v1/notifications/preferences", prefs);
    return data;
  } catch (e) { norm(e); }
}

// Admin
export async function broadcastNotification(payload: {
  title: string;
  body: string;
  user_ids?: string[];
}): Promise<{ created: number }> {
  try {
    const { data } = await apiClient.post("/api/v1/admin/notifications/broadcast", payload);
    return data;
  } catch (e) { norm(e); }
}
```

---

## 5. Frontend Component Breakdown

### 5.1 New: `src/components/wg/NotificationBell.tsx`

A self-contained component extracted from `UserTopBar.tsx` that owns all
notification state and rendering. **Replaces** the inline hardcoded flyout in `UserTopBar`.

```
Props: none (reads auth from useAuth() internally)

State:
  open: boolean
  notifications: NotificationItem[]
  unreadCount: number
  loading: boolean
  error: string

Behaviour:
  - On mount: fetchNotifications() + fetchUnreadCount()
  - Polling: setInterval(fetchUnreadCount, 60_000) while document.visibilityState === 'visible'
    // TODO: Replace interval with WebSocket/SSE subscription when realtime layer is added
  - Click notification row: markNotificationRead(id), navigate to link, optimistic decrement
  - "Mark all as read": markAllNotificationsRead(), set unreadCount=0

Bell icon renders:
  - Red numeric badge when unreadCount > 0 — hidden when 0
  - Badge content: unreadCount > 9 ? "9+" : String(unreadCount)
```

Notification row renders by type:
| type | dot colour | icon |
|---|---|---|
| `prediction` | `#dc2626` | `coronavirus` |
| `weather` | `#d97706` | `thunderstorm` |
| `report` | `#2563eb` | `description` |
| `system` | `#6b7280` | `info` |

Unread item: bold title, `bg-[#f0fdf4]` row background.  
Read item: normal weight, white background.

### 5.2 Changed: `src/components/wg/UserTopBar.tsx`

Remove the inline hardcoded notification block. Import and render `<NotificationBell />` in its place:

```diff
- import { useState } from "react";          // keep for menuOpen
+ import { useState } from "react";
+ import { NotificationBell } from "./NotificationBell";

// In JSX, replace the entire <div className="relative"> notification block with:
+ <NotificationBell />
```

### 5.3 Changed: `src/components/wg/Header.tsx`

The public marketing header also has a hardcoded flyout. Since this shows for
unauthenticated users, notifications are **not applicable** — replace the hardcoded
flyout with the bell icon only (no badge, no dropdown) until a user logs in, at which
point `Header.tsx` is not rendered anyway (the dashboard uses `UserTopBar`). Remove
the hardcoded items and the "3 New" badge; keep only the bell button with no badge.

### 5.4 Changed: `src/components/wg/views/SettingsView.tsx`

Add server-sync to the four notification toggles:

```typescript
// On mount — load from API, fallback to localStorage
useEffect(() => {
  fetchNotificationPreferences()
    .then(prefs => setSettings(prev => ({
      ...prev,
      notifications: {
        highRisk:        prefs.high_risk,
        dailyDigest:     prefs.daily_digest,
        weeklyEmail:     prefs.weekly_email,
        weatherWarnings: prefs.weather_warnings,
      }
    })))
    .catch(() => {
      // fall back to localStorage — already loaded in existing effect
    });
}, []);

// In savePreferences() — call API first, then localStorage as cache
const savePreferences = async () => {
  try {
    await saveNotificationPreferences({
      high_risk:       settings.notifications.highRisk,
      daily_digest:    settings.notifications.dailyDigest,
      weekly_email:    settings.notifications.weeklyEmail,
      weather_warnings:settings.notifications.weatherWarnings,
    });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); // local cache
    setSaved(true);
  } catch {
    setSaved(false);
    // show inline error
  }
};
```

Add a note next to `weeklyEmail` and `dailyDigest` toggles:
> "Email delivery — **backend: TODO** (email-sending service not yet connected)"

---

## 6. Polling Strategy

The component uses `setInterval` at **60 seconds** on the lightweight
`/unread-count` endpoint (single integer, minimal DB cost). Full notification list
is fetched only when the dropdown opens.

```typescript
// In NotificationBell.tsx
useEffect(() => {
  const tick = () => {
    if (document.visibilityState === "visible") {
      fetchUnreadCount()
        .then(r => setUnreadCount(r.unread))
        .catch(() => {});
    }
  };
  const id = setInterval(tick, 60_000);
  document.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", tick);
  };
}, []);

// TODO: Replace setInterval above with a WebSocket or SSE subscription
// (e.g. Supabase Realtime channel on the notifications table filtered by user_id)
// when a realtime layer is added to the project.
```

---

## 7. Admin Visibility

No new UI needed. Notification creation calls `admin_crud.add_audit(level="INFO", event_type="NOTIFICATION_CREATED", ...)`. The existing `LogsPage` filter for `info` level surfaces these entries. Broadcast events use `event_type="NOTIFICATION_BROADCAST"`.

---

## 8. What Is Explicitly Stubbed / Deferred

| Feature | Status | Where to find the stub |
|---|---|---|
| Email delivery for `dailyDigest` / `weeklyEmail` | **backend: TODO** — preferences stored but no email job exists | `SettingsView.tsx` toggle labels + `notification_crud.py` comment |
| Scheduled weather check (cron/job) | **backend: TODO** — endpoint callable manually, not scheduled | `POST /api/v1/weather/risk/check` docstring |
| WebSocket/SSE real-time push | **deferred** — polling used instead | `NotificationBell.tsx` `TODO` comment on `setInterval` |
| Mobile push notifications | **out of scope** | — |
