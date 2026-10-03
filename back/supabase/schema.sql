-- ============================================================
-- WheatGuard AI – Supabase Schema v2 (corrected)
-- ============================================================
-- HOW TO APPLY:
--   1. Open your Supabase project dashboard
--   2. Navigate to: SQL Editor -> New query
--   3. Paste this entire file and click "Run"
--   Safe to re-run on existing databases (uses IF NOT EXISTS / DO $$ migration)
-- ============================================================

-- Enable UUID extension (pre-installed on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── predictions table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions (
    id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename          TEXT         NOT NULL,
    predicted_class   TEXT         NOT NULL,
    confidence        FLOAT        NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    confidence_pct    FLOAT        NOT NULL,
    confidence_level  TEXT         NOT NULL DEFAULT 'Unknown',
    low_confidence    BOOLEAN      NOT NULL DEFAULT FALSE,
    severity          TEXT         NOT NULL DEFAULT 'unknown',

    -- Stored as JSONB array: [{rank, class_name, confidence, confidence_percentage}, ...]
    top_predictions   JSONB        NOT NULL DEFAULT '[]'::jsonb,

    recommendation    TEXT,
    inference_time_ms FLOAT,
    model_version     TEXT,

    -- MD5 hash of raw image bytes – used for deduplication tracking (not PII)
    image_hash        TEXT,

    -- Public URL of the uploaded image stored in Supabase Storage
    image_url         TEXT,

    gradcam_available BOOLEAN      NOT NULL DEFAULT FALSE,

    -- Gemini-generated EntryRank diagnosis report (JSONB)
    ai_report         JSONB,

    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Owner of this prediction (Supabase auth user id / JWT 'sub' claim).
    -- Nullable so existing pre-migration rows don't break; every new
    -- prediction the app saves from now on will always set this.
    user_id           UUID
);

-- ── Migration: add new columns to existing table if they don't exist ───────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='severity') THEN
        ALTER TABLE predictions ADD COLUMN severity TEXT NOT NULL DEFAULT 'unknown';
        RAISE NOTICE 'Added severity column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='confidence_level') THEN
        ALTER TABLE predictions ADD COLUMN confidence_level TEXT NOT NULL DEFAULT 'Unknown';
        RAISE NOTICE 'Added confidence_level column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='image_url') THEN
        ALTER TABLE predictions ADD COLUMN image_url TEXT;
        RAISE NOTICE 'Added image_url column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='ai_report') THEN
        ALTER TABLE predictions ADD COLUMN ai_report JSONB;
        RAISE NOTICE 'Added ai_report column';
    END IF;
    -- FIX: this column was missing from the migration block entirely, so an
    -- already-existing predictions table (created before user_id existed)
    -- could never pick it up by re-running this script.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='user_id') THEN
        ALTER TABLE predictions ADD COLUMN user_id UUID;
        RAISE NOTICE 'Added user_id column';
    END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────

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

-- ── Row Level Security ────────────────────────────────────────────────────────
-- RLS is disabled because the FastAPI backend connects with the service-role key.
-- Re-enable and add policies when adding per-user authentication.
ALTER TABLE predictions DISABLE ROW LEVEL SECURITY;

-- ── Helpful views ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW prediction_class_summary AS
SELECT
    predicted_class,
    severity,
    COUNT(*)                                  AS total,
    ROUND(AVG(confidence_pct)::numeric, 2)    AS avg_confidence_pct,
    ROUND(AVG(inference_time_ms)::numeric, 2) AS avg_inference_ms,
    MAX(created_at)                           AS last_seen
FROM predictions
GROUP BY predicted_class, severity
ORDER BY total DESC;

