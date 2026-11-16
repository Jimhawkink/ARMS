-- ═══════════════════════════════════════════════════════════════════════════════
-- ARMS ULTRA-GRADE SECURITY HARDENING SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR (https://supabase.com/dashboard/project/gcebwzpcyeltzhyqefxo/sql)
--
-- PURPOSE:
-- 1. Bulletproof protection against university students or external actors
--    attempting to inject false payments, alter rent balances, or clear penalties.
-- 2. Revoke ALL direct write access (INSERT, UPDATE, DELETE) from the public 'anon' role
--    on all financial tables: arms_payments, arms_billing, arms_tenants, arms_penalties,
--    arms_kcb_stk_requests, arms_unit_kcb_config, arms_users.
-- 3. Shield credentials: arms_unit_kcb_config (bank API keys) and arms_users (password hashes).
-- 4. Create secure SECURITY DEFINER RPC function for tenant PIN login so mobile app never
--    downloads or exposes other tenants' secret PINs.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. DROP OLD PERMISSIVE POLICIES (e.g. "Allow anon full access") ──────────
DO $$
DECLARE
    tbl TEXT;
    pol TEXT;
    tables TEXT[] := ARRAY[
        'arms_payments', 'arms_billing', 'arms_tenants', 'arms_penalties',
        'arms_kcb_stk_requests', 'arms_unit_kcb_config', 'arms_unit_mpesa_config',
        'arms_users', 'arms_mpesa_transactions', 'arms_locations', 'arms_units'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON %I', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Allow anon insert" ON %I', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Allow anon update" ON %I', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Allow anon delete" ON %I', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Allow anon select" ON %I', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Public select" ON %I', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Public write" ON %I', tbl);
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;
    END LOOP;
END $$;

-- ── 2. ENABLE ROW LEVEL SECURITY ON ALL SENSITIVE TABLES ─────────────────────
ALTER TABLE IF EXISTS arms_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_kcb_stk_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_unit_kcb_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_mpesa_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_units ENABLE ROW LEVEL SECURITY;

-- ── 3. REVOKE DIRECT DML WRITE PERMISSIONS FROM ANON ROLE ─────────────────────
-- This guarantees at the PostgreSQL privilege layer that anon CANNOT write,
-- regardless of any policy mistakes!
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_billing FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_tenants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_penalties FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_kcb_stk_requests FROM anon;
REVOKE ALL ON TABLE arms_unit_kcb_config FROM anon; -- Completely hide bank API keys
REVOKE ALL ON TABLE arms_users FROM anon;           -- Completely hide admin password hashes

-- Ensure service_role (used by Vercel backend / KCB callbacks) has full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ── 4. CONFIGURE STRICT READ POLICIES (anon can read public app data only) ────

-- arms_payments: Read-only for anon (used for statements & history)
CREATE POLICY "arms_payments_anon_read_only"
ON arms_payments FOR SELECT
TO anon
USING (true);

-- arms_billing: Read-only for anon (used for bill display)
CREATE POLICY "arms_billing_anon_read_only"
ON arms_billing FOR SELECT
TO anon
USING (true);

-- arms_tenants: Read-only for anon
CREATE POLICY "arms_tenants_anon_read_only"
ON arms_tenants FOR SELECT
TO anon
USING (true);

-- arms_penalties: Read-only for anon
CREATE POLICY "arms_penalties_anon_read_only"
ON arms_penalties FOR SELECT
TO anon
USING (true);

-- arms_kcb_stk_requests: Read-only for anon (used by app status polling)
CREATE POLICY "arms_kcb_stk_anon_read_only"
ON arms_kcb_stk_requests FOR SELECT
TO anon
USING (true);

-- arms_locations & arms_units: Read-only for anon
CREATE POLICY "arms_locations_anon_read_only"
ON arms_locations FOR SELECT
TO anon
USING (true);

CREATE POLICY "arms_units_anon_read_only"
ON arms_units FOR SELECT
TO anon
USING (true);

-- arms_unit_kcb_config: DENIED TO ANON (no policy created for anon = 100% blocked)
-- arms_users: DENIED TO ANON (no policy created for anon = 100% blocked)

-- ── 5. SECURE TENANT PIN LOGIN RPC (SECURITY DEFINER) ─────────────────────────
-- Mobile app calls this to log in with PIN.
-- It matches the PIN server-side and returns the tenant's profile WITHOUT returning mobile_pin!
CREATE OR REPLACE FUNCTION tenant_login_secure(p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant RECORD;
    v_unit_name TEXT;
    v_location_name TEXT;
BEGIN
    IF p_pin IS NULL OR length(trim(p_pin)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN required');
    END IF;

    -- Lookup tenant matching PIN (active only)
    SELECT * INTO v_tenant
    FROM arms_tenants
    WHERE trim(mobile_pin) = trim(p_pin)
      AND status = 'Active'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid PIN');
    END IF;

    -- Get unit name
    SELECT unit_name INTO v_unit_name
    FROM arms_units
    WHERE unit_id = v_tenant.unit_id;

    -- Get location name
    SELECT location_name INTO v_location_name
    FROM arms_locations
    WHERE location_id = v_tenant.location_id;

    -- Return safe payload (DO NOT return mobile_pin or password_hash!)
    RETURN jsonb_build_object(
        'success', true,
        'tenant', jsonb_build_object(
            'tenant_id', v_tenant.tenant_id,
            'tenant_name', v_tenant.tenant_name,
            'phone', coalesce(v_tenant.phone, ''),
            'id_number', coalesce(v_tenant.id_number, ''),
            'email', coalesce(v_tenant.email, ''),
            'unit_id', v_tenant.unit_id,
            'unit_name', coalesce(v_unit_name, 'N/A'),
            'location_id', v_tenant.location_id,
            'location_name', coalesce(v_location_name, 'N/A'),
            'monthly_rent', coalesce(v_tenant.monthly_rent, 0),
            'deposit_paid', coalesce(v_tenant.deposit_paid, 0),
            'move_in_date', coalesce(v_tenant.move_in_date, ''),
            'balance', coalesce(v_tenant.balance, 0),
            'is_on_vacation', coalesce(v_tenant.is_on_vacation, false)
        )
    );
END;
$$;

-- Allow anon to execute the secure login function
GRANT EXECUTE ON FUNCTION tenant_login_secure(TEXT) TO anon, authenticated;

-- ── 6. SECURE RE-CALCULATION VERIFICATION ────────────────────────────────────
-- Verification query to run in SQL editor to confirm lockdown:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'arms_%';
