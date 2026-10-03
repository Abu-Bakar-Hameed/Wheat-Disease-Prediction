# WheatGuard AI – Notification System: Task List

> Each task is independently executable. Complete them in order — later tasks
> depend on earlier ones. Every task references the requirement(s) it satisfies.
> **Backend: TODO** items are called out explicitly and must not be faked.

---

## Phase 1 — Database Schema

### Task 1 — Add `notifications` table to Supabase schema
**Satisfies:** AC-1.1, AC-2.1, AC-3.1, AC-4.3, AC-5.1  
**File:** `back/supabase/schema.sql`

Append the following SQL (inside an `IF NOT EXISTS` guard for idempotency):

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL,
    type        TEXT        NOT NULL
                            CHECK (type IN ('prediction','weather','report','system')),
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL DEFAULT '',
    severity    TEXT        NOT NULL DEFAULT 'none'
                            CHECK (severity IN ('none','moderate','high','critical','unknown')),
    read        BOOLEAN     NOT NULL DEFAULT FALSE,
    link        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications (user_id, read)
    WHERE read = FALSE;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
```

Then run this SQL in your Supabase dashboard SQL Editor.

---

### Task 2 — Add `notification_preferences` table to Supabase schema
**Satisfies:** AC-6.1, AC-6.2, AC-6.3  
**File:** `back/supabase/schema.sql`

Append after Task 1 SQL:

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id          UUID    PRIMARY KEY,
    high_risk        BOOLEAN NOT NULL DEFAULT TRUE,
    daily_digest     BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_email     BOOLEAN NOT NULL DEFAULT FALSE,
    weather_warnings BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;
```

Run in Supabase dashboard.

---

## Phase 2 — Backend CRUD

### Task 3 — Create `notification_crud.py`
**Satisfies:** AC-1.1, AC-1.3, AC-2.1, AC-4.1, AC-5.2, AC-5.3, AC-5.4, AC-6.1, AC-6.2, AC-6.3  
**File:** `back/app/database/notification_crud.py` (create new)

Implement these functions using the existing Supabase client pattern from `admin_crud.py`:

```python
def create_notification(user_id, type_, title, body, severity="none", link=None) -> dict
    # INSERT INTO notifications …; return the created row as dict

def list_notifications(user_id, limit=20, offset=0) -> tuple[list[dict], int]
    # SELECT … WHERE user_id=… ORDER BY created_at DESC LIMIT … OFFSET …

def get_unread_count(user_id) -> int
    # SELECT count(*) FROM notifications WHERE user_id=… AND read=FALSE

def mark_read(notification_id, user_id) -> bool
    # UPDATE notifications SET read=TRUE WHERE id=… AND user_id=…; return found

def mark_all_read(user_id) -> int
    # UPDATE notifications SET read=TRUE WHERE user_id=… AND read=FALSE; return count

def get_preferences(user_id) -> dict
    # SELECT * FROM notification_preferences WHERE user_id=…
    # Return defaults {high_risk:True, daily_digest:True, weekly_email:False, weather_warnings:True}
    # if no row exists (never raise — missing prefs = use defaults)

def save_preferences(user_id, prefs: dict) -> dict
    # UPSERT into notification_preferences … ON CONFLICT(user_id) DO UPDATE SET …
```

---

## Phase 3 — Backend API Routes

### Task 4 — Create `notifications.py` route module
**Satisfies:** US-5, US-6, AC-5.1–5.7, AC-6.1–6.3  
**File:** `back/app/api/routes/notifications.py` (create new)

```python
router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])
# All routes: Depends(require_user)  — use the existing auth dependency

# Pydantic schemas:
class NotificationItem(BaseModel):
    id: str; user_id: str; type: str; title: str; body: str
    severity: str; read: bool; link: Optional[str]; created_at: str

class NotificationsResponse(BaseModel):
    items: List[NotificationItem]; total: int; unread: int

class NotificationPreferences(BaseModel):
    high_risk: bool = True; daily_digest: bool = True
    weekly_email: bool = False; weather_warnings: bool = True

# Endpoints:
GET  /                    → NotificationsResponse
GET  /unread-count        → { "unread": int }
PATCH /{id}/read          → { "ok": bool }
POST /read-all            → { "updated": int }
GET  /preferences         → NotificationPreferences
PUT  /preferences         → NotificationPreferences (body)
```

