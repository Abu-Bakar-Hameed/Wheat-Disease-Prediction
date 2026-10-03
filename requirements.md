# WheatGuard AI – Notification System: Requirements

> **Status:** Draft v1.0  
> **Scope:** Real server-generated notifications, unread count, delivery preferences persisted server-side.  
> **Out of scope:** Mobile push (APNs/FCM), SMS, i18n of notification text.

---

## Current State (Why This Exists)

Both `UserTopBar.tsx` and `Header.tsx` contain **hardcoded, static** notification flyouts:
- Always show "3 New" badge (red dot, never hides)
- Three fixed strings inlined as JSX — no API call, no state
- "Mark all as read" only closes the dropdown, changes nothing
- No read/unread tracking
- No backend connection whatsoever

`SettingsView.tsx` has four notification-preference toggles that write only to
`localStorage` — they are never sent to the server and never gate anything.

There is **no `notifications` table** in `supabase/schema.sql`, no notification
service in the FastAPI backend, and no TypeScript types for notifications.

---

## User Stories

### US-1 — Prediction high-risk alert
**As a** farmer  
**I want** to be notified automatically when one of my predictions comes back
`high` or `critical` severity  
**So that** I can take immediate field action without manually checking the history page.

**Acceptance criteria:**
- AC-1.1: When `POST /api/v1/predict` saves a prediction with `severity ∈ {high, critical}`,
  a notification row is created in the `notifications` table for the prediction's `user_id`.
- AC-1.2: The notification has `type = "prediction"`, `severity` matching the prediction,
  `title = "High-Risk Disease Detected"`, `body` containing disease name and scan date.
- AC-1.3: If the user's `highRisk` preference is `false`, **no notification is created**.
- AC-1.4: The notification includes a `link` that resolves to the prediction in the
  history/diagnostic result page (format: `/dashboard/history?id={prediction_id}`).

---

### US-2 — Weather risk warning
**As a** farmer  
**I want** to be notified when environmental conditions in the platform cross a
high or critical infection-risk threshold  
**So that** I can apply preventive fungicide before an outbreak starts.

**Acceptance criteria:**
- AC-2.1: `POST /api/v1/weather/risk/check` (new backend endpoint) evaluates the current
  weather risk. If the aggregate infection risk index ≥ 80 and no weather notification
  was created for this user in the last 6 hours, a notification is created with
  `type = "weather"`.
- AC-2.2: If the user's `weatherWarnings` preference is `false`, **no notification is created**.
- AC-2.3: The notification `body` names the highest-risk disease and the triggering metric
  (e.g. "Yellow Rust risk at 92% — humidity 78%, optimal germination conditions.").
- AC-2.4: Weather check is triggered server-side on a configurable schedule; the frontend
  does not drive creation — it only reads.
  > **Backend dependency:** Scheduled job / cron is out of scope for the initial frontend
  > implementation. The `POST /api/v1/weather/risk/check` endpoint must be callable
  > manually (e.g. from a cron or on weather-data refresh) until scheduling is implemented.

---

### US-3 — Report-ready notification
**As a** farmer  
**I want** to be notified when a PPTX/CSV/JSON report I requested has finished generating  
**So that** I can download it without polling the reports page.

**Acceptance criteria:**
- AC-3.1: When `POST /api/v1/reports/pptx` or `POST /api/v1/reports/generate` completes
  successfully, a notification with `type = "report"`, `title = "Report Ready"` is created
  for the requesting user.
- AC-3.2: The notification `link` points to the download endpoint or the Reports page.
- AC-3.3: Reports are synchronous today (the endpoint streams the file in the same request),
  so the notification is created immediately **after** the response is sent. This is a
  best-effort paper trail, not an async job queue.

---

### US-4 — Admin system message
**As an** admin  
**I want** to broadcast a system message to one or all users  
**So that** I can communicate maintenance windows or policy changes.

**Acceptance criteria:**
- AC-4.1: `POST /api/v1/admin/notifications/broadcast` (new endpoint, admin-only) accepts
  `{ title, body, user_ids?: string[] }`. If `user_ids` is omitted, the notification is
  created for every active user in `app_users`.
