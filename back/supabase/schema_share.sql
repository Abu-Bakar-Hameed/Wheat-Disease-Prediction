-- ============================================================
-- WheatGuard AI – Public Sharing Schema (share tokens)
-- ============================================================
-- HOW TO APPLY:
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this entire file -> Run
--   Safe to re-run (uses IF NOT EXISTS guards everywhere).
--
-- Adds owner-controlled public share links to predictions:
--   share_token       cryptographically random URL-safe token
--                     (generated server-side with Python secrets),
--                     unrelated to the row UUID.
--   share_enabled     owner toggle; disabled links return
--                     "This prediction is no longer publicly shared."
--   share_created_at  when the link was first generated
--   share_updated_at  last enable/disable change
-- ============================================================

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

-- Public lookup by token must be unique and fast. Partial unique index
-- keeps NULL (never-shared rows) out of the constraint entirely.
CREATE UNIQUE INDEX IF NOT EXISTS predictions_share_token_key
    ON predictions (share_token)
    WHERE share_token IS NOT NULL;