Each handler reads `user_id` from the decoded JWT token (same pattern as
existing history routes that use `current_user` from `require_user`).

---

### Task 5 — Register `notifications.py` router in `main.py`
**Satisfies:** Task 4 above being reachable  
**File:** `back/app/main.py`

```python
from app.api.routes import notifications   # add to import line
# …
app.include_router(notifications.router)  # add after existing routers
```

Restart the server and verify `GET /api/v1/notifications/unread-count` returns
`{"unread": 0}` (not 401, not 404).

---

### Task 6 — Hook notification creation into `prediction.py`
**Satisfies:** AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-7.1  
**File:** `back/app/api/routes/prediction.py`

After the existing prediction record is saved (look for the `crud.save_prediction` or
equivalent call), add:

```python
from app.database import notification_crud

# After save, inside the same try block:
if record.severity in ("high", "critical") and record.user_id:
    prefs = notification_crud.get_preferences(str(record.user_id))
    if prefs.get("high_risk", True):
        notification_crud.create_notification(
            user_id  = str(record.user_id),
            type_    = "prediction",
            severity = record.severity,
            title    = "High-Risk Disease Detected",
            body     = (
                f"{record.predicted_class} detected with "
                f"{record.confidence_pct:.1f}% confidence on "
                f"{record.created_at.strftime('%Y-%m-%d')}."
            ),
            link = f"/dashboard/history?id={record.id}",
        )
        admin_crud.add_audit(
            level      = "INFO",
            event_type = "NOTIFICATION_CREATED",
            message    = (
                f"Prediction notification for user {record.user_id}: "
                f"{record.predicted_class} ({record.severity})"
            ),
        )
```

---

### Task 7 — Add admin broadcast endpoint to `admin.py`
**Satisfies:** AC-4.1, AC-4.2, AC-4.3  
**File:** `back/app/api/routes/admin.py`

Add at the end of the router:

```python
class BroadcastPayload(BaseModel):
    title: str
    body: str
    user_ids: Optional[List[str]] = None  # None = all active users

@router.post("/notifications/broadcast")
async def broadcast_notification(payload: BroadcastPayload) -> dict:
    if payload.user_ids:
        target_ids = payload.user_ids
    else:
        users, _ = admin_crud.list_users(limit=10000)
        target_ids = [str(u["auth_user_id"]) for u in users if u.get("auth_user_id")]

    count = 0
    for uid in target_ids:
        notification_crud.create_notification(
            user_id  = uid,
            type_    = "system",
            severity = "none",
            title    = payload.title,
            body     = payload.body,
        )
        count += 1

    admin_crud.add_audit(
        level="INFO",
        event_type="NOTIFICATION_BROADCAST",
        message=f"Broadcast '{payload.title}' sent to {count} user(s).",
    )
    return {"created": count}
```

---

### Task 8 — Add `POST /api/v1/weather/risk/check` endpoint
**Satisfies:** AC-2.1, AC-2.2, AC-2.3  
**File:** `back/app/api/routes/weather.py`

Add after the existing `/risk` GET endpoint:

