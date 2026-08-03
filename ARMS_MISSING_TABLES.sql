-- ============================================================
-- ARMS MISSING TABLES MIGRATION
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zkamuhvrmazozhudbtuw/sql/new
-- ============================================================

-- ── TABLE 1: arms_unit_mpesa_config ──────────────────────────
-- Stores per-unit M-Pesa till configuration (till number, credentials, etc.)

CREATE TABLE IF NOT EXISTS arms_unit_mpesa_config (
    config_id       BIGSERIAL PRIMARY KEY,
    unit_id         BIGINT NOT NULL REFERENCES arms_units(unit_id) ON DELETE CASCADE,
    till_number     TEXT NOT NULL,
    shortcode       TEXT,
    consumer_key    TEXT,
    consumer_secret TEXT,
    passkey         TEXT,
    environment     TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production','sandbox')),
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(unit_id)
);

-- ── TABLE 2: arms_reminder_rules ─────────────────────────────
-- Stores automated SMS/WhatsApp reminder schedule rules

CREATE TABLE IF NOT EXISTS arms_reminder_rules (
    rule_id          BIGSERIAL PRIMARY KEY,
    rule_name        TEXT NOT NULL,
    trigger_type     TEXT NOT NULL DEFAULT 'after_due'
                     CHECK (trigger_type IN ('before_due','on_due','after_due','monthly','overdue')),
    days_offset      INT NOT NULL DEFAULT 0,
    message_template TEXT NOT NULL DEFAULT 'Dear {name}, your rent of KES {balance} for {unit} is due.',
    channels         TEXT[] NOT NULL DEFAULT ARRAY['sms'],
    location_ids     BIGINT[] DEFAULT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Enable Row Level Security ─────────────────────────────────
ALTER TABLE arms_unit_mpesa_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE arms_reminder_rules    ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies (allow full access — dashboard is admin-only) ─
DROP POLICY IF EXISTS "allow_all_unit_mpesa_config" ON arms_unit_mpesa_config;
CREATE POLICY "allow_all_unit_mpesa_config"
    ON arms_unit_mpesa_config FOR ALL
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_reminder_rules" ON arms_reminder_rules;
CREATE POLICY "allow_all_reminder_rules"
    ON arms_reminder_rules FOR ALL
    USING (true) WITH CHECK (true);

-- ── Seed: one default reminder rule ──────────────────────────
INSERT INTO arms_reminder_rules
    (rule_name, trigger_type, days_offset, message_template, channels, is_active)
VALUES (
    'Overdue Rent Reminder',
    'after_due',
    3,
    'Dear {name}, your rent of KES {balance} for {unit} at {location} is overdue. Please pay promptly. Thank you - ARMS',
    ARRAY['sms'],
    true
)
ON CONFLICT DO NOTHING;

-- ── Verify ────────────────────────────────────────────────────
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('arms_unit_mpesa_config', 'arms_reminder_rules')
ORDER BY table_name;
