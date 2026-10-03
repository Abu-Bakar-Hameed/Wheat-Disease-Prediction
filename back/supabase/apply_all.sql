-- ============================================================================
-- WheatGuard AI - combined schema bootstrap (generated bundle)
--
-- Concatenation of: schema.sql, schema_activity.sql, schema_notifications.sql,
-- schema_chatbot.sql - all idempotent, safe to re-run on an existing database.
-- Apply: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run.
-- ============================================================================

-- ===== schema.sql ======
-- ============================================================
-- WheatGuard AI â€“ Supabase Schema v2 (corrected)
-- ============================================================
-- HOW TO APPLY:
--   1. Open your Supabase project dashboard
--   2. Navigate to: SQL Editor -> New query
--   3. Paste this entire file and click "Run"
--   Safe to re-run on existing databases (uses IF NOT EXISTS / DO $$ migration)
-- ============================================================

-- Enable UUID extension (pre-installed on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- â”€â”€ predictions table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    -- MD5 hash of raw image bytes â€“ used for deduplication tracking (not PII)
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

-- â”€â”€ Migration: add new columns to existing table if they don't exist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Indexes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

-- â”€â”€ Row Level Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- RLS is disabled because the FastAPI backend connects with the service-role key.
-- Re-enable and add policies when adding per-user authentication.
ALTER TABLE predictions DISABLE ROW LEVEL SECURITY;

-- â”€â”€ Helpful views â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

-- â”€â”€ Admin: managed users (panel CRUD; also synced to Auth when possible) â”€â”€â”€â”€â”€
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

-- â”€â”€ Admin: disease registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Admin: information / reference gallery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Admin: system settings (single-row) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Admin: crop registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Admin: audit / system logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Sample verification query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Run after applying schema to verify tables were created:
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'predictions'
--   ORDER BY ordinal_position;

-- â”€â”€ User preferences (per-user localization & detection settings) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id               UUID         PRIMARY KEY,
    language              TEXT         NOT NULL DEFAULT 'en',
    measurement           TEXT         NOT NULL DEFAULT 'metric',
    confidence_threshold  INTEGER      NOT NULL DEFAULT 70 CHECK (confidence_threshold BETWEEN 0 AND 100),
    scan_quality          TEXT         NOT NULL DEFAULT 'standard',
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;

-- â”€â”€ Email alert log (audit trail for sent disease alerts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ User profiles (extended per-user data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ User settings (email alert toggles) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Migration: add avatar_url + profile fields to profiles table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Run in Supabase SQL Editor â†’ New query â†’ Run
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

-- â”€â”€ User settings (email alert toggles + display prefs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- Migration: appearance + built-in assistant feature toggles.
-- Backs Settings -> Appearance / Settings -> Chatbot and is enforced
-- server-side by /api/v1/assistant/chat. Safe to re-run (IF NOT EXISTS).
-- RLS stays disabled: the FastAPI backend uses the service-role key and
-- scopes every query by user_id (JWT 'sub').
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

-- Migration: unified settings restructure.
-- Adds the remaining Settings surfaces to `user_settings` so the whole settings
-- system has ONE source of truth. Every column is guarded with IF NOT EXISTS and
-- carries a safe default, so existing rows/users are untouched and the block is
-- re-runnable. `timezone` stays nullable (NULL = auto-detect from the browser).
-- In-app notification channel prefs stay in the auth service (not duplicated);
-- email channel prefs stay in the existing email_* columns.
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

-- Backfill: seed a first settings row (units/language) ONLY for users who exist
-- solely in the legacy user_preferences table and have never saved settings.
-- Guarded insert + ON CONFLICT DO NOTHING: never clobbers an existing row.
INSERT INTO user_settings (user_id, language, units)
SELECT p.user_id::text, p.language, p.measurement
FROM user_preferences p
WHERE p.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_settings s WHERE s.user_id = p.user_id::text)
ON CONFLICT (user_id) DO NOTHING;

-- Migration: settings controls enablement (makes every Settings row real).
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

-- â”€â”€ Calendar reminders (per-user, per-date farm task reminders) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Run in Supabase SQL Editor â†’ New query â†’ Run (safe to re-run)
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

-- Reminder Center columns (extend calendar_reminders; safe to re-run)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='category') THEN
        ALTER TABLE calendar_reminders ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='priority') THEN
        ALTER TABLE calendar_reminders ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='status') THEN
        ALTER TABLE calendar_reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='reminder_time') THEN
        ALTER TABLE calendar_reminders ADD COLUMN reminder_time TIME;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='notification_enabled') THEN
        ALTER TABLE calendar_reminders ADD COLUMN notification_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='notification_offset') THEN
        ALTER TABLE calendar_reminders ADD COLUMN notification_offset INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='notified_at') THEN
        ALTER TABLE calendar_reminders ADD COLUMN notified_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='repeat_rule') THEN
        ALTER TABLE calendar_reminders ADD COLUMN repeat_rule TEXT NOT NULL DEFAULT 'none';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='repeat_interval_days') THEN
        ALTER TABLE calendar_reminders ADD COLUMN repeat_interval_days INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='source') THEN
        ALTER TABLE calendar_reminders ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='related_prediction_id') THEN
        ALTER TABLE calendar_reminders ADD COLUMN related_prediction_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='related_disease') THEN
        ALTER TABLE calendar_reminders ADD COLUMN related_disease TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='related_weather_risk_disease') THEN
        ALTER TABLE calendar_reminders ADD COLUMN related_weather_risk_disease TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='calendar_reminders' AND column_name='completed_at') THEN
        ALTER TABLE calendar_reminders ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
    RAISE NOTICE 'calendar_reminders Reminder-Center columns ensured';
