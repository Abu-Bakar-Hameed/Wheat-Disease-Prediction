-- ============================================================
-- WheatGuard AI – Disease Weather Risk Management schema
-- Run in: Supabase Dashboard → SQL Editor (safe to re-run)
--
-- Tables behind the admin-managed, backend-calculated weather
-- risk system. Admin edits profiles/factors/thresholds here;
-- the FastAPI scoring engine reads them on every /weather/risk
-- call — the frontend never owns the calculation rules.
--
-- NOTE: the backend auto-seeds these tables from the model's
-- class_names.json on first use, so the app also works (in a
-- memory-only fallback) before this migration is applied.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── disease weather profiles (one row per ML disease class) ──────────────────
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

-- ── per-disease weather factors (weights + favorable ranges) ─────────────────
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

-- ── global risk level thresholds (score → level mapping) ─────────────────────
CREATE TABLE IF NOT EXISTS weather_risk_thresholds (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    level_name    TEXT        NOT NULL UNIQUE,
    min_score     INTEGER     NOT NULL DEFAULT 0 CHECK (min_score >= 0 AND min_score <= 100),
    max_score     INTEGER     NOT NULL DEFAULT 0 CHECK (max_score >= 0 AND max_score <= 100),
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default application thresholds — configurable by the admin, NOT scientific
-- guarantees. Seeded here and also ensured by the backend on first read.
INSERT INTO weather_risk_thresholds (level_name, min_score, max_score, display_order) VALUES
    ('Very Low',  0,  19, 1),
    ('Low',      20,  39, 2),
    ('Moderate', 40,  59, 3),
    ('High',     60,  79, 4),
    ('Very High', 80, 100, 5)
ON CONFLICT (level_name) DO NOTHING;

-- ── best-effort score log (analytics trail; failures never break requests) ──
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
