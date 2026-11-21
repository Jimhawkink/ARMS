-- ============================================================
-- ARMS — SILENT PIN FIX FOR EXISTING INSTALLED MOBILE APKS
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gcebwzpcyeltzhyqefxo/sql/new
--
-- PURPOSE:
-- Allows tenants with the currently installed APK on their phones
-- to change their PIN successfully WITHOUT redownloading or reinstalling!
-- ============================================================

-- 1. Add 'pin' column to arms_tenants so old app queries don't fail with PGRST204
ALTER TABLE public.arms_tenants ADD COLUMN IF NOT EXISTS pin TEXT;

-- 2. Trigger function: syncs any update to 'pin' directly into 'mobile_pin'
CREATE OR REPLACE FUNCTION public.sync_arms_tenant_pin()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pin IS NOT NULL AND NEW.pin <> '' THEN
        NEW.mobile_pin := NEW.pin;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_arms_tenant_pin ON public.arms_tenants;
CREATE TRIGGER trg_sync_arms_tenant_pin
BEFORE UPDATE OF pin ON public.arms_tenants
FOR EACH ROW
EXECUTE FUNCTION public.sync_arms_tenant_pin();

-- 3. Grant anon permission to update the pin column
GRANT UPDATE (pin) ON public.arms_tenants TO anon, authenticated;

-- 4. Enable RLS policy so anon can update the pin column
DROP POLICY IF EXISTS "arms_tenants_anon_pin_update" ON public.arms_tenants;
CREATE POLICY "arms_tenants_anon_pin_update"
ON public.arms_tenants
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 5. Create optional pin ledger table if not exists (so old app doesn't log 404)
CREATE TABLE IF NOT EXISTS public.arms_tenant_pin_ledger (
    ledger_id SERIAL PRIMARY KEY,
    tenant_id BIGINT,
    tenant_name TEXT,
    unit_name TEXT,
    new_pin TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON public.arms_tenant_pin_ledger TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.arms_tenant_pin_ledger_ledger_id_seq TO anon, authenticated, service_role;

ALTER TABLE public.arms_tenant_pin_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arms_tenant_pin_ledger_anon_insert" ON public.arms_tenant_pin_ledger;
CREATE POLICY "arms_tenant_pin_ledger_anon_insert"
ON public.arms_tenant_pin_ledger
FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);