```python
@router.post(
    "/check",
    summary="Trigger weather-based notification check",
    description=(
        "Evaluates current weather risk and creates notifications for users "
        "whose weather_warnings preference is enabled and who have not received "
        "a weather notification in the last 6 hours.\n\n"
        "**backend: TODO** — This endpoint must be called by a cron job / "
        "scheduled task. No scheduling is implemented yet; call manually to test."
    ),
)
async def trigger_weather_check(user_id: Optional[str] = None) -> dict:
    from app.database import notification_crud
    from datetime import timedelta

    risk_data = _get_weather_risk()  # reuse internal helper
    max_risk = max((d.risk_level for d in risk_data.disease_risks), default=0)

    if max_risk < 80:
        return {"notifications_created": 0, "reason": "risk_below_threshold"}

    top_disease = max(risk_data.disease_risks, key=lambda d: d.risk_level)

    # Determine target users
    if user_id:
        targets = [user_id]
    else:
        from app.database import admin_crud
        users, _ = admin_crud.list_users(limit=10000)
        targets = [str(u["auth_user_id"]) for u in users if u.get("auth_user_id")]

    created = 0
    cutoff = datetime.utcnow() - timedelta(hours=6)

    for uid in targets:
        prefs = notification_crud.get_preferences(uid)
        if not prefs.get("weather_warnings", True):
            continue
        # Check for recent weather notification (dedup within 6h)
        recent, _ = notification_crud.list_notifications(uid, limit=10)
        recent_weather = [
            n for n in recent
            if n["type"] == "weather"
            and datetime.fromisoformat(n["created_at"].replace("Z", "")) > cutoff
        ]
        if recent_weather:
            continue

        notification_crud.create_notification(
            user_id  = uid,
            type_    = "weather",
            severity = "high" if max_risk >= 80 else "moderate",
            title    = "Weather Risk Alert",
            body     = (
                f"{top_disease.disease_name} risk at {top_disease.risk_level}% — "
                f"humidity {risk_data.current.humidity}%, "
                f"optimal germination conditions."
            ),
            link = "/dashboard/weather",
        )
        created += 1

    return {"notifications_created": created}
```

---

## Phase 4 — TypeScript Types

### Task 9 — Add notification types to `src/types/index.ts`
**Satisfies:** All frontend tasks below  
**File:** `front/src/types/index.ts`

Append at the end of the file:

