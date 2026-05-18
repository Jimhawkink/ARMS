-- ============================================================
-- ARMS: Per-Unit M-Pesa Till Configuration Migration
-- Creates arms_unit_mpesa_config table
-- Seeds till 9438697 for units in MM, RUNDA, GARDEN, SUNSHINE,
-- AIRVIEW, ELGON 01, HIGHWAY locations
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Create the per-unit M-Pesa config table
CREATE TABLE IF NOT EXISTS public.arms_unit_mpesa_config (
    config_id       SERIAL PRIMARY KEY,
    unit_id         INTEGER UNIQUE NOT NULL
                    REFERENCES public.arms_units(unit_id) ON DELETE CASCADE,
    till_number     VARCHAR(20)  DEFAULT '',
    shortcode       VARCHAR(20)  DEFAULT '',
    consumer_key    TEXT         DEFAULT '',
    consumer_secret TEXT         DEFAULT '',
    passkey         TEXT         DEFAULT '',
    environment     VARCHAR(20)  DEFAULT 'production',
    active          BOOLEAN      DEFAULT true,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. Unique index on unit_id (one till config per unit)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_mpesa_config_unit
    ON public.arms_unit_mpesa_config(unit_id);

-- 3. Enable RLS with permissive policy (matches all other ARMS tables)
ALTER TABLE public.arms_unit_mpesa_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow all arms_unit_mpesa_config"
        ON public.arms_unit_mpesa_config
        FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Add unit_id column to arms_stk_requests for tracking which unit triggered the push
ALTER TABLE public.arms_stk_requests
    ADD COLUMN IF NOT EXISTS unit_id INTEGER
    REFERENCES public.arms_units(unit_id);

-- 5. Seed till 9438697 for all active units in the 7 live locations
--    (MM, RUNDA, GARDEN, SUNSHINE, AIRVIEW, ELGON 01, HIGHWAY)
--    Leaves consumer_key, consumer_secret, shortcode, passkey empty
--    — admin fills those in via Settings → Unit Tills
INSERT INTO public.arms_unit_mpesa_config (unit_id, till_number, environment)
SELECT
    u.unit_id,
    '9438697',
    'production'
FROM public.arms_units u
JOIN public.arms_locations l ON l.location_id = u.location_id
WHERE l.location_name IN (
    'MM', 'RUNDA', 'GARDEN', 'SUNSHINE', 'AIRVIEW', 'ELGON 01', 'HIGHWAY'
)
  AND u.active = true
ON CONFLICT (unit_id) DO NOTHING;

-- Done
SELECT
    'arms_unit_mpesa_config migration complete' AS status,
    COUNT(*) AS seeded_units
FROM public.arms_unit_mpesa_config;