-- ── Admin: managed users (panel CRUD; also synced to Auth when possible) ─────
CREATE TABLE IF NOT EXISTS app_users (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id    UUID,
    name            TEXT         NOT NULL,
    email           TEXT         NOT NULL UNIQUE,
    role            TEXT         NOT NULL DEFAULT 'user',
    status          TEXT         NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users (email);

-- ── Admin: disease registry ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diseases (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT         NOT NULL UNIQUE,
    display_name    TEXT         NOT NULL,
    category        TEXT         NOT NULL DEFAULT 'Fungal',
    description     TEXT         NOT NULL DEFAULT '',
    symptoms        TEXT         NOT NULL DEFAULT '',
    solution        TEXT         NOT NULL DEFAULT '',
    recommendation  TEXT         NOT NULL DEFAULT '',
    prevention      TEXT         NOT NULL DEFAULT '',
    management      TEXT         NOT NULL DEFAULT '',
    image_url       TEXT,
    video_url       TEXT,
    status          TEXT         NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diseases' AND column_name='symptoms') THEN
        ALTER TABLE diseases ADD COLUMN symptoms TEXT NOT NULL DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diseases' AND column_name='solution') THEN
        ALTER TABLE diseases ADD COLUMN solution TEXT NOT NULL DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diseases' AND column_name='recommendation') THEN
        ALTER TABLE diseases ADD COLUMN recommendation TEXT NOT NULL DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diseases' AND column_name='video_url') THEN
        ALTER TABLE diseases ADD COLUMN video_url TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_diseases_name ON diseases (name);

-- ── Admin: information / reference gallery ────────────────────────────────────
CREATE TABLE IF NOT EXISTS information_items (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    disease_name    TEXT         NOT NULL,
    caption         TEXT         NOT NULL DEFAULT '',
    image_url       TEXT         NOT NULL,
    category        TEXT         NOT NULL DEFAULT 'All',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_information_created_at
    ON information_items (created_at DESC);

-- ── Admin: system settings (single-row) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
    id                   TEXT         PRIMARY KEY DEFAULT 'default',
    site_title           TEXT         NOT NULL DEFAULT 'Wheat Disease Recognition System',
    support_email        TEXT         NOT NULL DEFAULT 'support@wheatguard.ai',
    language             TEXT         NOT NULL DEFAULT 'English',
    email_notifications  BOOLEAN      NOT NULL DEFAULT TRUE,
    push_notifications   BOOLEAN      NOT NULL DEFAULT FALSE,
    description         TEXT         NOT NULL DEFAULT '',
    username             TEXT         NOT NULL DEFAULT 'Admin',
    admin_email          TEXT         NOT NULL DEFAULT '',
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- FIX: this block used to also patch audit_logs (event_type/status/details/
-- image_url), but audit_logs isn't created until further down this file, so
-- on a fresh database that ALTER TABLE would fail with
-- "relation audit_logs does not exist" and could abort the rest of the
-- script. Those checks now live right after CREATE TABLE audit_logs below,
-- where the table is guaranteed to already exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='system_settings' AND column_name='description') THEN
        ALTER TABLE system_settings ADD COLUMN description TEXT NOT NULL DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='system_settings' AND column_name='system_alerts') THEN
        ALTER TABLE system_settings ADD COLUMN system_alerts BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

-- ── Admin: crop registry ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crops (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT         NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    image_url       TEXT,
    status          TEXT         NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crops_name ON crops (name);

ALTER TABLE crops DISABLE ROW LEVEL SECURITY;

-- ── Admin: audit / system logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    level       TEXT         NOT NULL DEFAULT 'INFO',
    message     TEXT         NOT NULL,
    actor       TEXT
);

-- FIX: moved here (and correctly guarded) from the system_settings block
-- above, now that audit_logs is guaranteed to exist. admin_crud.py's
-- add_audit()/list_audit() read and write all four of these columns, so
-- without this migration every admin audit-log write/read on an
-- already-existing (pre-v2) audit_logs table would silently drop or omit
-- them.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='audit_logs' AND column_name='event_type') THEN
        ALTER TABLE audit_logs ADD COLUMN event_type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='audit_logs' AND column_name='status') THEN
        ALTER TABLE audit_logs ADD COLUMN status TEXT DEFAULT 'Success';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='audit_logs' AND column_name='details') THEN
        ALTER TABLE audit_logs ADD COLUMN details JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='audit_logs' AND column_name='image_url') THEN
        ALTER TABLE audit_logs ADD COLUMN image_url TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
    ON audit_logs (timestamp DESC);

ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE diseases DISABLE ROW LEVEL SECURITY;
ALTER TABLE information_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- ── Sample verification query ─────────────────────────────────────────────────
-- Run after applying schema to verify tables were created:
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'predictions'
--   ORDER BY ordinal_position;

-- ── User preferences (per-user localization & detection settings) ─────────────
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id               UUID         PRIMARY KEY,
    language              TEXT         NOT NULL DEFAULT 'en',
    measurement           TEXT         NOT NULL DEFAULT 'metric',
    confidence_threshold  INTEGER      NOT NULL DEFAULT 70 CHECK (confidence_threshold BETWEEN 0 AND 100),
    scan_quality          TEXT         NOT NULL DEFAULT 'standard',
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;