```typescript
// ── Notifications ──────────────────────────────────────────────────────────────

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

## Phase 5 — API Client

### Task 10 — Add notification API functions to `src/lib/api.ts`
**Satisfies:** US-5, US-6  
**File:** `front/src/lib/api.ts`

Import the new types:
```typescript
import type { NotificationsResponse, UnreadCountResponse, NotificationPreferences } from "@/types";
```

Add at the end of the file:

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

export async function saveNotificationPreferences(
  prefs: NotificationPreferences
): Promise<NotificationPreferences> {
  try {
    const { data } = await apiClient.put<NotificationPreferences>(
      "/api/v1/notifications/preferences",
      prefs
    );
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

## Phase 6 — Frontend Components

### Task 11 — Create `NotificationBell.tsx`
**Satisfies:** US-5, AC-5.1–5.7  
**File:** `front/src/components/wg/NotificationBell.tsx` (create new)

The full component:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  fetchNotifications, fetchUnreadCount,
  markNotificationRead, markAllNotificationsRead,
} from "@/lib/api";
import type { NotificationItem } from "@/types";
import { useRouter } from "next/navigation";

// Colour config per notification type
const TYPE_CONFIG: Record<string, { dot: string; icon: string }> = {
  prediction: { dot: "bg-[#dc2626]", icon: "coronavirus"  },
  weather:    { dot: "bg-[#d97706]", icon: "thunderstorm"  },
  report:     { dot: "bg-[#2563eb]", icon: "description"   },
  system:     { dot: "bg-[#6b7280]", icon: "info"          },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();

  const [open,         setOpen]         = useState(false);
  const [items,        setItems]        = useState<NotificationItem[]>([]);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch unread count (called by interval + visibility change) ──────────
  const refreshCount = () => {
    if (!user) return;
    fetchUnreadCount()
      .then(r => setUnreadCount(r.unread))
      .catch(() => {}); // silent — don't interrupt the user
  };

  // ── Initial + polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    refreshCount();

    const tick = () => {
      if (document.visibilityState === "visible") refreshCount();
    };

    // TODO: Replace setInterval below with a Supabase Realtime channel
    // subscription on the notifications table filtered by user_id when
    // a realtime layer is added to the project.
    intervalRef.current = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", tick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Load full list when dropdown opens ───────────────────────────────────
  const handleOpen = () => {
    setOpen(v => !v);
    if (!open && user) {
      setLoading(true);
      setError("");
      fetchNotifications(20)
        .then(r => { setItems(r.items); setUnreadCount(r.unread); })
        .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
        .finally(() => setLoading(false));
    }
  };

  // ── Mark one read ────────────────────────────────────────────────────────
  const handleClick = (item: NotificationItem) => {
    if (!item.read) {
      markNotificationRead(item.id).catch(() => {});
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (item.link) router.push(item.link);
  };

  // ── Mark all read ────────────────────────────────────────────────────────
  const handleMarkAll = () => {
    markAllNotificationsRead().catch(() => {});
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  if (!user) return null;

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative w-10 h-10 rounded-lg text-[#4b5563] hover:bg-[#F4F6F5] flex items-center justify-center transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#dc2626] text-white text-[9px] font-bold px-1 ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Flyout */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 flex flex-col max-h-[480px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] shrink-0">
              <span className="text-[14px] font-semibold text-[#1B4332]">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#991b1b] text-[11px] font-semibold">
                  {unreadCount} Unread
                </span>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#f3f4f6]">
              {loading ? (
                <div className="py-10 flex justify-center">
                  <span className="animate-spin material-symbols-outlined text-[#9ca3af]" style={{ fontSize: 24 }}>
                    progress_activity
                  </span>
                </div>
              ) : error ? (
                <div className="py-8 px-4 text-center text-[13px] text-[#dc2626]">{error}</div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center">
                  <span className="material-symbols-outlined text-[#d1d5db] block mb-2" style={{ fontSize: 32 }}>
                    notifications_off
                  </span>
                  <p className="text-[13px] text-[#9ca3af]">No notifications yet.</p>
                </div>
              ) : (
                items.map(item => {
                  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.system;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleClick(item)}
                      className={`w-full text-left px-4 py-3 hover:bg-[#f9fafb] transition-colors flex items-start gap-3 ${
                        !item.read ? "bg-[#f0fdf4]" : ""
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] leading-tight ${!item.read ? "font-semibold text-[#111827]" : "font-medium text-[#374151]"}`}>
                          {item.title}
                        </div>
                        <div className="text-[11px] text-[#6b7280] mt-0.5 truncate">{item.body}</div>
                      </div>
                      <span className="text-[10px] text-[#9ca3af] shrink-0 mt-0.5">{relativeTime(item.created_at)}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[#e5e7eb] text-center shrink-0">
                <button
                  onClick={handleMarkAll}
                  className="text-[12px] text-[#006c49] font-semibold hover:underline"
                >
                  Mark all as read
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

---

### Task 12 — Wire `NotificationBell` into `UserTopBar.tsx`
**Satisfies:** AC-5.1–5.7  
**File:** `front/src/components/wg/UserTopBar.tsx`

1. Add import:
   ```typescript
   import { NotificationBell } from "./NotificationBell";
   ```

2. Remove the entire `<div className="relative">` block that contains the old
   hardcoded notification button and flyout (approximately 30 lines starting
   with the bell button and ending with `</div>`).

3. Replace with: `<NotificationBell />`

4. Remove `notifOpen` state and any references to it (it was only used by the
   old notification block).

---

### Task 13 — Clean up `Header.tsx` (public/marketing header)
**Satisfies:** Removes hardcoded fake data from the guest view  
**File:** `front/src/components/wg/Header.tsx`

The public header is shown to unauthenticated users — real notifications don't
apply there. Remove the notification flyout content (the hardcoded three items and
"3 New" badge). Keep the bell icon button but remove the red dot badge and the
flyout dropdown entirely, or hide the bell when no user is logged in.

```diff
- <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#93000a] text-[11px] font-semibold">3 New</span>
+ {/* badge removed — no notifications for unauthenticated users */}

