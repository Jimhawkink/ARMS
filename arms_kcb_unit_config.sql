-- ═══════════════════════════════════════════════════════════════
-- ARMS — KCB Buni Unit Config Table
-- Mirrors arms_unit_mpesa_config exactly but for KCB Buni
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arms_unit_kcb_config (
    config_id        BIGSERIAL PRIMARY KEY,
    unit_id          BIGINT NOT NULL UNIQUE REFERENCES arms_units(unit_id) ON DELETE CASCADE,
    account_number   TEXT,          -- KCB account/merchant number e.g. 8128983
    consumer_key     TEXT,          -- KCB Buni production consumer key
    consumer_secret  TEXT,          -- KCB Buni production consumer secret
    environment      TEXT NOT NULL DEFAULT 'production', -- 'production' or 'sandbox'
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_configured    BOOLEAN GENERATED ALWAYS AS (
                         account_number IS NOT NULL AND account_number != '' AND
                         consumer_key   IS NOT NULL AND consumer_key   != '' AND
                         consumer_secret IS NOT NULL AND consumer_secret != ''
                     ) STORED,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by unit
CREATE INDEX IF NOT EXISTS idx_arms_unit_kcb_config_unit_id ON arms_unit_kcb_config(unit_id);

-- RLS (service role bypasses, anon blocked)
ALTER TABLE arms_unit_kcb_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON arms_unit_kcb_config FOR ALL TO service_role USING (true) WITH CHECK (true);
