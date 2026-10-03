-- ============================================================
-- WheatGuard AI – Feedback Management System Schema
-- Run this in Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (uses IF NOT EXISTS / DO $$ guards)
--
-- A feedback record is a single piece of user-submitted feedback
-- (rating + message) that admins triage, respond to and analyse.
-- Identity is anchored on user_id (the JWT `sub`, a Supabase auth
-- UUID referencing public.profiles). Separate from the support/query
-- conversation system, this models a one-shot submission with an
-- optional admin reply thread and private internal notes.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Login tracking on profiles ────────────────────────────────────────────────
-- The database (NOT the browser) is the source of truth for how many times a
-- user has logged in and when we last prompted them for feedback. Both email
-- and Google/Microsoft logins increment the SAME row (keyed on the auth UUID).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'profiles') THEN
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS login_count               INTEGER     NOT NULL DEFAULT 0;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at             TIMESTAMPTZ;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feedback_prompt_count     INTEGER     NOT NULL DEFAULT 0;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_feedback_prompt_at   TIMESTAMPTZ;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_feedback_submitted_at TIMESTAMPTZ;
        -- login_count value at the moment we last auto-prompted; used to space
        -- out repeat prompts by `prompt_interval` logins. 0 = never prompted.
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feedback_last_prompt_login INTEGER    NOT NULL DEFAULT 0;
    END IF;
END $$;

-- ── feedback ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Human friendly code, e.g. "FB-10452". Unique + stable for display/search.
    ticket             TEXT         NOT NULL UNIQUE,
    -- Canonical identity (FK to profiles). Snapshots below are for audit only.
    user_id            UUID         NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    -- Feedback type (free text but validated server-side against a known list).
    type               TEXT         NOT NULL DEFAULT 'General Feedback',
    -- Optional sub-category / tag.
    category           TEXT,
    -- 1..5, optional unless configured required (validation is server-side).
    rating             INTEGER      CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
    message            TEXT         NOT NULL,
    status             TEXT         NOT NULL DEFAULT 'new'
                                    CHECK (status IN (
                                      'new','under_review','in_progress','resolved','closed'
                                    )),
    -- Internal-only triage priority; never shown to normal users.
    priority           TEXT         NOT NULL DEFAULT 'medium'
                                    CHECK (priority IN ('low','medium','high','critical')),
    assigned_admin_id  UUID,
    -- Chatbot context (only set when feedback relates to a chatbot message).
    conversation_id    TEXT,
    message_id         TEXT,
    provider           TEXT,
    model              TEXT,
    -- Audit snapshot of who submitted (never trusted from client; from JWT/profiles).
    user_name          TEXT,
    user_email         TEXT,
    auth_provider      TEXT,
    -- Lifecycle tracking.
    updated_by         UUID,
    resolved_at        TIMESTAMPTZ,
    resolved_by        UUID,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user
    ON feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status
    ON feedback (status);
CREATE INDEX IF NOT EXISTS idx_feedback_type
    ON feedback (type);
CREATE INDEX IF NOT EXISTS idx_feedback_rating
    ON feedback (rating);
CREATE INDEX IF NOT EXISTS idx_feedback_created
    ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_assigned
    ON feedback (assigned_admin_id);

ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;

-- ── feedback_messages ─ (admin <-> user replies; visible to the user) ─────────
-- One row per reply. Store responses SEPARATELY from the original feedback.
CREATE TABLE IF NOT EXISTS feedback_messages (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    feedback_id  UUID         NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
    sender_id    UUID         NOT NULL,
    sender_type  TEXT         NOT NULL CHECK (sender_type IN ('user','admin')),
    message      TEXT         NOT NULL,
    -- Lightweight read tracking (admin reply badge for the user).
    user_read    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_messages_feedback
    ON feedback_messages (feedback_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_unread_user
    ON feedback_messages (user_read)
    WHERE sender_type = 'admin' AND user_read = FALSE;

ALTER TABLE feedback_messages DISABLE ROW LEVEL SECURITY;

-- ── feedback_notes ─ (private admin notes; NEVER surfaced to users) ───────────
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

-- ── feedback_settings ─ (single configurable row) ─────────────────────────────
-- Controls the automatic feedback-prompt cadence and the enable switch.
CREATE TABLE IF NOT EXISTS feedback_settings (
    id                   TEXT         PRIMARY KEY DEFAULT 'default',
    first_prompt_login   INTEGER      NOT NULL DEFAULT 2,   -- login # that first triggers popup (never on login #1)
    prompt_interval      INTEGER      NOT NULL DEFAULT 3,   -- logins between later optional prompts
    cooldown_days        INTEGER      NOT NULL DEFAULT 30,  -- min days between auto prompts
    require_rating       BOOLEAN      NOT NULL DEFAULT FALSE,
    enabled              BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO feedback_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE feedback_settings DISABLE ROW LEVEL SECURITY;

-- ── updated_at trigger for feedback (helper fn defined in other schema files;
--    re-declared here so this file is independently runnable) ──────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS feedback_updated_at ON feedback;
CREATE TRIGGER feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS feedback_settings_updated_at ON feedback_settings;
CREATE TRIGGER feedback_settings_updated_at
  BEFORE UPDATE ON feedback_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Sample verification query ─────────────────────────────────────────────────
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name IN ('feedback','feedback_messages','feedback_notes','feedback_settings')
--   ORDER BY table_name, ordinal_position;
