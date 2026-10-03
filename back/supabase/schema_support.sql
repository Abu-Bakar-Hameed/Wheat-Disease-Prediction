-- ============================================================
-- WheatGuard AI – Query / Support System Schema
-- Run this in Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (uses IF NOT EXISTS / DO $$ guards)
--
-- Separate from any feedback concept: a support "query" is a
-- conversation thread between one authenticated user and the
-- admin/support team. Identity is anchored on user_id (the JWT
-- `sub`, a Supabase auth UUID referencing public.profiles).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── support_queries ───────────────────────────────────────────────────────────
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

-- ── support_messages ──────────────────────────────────────────────────────────
-- One row per reply. Never store the whole thread in a single field.
CREATE TABLE IF NOT EXISTS support_messages (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id     UUID         NOT NULL REFERENCES support_queries (id) ON DELETE CASCADE,
    sender_id    UUID         NOT NULL,
    sender_type  TEXT         NOT NULL CHECK (sender_type IN ('user','admin')),
    message      TEXT         NOT NULL,
    -- Internal admin notes: never surfaced to the user (UI, email, notifications).
    is_internal  BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Lightweight read tracking (see spec §28).
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

-- ── updated_at trigger for support_queries ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_queries_updated_at ON support_queries;
CREATE TRIGGER support_queries_updated_at
  BEFORE UPDATE ON support_queries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Support email preference (§30) ────────────────────────────────────────────
-- Adds an opt-in/opt-out column for support-reply email notifications.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'notification_preferences') THEN
        ALTER TABLE notification_preferences
            ADD COLUMN IF NOT EXISTS email_support BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

-- ── Sample verification query ─────────────────────────────────────────────────
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name IN ('support_queries','support_messages')
--   ORDER BY table_name, ordinal_position;
