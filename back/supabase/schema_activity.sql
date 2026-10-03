-- ============================================================================
-- WheatGuard AI — User Activity tracking (retention analytics)
--
-- Central activity-event store. Every meaningful user action is recorded here
-- so the admin retention module can compute:
--   • D1/D7/D14/D30 cohort retention (registration-anchored)
--   • active-user counts, per-user engagement, activity timelines
--   • new-user journey / conversion funnel
--
-- Event types written by the system:
--   user_registered              — auth service: profile created (email or OAuth)
--   user_login                   — auth service: successful login (all methods)
--   user_logout                  — auth service: explicit application logout
--   prediction_created           — FastAPI: a wheat prediction was saved
--   calendar_opened              — frontend: calendar page opened
--   prediction_history_opened    — frontend: prediction history opened
--   prediction_viewed            — frontend: a prediction was opened
--   prediction_completed_viewed  — frontend: full prediction details opened
--   notification_viewed          — frontend: notification panel opened
--   notification_clicked         — frontend: a notification was clicked
--   assistant_used               — frontend: AI assistant used (reserved)
--   profile_viewed               — frontend: profile page viewed (reserved)
--   settings_viewed              — frontend: settings page viewed (reserved)
--
-- NOTES
--   • Registration itself is NOT counted as "meaningful activity" for the
--     D1/D7/D14/D30 windows; logins, predictions, calendar/history views and
--     notification interactions are.
--   • Explicit logout is tracked; browser/tab closure cannot be detected
--     reliably in a JWT-only architecture and is deliberately NOT tracked.
--
-- Run in Supabase SQL Editor → New query → Run (safe to re-run).
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_activity (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       TEXT         NOT NULL,          -- JWT sub (string UUID)
    event_type    TEXT         NOT NULL,
    prediction_id TEXT,                           -- set for prediction events
    metadata      JSONB        DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Repair guard for databases created before this revision ──────────────────
-- CREATE TABLE IF NOT EXISTS never adds columns to an existing table, so an
-- older user_activity (id/user_id/event_type/created_at only) would silently
-- keep failing prediction_id/metadata writes on re-run. These idempotent
-- ALTERs upgrade such a table in place.
ALTER TABLE user_activity ADD COLUMN IF NOT EXISTS prediction_id TEXT;
ALTER TABLE user_activity ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Indexes requested by the retention spec (all idempotent)
CREATE INDEX IF NOT EXISTS idx_user_activity_user_created
    ON user_activity (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_event_created
    ON user_activity (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_created
    ON user_activity (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_prediction
    ON user_activity (prediction_id)
    WHERE prediction_id IS NOT NULL;

ALTER TABLE user_activity DISABLE ROW LEVEL SECURITY;