- AC-4.2: Notification `type = "system"`, `severity = "none"`.
- AC-4.3: The broadcast endpoint writes one `notifications` row per recipient.

---

### US-5 — Notification center in the dashboard
**As a** farmer  
**I want** to see a live unread count on the bell icon and click into a list of
all my notifications  
**So that** I never miss a high-risk alert.

**Acceptance criteria:**
- AC-5.1: Bell icon shows a numeric badge with the unread count from the API, not a
  hardcoded "3 New". The badge is hidden (not shown) when unread count is 0.
- AC-5.2: Opening the dropdown calls `GET /api/v1/notifications?limit=20` and displays
  the results newest-first. Unread items are visually distinct (e.g. bolder text, coloured
  left border).
- AC-5.3: Clicking a notification item:
  - Calls `PATCH /api/v1/notifications/{id}/read` to mark it read.
  - Navigates to `notification.link` (if present) or stays on the current page.
  - Updates the unread count immediately (optimistic update).
- AC-5.4: "Mark all as read" calls `POST /api/v1/notifications/read-all` and clears the
  badge.
- AC-5.5: Empty state is shown with a message ("No notifications yet.") rather than a
  spinner or blank space.
- AC-5.6: The component polls `GET /api/v1/notifications/unread-count` every **60 seconds**
  while the tab is visible (using `document.visibilityState`). This is a polling-only
  implementation; a note must be left in the code where a WebSocket/SSE hook would go.
- AC-5.7: The maximum items rendered in the flyout is 20. A "View all" link leads to a
  dedicated notifications page (if built) or the History page.

---

### US-6 — Delivery preferences persisted server-side
**As a** farmer  
**I want** the notification-preference toggles in Settings to actually save to
the server and be applied to future notifications  
**So that** my preference survives a browser clear, a device change, or a cache purge.

**Acceptance criteria:**
- AC-6.1: On "Save Preferences", `SettingsView` calls `PUT /api/v1/notifications/preferences`
  with `{ highRisk, dailyDigest, weeklyEmail, weatherWarnings }`.
- AC-6.2: On page load, `SettingsView` calls `GET /api/v1/notifications/preferences` and
  populates the checkboxes from the API response (falling back to `localStorage` if the
  call fails so the UI is never blank).
- AC-6.3: The backend reads preferences before creating a notification and skips creation
  if the relevant toggle is off (see AC-1.3, AC-2.2).
- AC-6.4: `dailyDigest` and `weeklyEmail` control whether scheduled email jobs fire for
  this user. The frontend only stores the toggle; the email-sending job is marked
  **backend: TODO** (not mocked in the UI) because no email-send API exists yet.

---

### US-7 — Admin visibility into notification activity
**As an** admin  
**I want** to see notification creation events in the audit log  
**So that** I can confirm high-risk alerts are firing and trace delivery issues.

**Acceptance criteria:**
- AC-7.1: Every time a notification is created, `admin_crud.add_audit()` is called with
  `level="INFO"`, `event_type="NOTIFICATION_CREATED"`, `message` naming the type,
  severity, and user.
- AC-7.2: The existing `LogsPage` admin panel already polls `GET /api/v1/admin/audit-logs`;
  these entries appear there automatically without UI changes.
- AC-7.3: The existing filter for `"info"` level in `LogsPage` surfaces these entries.

---

## Constraints

- Follow existing Tailwind colour tokens (`#1B4332`, `#006c49`, `#dc2626`, etc.) — no new
  design system.
- New API functions go into `src/lib/api.ts` following the existing `fetch…` / `save…`
  pattern with `norm(err)` error handling.
- New TypeScript types go into `src/types/index.ts`.
- Data fetching in components uses the `useLoad` hook from
  `src/components/wg/admin/ui.tsx` where appropriate.
- If a backend endpoint is not yet implemented, the API function must `throw` an `ApiError`
  rather than returning mock data, and the component must show the proper error state.
