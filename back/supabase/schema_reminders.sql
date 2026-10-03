-- ============================================================
-- WheatGuard AI – Calendar Reminder Center Schema Extension
-- Run this in Supabase Dashboard → SQL Editor → New query
-- Safe to re-run (CREATE TABLE IF NOT EXISTS + DO $$ column guards)
--
-- EXTENDS the existing `calendar_reminders` table (never duplicates it)
-- with the fields the Wheat Crop Calendar & Reminder Center needs:
--   category, priority, status, reminder_time, notification_enabled,
--   notification_offset, notified_at, repeat_rule, repeat_interval_days,
--   source, related_prediction_id, related_disease,
--   related_weather_risk_disease, completed_at
-- ============================================================

-- ── Base table (no-op if it already exists) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_reminders (
    id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    TEXT         NOT NULL,
    date       DATE         NOT NULL,          -- YYYY-MM-DD
    title      TEXT         NOT NULL,
    note       TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Add the Reminder-Center columns (idempotent) ─────────────────────────────
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

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_date
    ON calendar_reminders (user_id, date DESC);

-- Sweep index: find a user's pending, not-yet-notified reminders by date quickly.
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_sweep
    ON calendar_reminders (user_id, status, date);

ALTER TABLE calendar_reminders DISABLE ROW LEVEL SECURITY;