// Remove the flyout <div> and its contents entirely for Header.tsx
```

---

### Task 14 — Update `SettingsView.tsx` to sync preferences with the API
**Satisfies:** AC-6.1, AC-6.2, AC-6.3, AC-6.4  
**File:** `front/src/components/wg/views/SettingsView.tsx`

1. Add imports:
   ```typescript
   import {
     fetchNotificationPreferences,
     saveNotificationPreferences,
   } from "@/lib/api";
   ```

2. Add a second `useEffect` after the existing localStorage load:
   ```typescript
   useEffect(() => {
     fetchNotificationPreferences()
       .then(prefs => {
         setSettings(prev => ({
           ...prev,
           notifications: {
             highRisk:        prefs.high_risk,
             dailyDigest:     prefs.daily_digest,
             weeklyEmail:     prefs.weekly_email,
             weatherWarnings: prefs.weather_warnings,
           },
         }));
       })
       .catch(() => {
         // backend unavailable — localStorage fallback already loaded
       });
   }, []);
   ```

3. Replace `savePreferences` with an async version:
   ```typescript
   const [saveError, setSaveError] = useState("");

   const savePreferences = async () => {
     setSaveError("");
     try {
       await saveNotificationPreferences({
         high_risk:        settings.notifications.highRisk,
         daily_digest:     settings.notifications.dailyDigest,
         weekly_email:     settings.notifications.weeklyEmail,
         weather_warnings: settings.notifications.weatherWarnings,
       });
       localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
       setSaved(true);
     } catch (e) {
       setSaveError(e instanceof Error ? e.message : "Failed to save preferences");
       setSaved(false);
     }
   };
   ```

4. Add `saveError` inline error below the Save button:
   ```tsx
   {saveError && <span className="text-[12px] text-[#dc2626]">{saveError}</span>}
   ```

5. Add a helper note next to the `weeklyEmail` and `dailyDigest` toggle labels:
   ```tsx
   // weeklyEmail label sub-text:
   "Weekly statistics delivered to your email. Email delivery — backend: TODO (email-sending service not yet connected)."
   // dailyDigest label sub-text:
   "Morning field briefing. Email delivery — backend: TODO (email-sending service not yet connected)."
   ```

---

## Phase 7 — Verification

### Task 15 — End-to-end smoke test
**Satisfies:** All requirements

1. Run `npm run build` in `front/` — must compile with zero TypeScript errors.
2. Start backend: `.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000`
3. Log in as a regular user in the browser.
4. Verify bell shows `0` badge (no badge shown) initially.
5. Upload a wheat leaf image that returns `high` or `critical` severity.
6. Within 5 seconds, `GET /api/v1/notifications/unread-count` returns `{"unread": 1}`.
7. Bell badge shows `1`.
8. Open dropdown — notification item shown with correct title and body.
9. Click the notification — it navigates to the prediction, badge decrements to `0`.
10. Open Settings → toggle `highRisk` off → Save → upload another high-risk image →
    confirm **no new notification** is created.
11. Open Settings → toggle `weatherWarnings` off → call
    `POST /api/v1/weather/risk/check` manually → confirm **no notification** created.
12. In admin panel → audit logs → filter by "info" → confirm
    `NOTIFICATION_CREATED` entries appear.

---

## Deferred / Backend TODO Items

These are explicitly **not** implemented by the tasks above — they must be tracked
separately and must **not** be faked in the UI:

| Item | Status | Where noted |
|---|---|---|
| Email delivery for `daily_digest` / `weekly_email` | **backend: TODO** | SettingsView toggle labels |
| Scheduled `POST /api/v1/weather/risk/check` (cron) | **backend: TODO** | weather.py docstring |
| WebSocket / SSE realtime push | **deferred** | NotificationBell.tsx TODO comment |