END $$;

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_sweep
    ON calendar_reminders (user_id, status, date);

-- â”€â”€ User activity events (for retention analytics) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Tracks meaningful user actions so the admin retention page can compute
-- D1/D7/D14/D30 cohort retention, active-user counts, and engagement breakdown.
--
-- Meaningful event types:
--   prediction_created  â€” user submitted a scan
--   history_viewed      â€” user opened prediction history
--   calendar_opened     â€” user opened the calendar page
--   assistant_used      â€” user sent a message to the AI assistant
--   login               â€” user authenticated (written by auth backend if wired)
--
-- The backend inserts a row into this table every time an authenticated user
-- calls any of those endpoints. The insert is best-effort (non-fatal on error).
--
-- Run in Supabase SQL Editor â†’ New query â†’ Run (safe to re-run)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- ===== schema_activity.sql ======
-- ============================================================================
-- WheatGuard AI â€” User Activity tracking (retention analytics)
--
-- Central activity-event store. Every meaningful user action is recorded here
-- so the admin retention module can compute:
--   â€¢ D1/D7/D14/D30 cohort retention (registration-anchored)
--   â€¢ active-user counts, per-user engagement, activity timelines
--   â€¢ new-user journey / conversion funnel
--
-- Event types written by the system:
--   user_registered              â€” auth service: profile created (email or OAuth)
--   user_login                   â€” auth service: successful login (all methods)
--   user_logout                  â€” auth service: explicit application logout
--   prediction_created           â€” FastAPI: a wheat prediction was saved
--   calendar_opened              â€” frontend: calendar page opened
--   prediction_history_opened    â€” frontend: prediction history opened
--   prediction_viewed            â€” frontend: a prediction was opened
--   prediction_completed_viewed  â€” frontend: full prediction details opened
--   notification_viewed          â€” frontend: notification panel opened
--   notification_clicked         â€” frontend: a notification was clicked
--   assistant_used               â€” frontend: AI assistant used (reserved)
--   profile_viewed               â€” frontend: profile page viewed (reserved)
--   settings_viewed              â€” frontend: settings page viewed (reserved)
--
-- NOTES
--   â€¢ Registration itself is NOT counted as "meaningful activity" for the
--     D1/D7/D14/D30 windows; logins, predictions, calendar/history views and
--     notification interactions are.
--   â€¢ Explicit logout is tracked; browser/tab closure cannot be detected
--     reliably in a JWT-only architecture and is deliberately NOT tracked.
--
-- Run in Supabase SQL Editor â†’ New query â†’ Run (safe to re-run).
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_activity (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       TEXT         NOT NULL,          -- JWT sub (string UUID)
    event_type    TEXT         NOT NULL,
    prediction_id TEXT,                           -- set for prediction events
    metadata      JSONB        DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- â”€â”€ Repair guard for databases created before this revision â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- ===== schema_notifications.sql ======
-- ============================================================
-- WheatGuard AI â€“ Notification System Schema
-- Run this in Supabase Dashboard â†’ SQL Editor â†’ New query
-- Safe to re-run (uses IF NOT EXISTS / DO $$ guards)
-- ============================================================

-- â”€â”€ notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS notifications (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL,
    title        TEXT        NOT NULL,
    message      TEXT        NOT NULL DEFAULT '',
    type         TEXT        NOT NULL DEFAULT 'system'
                             CHECK (type IN (
                               'signup','email_verification','login','failed_login',
                               'password_changed','password_reset','profile_updated',
                               'account_suspended','account_activated','security_alert',
                               'admin_message','system','announcement'
                             )),
    category     TEXT        NOT NULL DEFAULT 'general'
                             CHECK (category IN ('security','account','system','admin','general')),
    priority     TEXT        NOT NULL DEFAULT 'normal'
                             CHECK (priority IN ('low','normal','high','critical')),
    is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
    read_at      TIMESTAMPTZ,
    action_url   TEXT,
    metadata     JSONB       DEFAULT '{}'::jsonb,
    created_by   UUID,                          -- NULL = system-generated
    email_sent   BOOLEAN     NOT NULL DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications (user_id, is_read)
    WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type
    ON notifications (type);
CREATE INDEX IF NOT EXISTS idx_notifications_category
    ON notifications (category);

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- â”€â”€ notification_preferences â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS notification_preferences (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID        NOT NULL UNIQUE,
    -- In-app toggles
    login_alerts      BOOLEAN     NOT NULL DEFAULT TRUE,
    security_alerts   BOOLEAN     NOT NULL DEFAULT TRUE,
    password_alerts   BOOLEAN     NOT NULL DEFAULT TRUE,
    account_alerts    BOOLEAN     NOT NULL DEFAULT TRUE,
    system_alerts     BOOLEAN     NOT NULL DEFAULT TRUE,
    admin_alerts      BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Email toggles
    email_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    email_login       BOOLEAN     NOT NULL DEFAULT TRUE,
    email_security    BOOLEAN     NOT NULL DEFAULT TRUE,
    email_password    BOOLEAN     NOT NULL DEFAULT TRUE,
    email_account     BOOLEAN     NOT NULL DEFAULT TRUE,
    email_system      BOOLEAN     NOT NULL DEFAULT FALSE,
    email_admin       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;

-- â”€â”€ updated_at trigger helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notifications_updated_at ON notifications;
CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== schema_support.sql ======
-- ============================================================
-- WheatGuard AI - Query / Support System Schema
--
-- Separate from any feedback concept: a support "query" is a
-- conversation thread between one authenticated user and the
-- admin/support team. Identity is anchored on user_id (the JWT
-- `sub`, a Supabase auth UUID referencing public.profiles).
-- Safe to re-run (uses IF NOT EXISTS / DO $$ guards).
-- ============================================================

-- -- support_queries --
CREATE TABLE IF NOT EXISTS support_queries (
    id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Human friendly ticket, e.g. "Q-1024". Unique + stable for display/search.
    ticket             TEXT         NOT NULL UNIQUE,
    -- Canonical identity (FK to profiles). Snapshots below are for audit only.
    user_id            UUID         NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    subject            TEXT         NOT NULL,
    category           TEXT,
    status             TEXT         NOT NULL DEFAULT 'new'
                                    CHECK (status IN (
                                      'new','open','waiting_user','waiting_admin',
                                      'resolved','closed'
                                    )),
    priority           TEXT         NOT NULL DEFAULT 'medium'
                                    CHECK (priority IN ('low','medium','high','critical')),
    assigned_admin_id  UUID,
    -- Optional link to a chatbot conversation for context (no content exposed).
    conversation_id    TEXT,
    -- Audit snapshot of who asked (never trusted from the client; read from JWT/profiles)
    user_name          TEXT,
    user_email         TEXT,
    auth_provider      TEXT,
    last_message_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    closed_at          TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_queries_user
    ON support_queries (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_queries_status
    ON support_queries (status);
CREATE INDEX IF NOT EXISTS idx_support_queries_last_message
    ON support_queries (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_queries_assigned
    ON support_queries (assigned_admin_id);

ALTER TABLE support_queries DISABLE ROW LEVEL SECURITY;

-- -- support_messages -- (one row per reply; never a single blob)
CREATE TABLE IF NOT EXISTS support_messages (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id     UUID         NOT NULL REFERENCES support_queries (id) ON DELETE CASCADE,
    sender_id    UUID         NOT NULL,
    sender_type  TEXT         NOT NULL CHECK (sender_type IN ('user','admin')),
    message      TEXT         NOT NULL,
    -- Internal admin notes: never surfaced to the user (UI, email, notifications).
    is_internal  BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Lightweight read tracking.
    user_read    BOOLEAN      NOT NULL DEFAULT FALSE,
    admin_read   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_query
    ON support_messages (query_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_messages_unread_user
    ON support_messages (user_read)
    WHERE sender_type = 'admin' AND is_internal = FALSE AND user_read = FALSE;

ALTER TABLE support_messages DISABLE ROW LEVEL SECURITY;

-- -- updated_at trigger for support_queries (helper function already defined above) --
DROP TRIGGER IF EXISTS support_queries_updated_at ON support_queries;
CREATE TRIGGER support_queries_updated_at
  BEFORE UPDATE ON support_queries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -- Support email preference --
-- Adds an opt-in/opt-out column for support-reply email notifications.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'notification_preferences') THEN
        ALTER TABLE notification_preferences
            ADD COLUMN IF NOT EXISTS email_support BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

-- ===== schema_feedback.sql ======
-- ============================================================
-- WheatGuard AI - Feedback Management System Schema
-- Feedback = one-shot user submission (rating + message) that admins
-- triage, respond to and analyse. Separate from the support/query
-- conversation system. Includes login/prompt tracking on profiles.
-- ============================================================

-- Login tracking on profiles (DB is the source of truth, shared across
-- email + Google/Microsoft logins keyed on the auth UUID).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'profiles') THEN
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS login_count               INTEGER     NOT NULL DEFAULT 0;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at             TIMESTAMPTZ;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feedback_prompt_count     INTEGER     NOT NULL DEFAULT 0;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_feedback_prompt_at   TIMESTAMPTZ;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_feedback_submitted_at TIMESTAMPTZ;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feedback_last_prompt_login INTEGER    NOT NULL DEFAULT 0;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS feedback (
    id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket             TEXT         NOT NULL UNIQUE,
    user_id            UUID         NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    type               TEXT         NOT NULL DEFAULT 'General Feedback',
    category           TEXT,
    rating             INTEGER      CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
    message            TEXT         NOT NULL,
    status             TEXT         NOT NULL DEFAULT 'new'
                                    CHECK (status IN (
                                      'new','under_review','in_progress','resolved','closed'
                                    )),
    priority           TEXT         NOT NULL DEFAULT 'medium'
                                    CHECK (priority IN ('low','medium','high','critical')),
    assigned_admin_id  UUID,
    conversation_id    TEXT,
    message_id         TEXT,
    provider           TEXT,
    model              TEXT,
    user_name          TEXT,
    user_email         TEXT,
    auth_provider      TEXT,
    updated_by         UUID,
    resolved_at        TIMESTAMPTZ,
    resolved_by        UUID,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user     ON feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status   ON feedback (status);
CREATE INDEX IF NOT EXISTS idx_feedback_type     ON feedback (type);
CREATE INDEX IF NOT EXISTS idx_feedback_rating   ON feedback (rating);
CREATE INDEX IF NOT EXISTS idx_feedback_created  ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_assigned ON feedback (assigned_admin_id);

ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS feedback_messages (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    feedback_id  UUID         NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
    sender_id    UUID         NOT NULL,
    sender_type  TEXT         NOT NULL CHECK (sender_type IN ('user','admin')),
    message      TEXT         NOT NULL,
    user_read    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_messages_feedback
    ON feedback_messages (feedback_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_unread_user
    ON feedback_messages (user_read)
    WHERE sender_type = 'admin' AND user_read = FALSE;

ALTER TABLE feedback_messages DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS feedback_notes (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    feedback_id  UUID         NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
    admin_id     UUID         NOT NULL,
    note         TEXT         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_notes_feedback
    ON feedback_notes (feedback_id, created_at ASC);

ALTER TABLE feedback_notes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS feedback_settings (
    id                   TEXT         PRIMARY KEY DEFAULT 'default',
    first_prompt_login   INTEGER      NOT NULL DEFAULT 2,
    prompt_interval      INTEGER      NOT NULL DEFAULT 3,
    cooldown_days        INTEGER      NOT NULL DEFAULT 30,
    require_rating       BOOLEAN      NOT NULL DEFAULT FALSE,
    enabled              BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO feedback_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE feedback_settings DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS feedback_updated_at ON feedback;
CREATE TRIGGER feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS feedback_settings_updated_at ON feedback_settings;
CREATE TRIGGER feedback_settings_updated_at
  BEFORE UPDATE ON feedback_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== schema_share.sql =====
-- Public sharing: owner-controlled secure share tokens on predictions.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='share_token') THEN
        ALTER TABLE predictions ADD COLUMN share_token TEXT;
        RAISE NOTICE 'Added share_token column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='share_enabled') THEN
        ALTER TABLE predictions ADD COLUMN share_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        RAISE NOTICE 'Added share_enabled column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='share_created_at') THEN
        ALTER TABLE predictions ADD COLUMN share_created_at TIMESTAMPTZ;
        RAISE NOTICE 'Added share_created_at column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='predictions' AND column_name='share_updated_at') THEN
        ALTER TABLE predictions ADD COLUMN share_updated_at TIMESTAMPTZ;
        RAISE NOTICE 'Added share_updated_at column';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS predictions_share_token_key
    ON predictions (share_token)
    WHERE share_token IS NOT NULL;

-- ===== schema_weather_risk.sql =====
-- Admin-managed, backend-calculated disease weather-risk configuration.
CREATE TABLE IF NOT EXISTS disease_weather_profiles (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    disease_key     TEXT         NOT NULL UNIQUE,
    display_name    TEXT         NOT NULL,
    slug            TEXT         NOT NULL DEFAULT '',
    description     TEXT         NOT NULL DEFAULT '',
    scientific_name TEXT         NOT NULL DEFAULT '',
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    display_order   INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dwp_active ON disease_weather_profiles (active);

CREATE TABLE IF NOT EXISTS disease_weather_factors (
    id           UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id   UUID            NOT NULL REFERENCES disease_weather_profiles(id) ON DELETE CASCADE,
    factor_key   TEXT            NOT NULL,
    weight       INTEGER         NOT NULL DEFAULT 10 CHECK (weight >= 0 AND weight <= 100),
    min_value    DOUBLE PRECISION,
    max_value    DOUBLE PRECISION,
    unit         TEXT            NOT NULL DEFAULT '',
    explanation  TEXT            NOT NULL DEFAULT '',
    active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dwf_profile_factor UNIQUE (profile_id, factor_key)
);

CREATE INDEX IF NOT EXISTS idx_dwf_profile ON disease_weather_factors (profile_id);

CREATE TABLE IF NOT EXISTS weather_risk_thresholds (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    level_name    TEXT        NOT NULL UNIQUE,
    min_score     INTEGER     NOT NULL DEFAULT 0 CHECK (min_score >= 0 AND min_score <= 100),
    max_score     INTEGER     NOT NULL DEFAULT 0 CHECK (max_score >= 0 AND max_score <= 100),
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO weather_risk_thresholds (level_name, min_score, max_score, display_order) VALUES
    ('Very Low',  0,  19, 1),
    ('Low',      20,  39, 2),
    ('Moderate', 40,  59, 3),
    ('High',     60,  79, 4),
    ('Very High', 80, 100, 5)
ON CONFLICT (level_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS weather_risk_logs (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID,
    location     TEXT        NOT NULL DEFAULT '',
    disease_key  TEXT        NOT NULL,
    risk_score   INTEGER     NOT NULL,
    risk_level   TEXT        NOT NULL,
    factors      JSONB       NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wrl_created ON weather_risk_logs (created_at DESC);