-- ── Email alert log (audit trail for sent disease alerts) ─────────────────────
CREATE TABLE IF NOT EXISTS email_alert_log (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_email TEXT         NOT NULL,
    user_id         UUID,
    prediction_id   TEXT,
    alert_type      TEXT         NOT NULL DEFAULT 'high_risk',   -- high_risk | weekly_digest
    status          TEXT         NOT NULL DEFAULT 'sent',        -- sent | failed
    error_message   TEXT,
    sent_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_alert_log_sent_at
    ON email_alert_log (sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_alert_log_user_id
    ON email_alert_log (user_id);

ALTER TABLE email_alert_log DISABLE ROW LEVEL SECURITY;

-- ── User profiles (extended per-user data) ────────────────────────────────────
-- Stores profile fields that the Node auth backend doesn't capture:
-- phone, farm name, location, bio, avatar URL.
-- user_id matches the JWT `sub` claim (Supabase auth UUID).
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id       TEXT         PRIMARY KEY,          -- JWT sub (string UUID)
    full_name     TEXT,
    phone         TEXT,
    farm_name     TEXT,
    location      TEXT,
    bio           TEXT,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- ── User settings (email alert toggles) ──────────────────────────────────────
-- Persists the per-user email alert toggles that the Settings modal controls.
CREATE TABLE IF NOT EXISTS user_settings (
    user_id                     TEXT         PRIMARY KEY,   -- JWT sub
    email_high_severity_alerts  BOOLEAN      NOT NULL DEFAULT TRUE,
    email_weekly_digest         BOOLEAN      NOT NULL DEFAULT FALSE,
    email_report_ready          BOOLEAN      NOT NULL DEFAULT TRUE,
    units                       TEXT         NOT NULL DEFAULT 'metric',
    language                    TEXT         NOT NULL DEFAULT 'en',
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;

-- ── Migration: add avatar_url + profile fields to profiles table ──────────────
-- Run in Supabase SQL Editor → New query → Run
-- Safe to re-run (all guarded with IF NOT EXISTS).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='profiles' AND column_name='avatar_url') THEN
        ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='profiles' AND column_name='phone') THEN
        ALTER TABLE profiles ADD COLUMN phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='profiles' AND column_name='location') THEN
        ALTER TABLE profiles ADD COLUMN location TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='profiles' AND column_name='bio') THEN
        ALTER TABLE profiles ADD COLUMN bio TEXT;
    END IF;
END $$;

-- ── User settings (email alert toggles + display prefs) ───────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
    user_id                     TEXT         PRIMARY KEY,
    email_high_severity_alerts  BOOLEAN      NOT NULL DEFAULT TRUE,
    email_weekly_digest         BOOLEAN      NOT NULL DEFAULT FALSE,
    email_report_ready          BOOLEAN      NOT NULL DEFAULT TRUE,
    units                       TEXT         NOT NULL DEFAULT 'metric',
    language                    TEXT         NOT NULL DEFAULT 'en',
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;

-- ── Migration: appearance + built-in assistant feature toggles ───────────────
-- Adds the built-in assistant's feature toggles (flat columns) plus a single
-- `appearance` JSONB blob holding every Appearance setting (theme, colors,
-- chatbot layout, chat/header/input styling). The /api/v1/assistant/chat route
-- enforces the feature booleans server-side. Safe to re-run (IF NOT EXISTS).
-- NOTE: RLS stays disabled because the FastAPI backend reads/writes this table
-- with the service-role key and scopes every query by user_id (JWT 'sub').
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='appearance') THEN
        ALTER TABLE user_settings ADD COLUMN appearance JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='voice_enabled') THEN
        ALTER TABLE user_settings ADD COLUMN voice_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='image_upload_enabled') THEN
        ALTER TABLE user_settings ADD COLUMN image_upload_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='recent_predictions_enabled') THEN
        ALTER TABLE user_settings ADD COLUMN recent_predictions_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='chat_notifications_enabled') THEN
        ALTER TABLE user_settings ADD COLUMN chat_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    RAISE NOTICE 'user_settings appearance + chatbot columns ensured';
END $$;

