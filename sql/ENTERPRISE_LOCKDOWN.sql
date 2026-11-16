-- ═══════════════════════════════════════════════════════════════════════════════
-- ARMS FINAL ENTERPRISE LOCKDOWN SCRIPT (SOLUTION B)
-- Run this in Supabase SQL Editor AFTER Vercel finishes deploying the new code.
-- https://supabase.com/dashboard/project/gcebwzpcyeltzhyqefxo/sql
--
-- WHY THIS WORKS WITHOUT BREAKING THE DASHBOARD:
-- 1. All dashboard mutations (Add Tenant, Save/Update Tenant, Vacate Tenant, Delete Tenant,
--    Add Unit, Record Payment, Add Arrears) now execute through Vercel server API routes
--    which authenticate with the master 'service_role' key.
-- 2. The public 'anon' role (which students have) is strictly blocked from INSERT, UPDATE,
--    and DELETE on all sensitive tables.
-- 3. As a result, students CANNOT inject false payments or alter rent balances, while
--    your admin dashboard functions smoothly without permission errors!
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. DROP OLD PERMISSIVE POLICIES ──────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon full access" ON arms_payments;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_tenants;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_billing;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_penalties;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_kcb_stk_requests;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_unit_kcb_config;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_users;

-- ── 2. ENABLE ROW LEVEL SECURITY ─────────────────────────────────────────────
ALTER TABLE IF EXISTS arms_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_kcb_stk_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_unit_kcb_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_users ENABLE ROW LEVEL SECURITY;

-- ── 3. REVOKE DIRECT WRITES FROM THE PUBLIC 'ANON' ROLE ──────────────────────
-- Students with the anon key cannot insert fake payments or modify balances
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_tenants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_billing FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_penalties FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE arms_kcb_stk_requests FROM anon;
REVOKE ALL ON TABLE arms_unit_kcb_config FROM anon; -- Completely hide KCB API keys
REVOKE ALL ON TABLE arms_users FROM anon;           -- Completely hide Admin Passwords

-- ── 4. ENSURE MASTER 'SERVICE_ROLE' HAS FULL RESTLESS ACCESS ─────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ── 5. STRICT READ-ONLY POLICIES FOR 'ANON' ──────────────────────────────────
-- Allows the dashboard and mobile app to display lists, statements, and bills
CREATE POLICY "arms_payments_anon_read_only" ON arms_payments FOR SELECT TO anon USING (true);
CREATE POLICY "arms_tenants_anon_read_only" ON arms_tenants FOR SELECT TO anon USING (true);
CREATE POLICY "arms_billing_anon_read_only" ON arms_billing FOR SELECT TO anon USING (true);
CREATE POLICY "arms_penalties_anon_read_only" ON arms_penalties FOR SELECT TO anon USING (true);
CREATE POLICY "arms_kcb_stk_anon_read_only" ON arms_kcb_stk_requests FOR SELECT TO anon USING (true);

-- (arms_unit_kcb_config and arms_users have NO policies for anon = 100% blocked from reading)
