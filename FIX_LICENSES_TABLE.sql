-- ============================================================
-- FIX: ARMS Licenses Table — Run in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/zkamuhvrmazozhudbtuw/sql/new
--
-- PROBLEM: During migration to new Supabase database, the
--          arms_licenses table was either not created or its
--          data was lost. The table schema exists in
--          ARMS_CLEAN_SCHEMA.sql but RLS blocks anon reads.
--
-- This script:
--  1. Creates the arms_licenses table (IF NOT EXISTS)
--  2. Fixes RLS — allows service_role + authenticated access
--  3. Also allows anon reads so the UI can list licenses
--  4. Verifies the fix
-- ============================================================

-- ── STEP 1: Create the table (safe, won't drop existing data) ─
CREATE TABLE IF NOT EXISTS public.arms_licenses (
    license_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key  TEXT        UNIQUE NOT NULL,
    client_name  TEXT        NOT NULL,
    expiry_date  DATE        NOT NULL,
    machine_id   TEXT        DEFAULT NULL,
    is_active    BOOLEAN     DEFAULT false,
    features     JSONB       DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ DEFAULT NULL,
    revoked_at   TIMESTAMPTZ DEFAULT NULL,
    notes        TEXT        DEFAULT NULL
);

-- ── STEP 2: Enable RLS (already on, but safe to re-run) ───────
ALTER TABLE public.arms_licenses ENABLE ROW LEVEL SECURITY;

-- ── STEP 3: Drop old conflicting policies ─────────────────────
DROP POLICY IF EXISTS "arms_licenses_anon_no_access"      ON public.arms_licenses;
DROP POLICY IF EXISTS "arms_licenses_service_full_access" ON public.arms_licenses;
DROP POLICY IF EXISTS "Allow anon full access"            ON public.arms_licenses;
DROP POLICY IF EXISTS "arms_licenses_read"                ON public.arms_licenses;
DROP POLICY IF EXISTS "arms_licenses_write"               ON public.arms_licenses;

-- ── STEP 4: Create correct RLS policies ───────────────────────
-- Service role: full CRUD (used by API routes with service role key)
CREATE POLICY "arms_licenses_service_full_access"
    ON public.arms_licenses
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Anon/authenticated: SELECT only (so licensing page can list them)
-- The API routes use service_role key for inserts/updates
CREATE POLICY "arms_licenses_anon_read"
    ON public.arms_licenses
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- ── STEP 5: Verify the table and policies exist ───────────────
SELECT
    'arms_licenses table' AS check_item,
    COUNT(*) AS record_count
FROM public.arms_licenses

UNION ALL

SELECT
    'RLS policies' AS check_item,
    COUNT(*) AS policy_count
FROM pg_policies
WHERE tablename = 'arms_licenses';

-- ── Expected output: ──────────────────────────────────────────
-- arms_licenses table | 0  (or however many rows exist)
-- RLS policies        | 2  (the two policies we just created)
-- ============================================================