-- ── Migration: unified settings restructure ─────────────────────────────────
-- Adds the remaining Settings surfaces to `user_settings` so the whole settings
-- system has ONE source of truth. Every column is guarded with IF NOT EXISTS and
-- carries a safe default, so existing rows/users are untouched and the block is
-- re-runnable. `timezone` stays nullable (NULL = "auto-detect from the browser").
--
-- Intentionally NOT duplicated here: the in-app notification *channel* prefs
-- already live in the auth service's notification_preferences store (served by
-- /api/notifications/preferences) and the email channel prefs already live in
-- the email_* columns above. Re-adding them would recreate the very duplicate
-- source of truth this restructure removes, so they stay where they are.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='timezone') THEN
        ALTER TABLE user_settings ADD COLUMN timezone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='date_format') THEN
        ALTER TABLE user_settings ADD COLUMN date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='time_format') THEN
        ALTER TABLE user_settings ADD COLUMN time_format TEXT NOT NULL DEFAULT '24';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='first_day_of_week') THEN
        ALTER TABLE user_settings ADD COLUMN first_day_of_week TEXT NOT NULL DEFAULT 'monday';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='default_start_page') THEN
        ALTER TABLE user_settings ADD COLUMN default_start_page TEXT NOT NULL DEFAULT '/dashboard';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='remember_last_page') THEN
        ALTER TABLE user_settings ADD COLUMN remember_last_page BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='show_help_tips') THEN
        ALTER TABLE user_settings ADD COLUMN show_help_tips BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='last_visited_page') THEN
        ALTER TABLE user_settings ADD COLUMN last_visited_page TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='prediction_preferences') THEN
        ALTER TABLE user_settings ADD COLUMN prediction_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='weather_preferences') THEN
        ALTER TABLE user_settings ADD COLUMN weather_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='calendar_preferences') THEN
        ALTER TABLE user_settings ADD COLUMN calendar_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='privacy_preferences') THEN
        ALTER TABLE user_settings ADD COLUMN privacy_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    RAISE NOTICE 'user_settings restructure columns ensured';
END $$;

-- ── Backfill: adopt legacy user_preferences only where no settings row exists ─
-- Pure, guarded insert: a user who already saved anything in user_settings is
-- never touched (so a deliberate units/language choice is never clobbered). It
-- only seeds a first settings row for users who exist solely in the legacy table,
-- copying their measurement→units and language. After this the legacy table is
-- no longer written to (preferences.py is a shim over user_settings).
INSERT INTO user_settings (user_id, language, units)
SELECT p.user_id::text, p.language, p.measurement
FROM user_preferences p
WHERE p.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_settings s WHERE s.user_id = p.user_id::text)
ON CONFLICT (user_id) DO NOTHING;

-- ── Migration: settings controls enablement (makes every Settings row real) ──
-- Backs the controls that previously rendered as "Coming soon": per-user
-- assistant key/model, token invalidation (sign-out-everywhere) and TOTP
-- two-factor auth. All guarded, re-runnable, safe defaults, existing rows
-- untouched. totp_secret/two_factor_enabled are written ONLY by the auth
-- service (never through the settings PATCH); the secret is never returned
-- to the browser.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='openrouter_api_key') THEN
        ALTER TABLE user_settings ADD COLUMN openrouter_api_key TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='chat_model') THEN
        ALTER TABLE user_settings ADD COLUMN chat_model TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='password_changed_at') THEN
        ALTER TABLE user_settings ADD COLUMN password_changed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='totp_secret') THEN
        ALTER TABLE user_settings ADD COLUMN totp_secret TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_settings' AND column_name='two_factor_enabled') THEN
        ALTER TABLE user_settings ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
    RAISE NOTICE 'user_settings enablement columns ensured';
END $$;

-- ── Calendar reminders (per-user, per-date farm task reminders) ───────────────
-- Run in Supabase SQL Editor → New query → Run (safe to re-run)
CREATE TABLE IF NOT EXISTS calendar_reminders (
    id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    TEXT         NOT NULL,
    date       DATE         NOT NULL,          -- YYYY-MM-DD
    title      TEXT         NOT NULL,
    note       TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_date
    ON calendar_reminders (user_id, date DESC);

ALTER TABLE calendar_reminders DISABLE ROW LEVEL SECURITY;

-- ── User activity events (for retention analytics) ───────────────────────────
-- Tracks meaningful user actions so the admin retention page can compute
-- D1/D7/D14/D30 cohort retention, active-user counts, and engagement breakdown.
--
-- Meaningful event types:
--   prediction_created  — user submitted a scan
--   history_viewed      — user opened prediction history
--   calendar_opened     — user opened the calendar page
--   assistant_used      — user sent a message to the AI assistant
--   login               — user authenticated (written by auth backend if wired)
--
-- The backend inserts a row into this table every time an authenticated user
-- calls any of those endpoints. The insert is best-effort (non-fatal on error).
--
-- Run in Supabase SQL Editor → New query → Run (safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_activity (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      TEXT         NOT NULL,          -- JWT sub (string UUID)
    event_type   TEXT         NOT NULL,          -- see comment above
    prediction_id TEXT,                          -- set for prediction_created events
    metadata     JSONB        DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_created
    ON user_activity (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_event_created
    ON user_activity (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_created
    ON user_activity (created_at DESC);

ALTER TABLE user_activity DISABLE ROW LEVEL SECURITY;
