-- ============================================================
-- WheatGuard AI – Notification System Schema
-- Run this in Supabase Dashboard → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS / DO $$ guards)
-- ============================================================

-- ── notifications ─────────────────────────────────────────────────────────────
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

-- ── notification_preferences ──────────────────────────────────────────────────
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

-- ── updated_at trigger helper ─────────────────────────────────────────────────
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
