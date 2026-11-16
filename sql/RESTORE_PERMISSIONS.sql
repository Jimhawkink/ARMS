-- ═══════════════════════════════════════════════════════════════
-- ARMS — IMMEDIATE RESTORE FOR DASHBOARD SAVE & UPDATE FUNCTIONS
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/gcebwzpcyeltzhyqefxo/sql
-- ═══════════════════════════════════════════════════════════════

-- 1. Restore PostgreSQL table-level privileges to anon and authenticated roles
GRANT ALL ON TABLE arms_tenants TO anon, authenticated, service_role;
GRANT ALL ON TABLE arms_billing TO anon, authenticated, service_role;
GRANT ALL ON TABLE arms_units TO anon, authenticated, service_role;
GRANT ALL ON TABLE arms_locations TO anon, authenticated, service_role;
GRANT ALL ON TABLE arms_payments TO anon, authenticated, service_role;
GRANT ALL ON TABLE arms_penalties TO anon, authenticated, service_role;
GRANT ALL ON TABLE arms_kcb_stk_requests TO anon, authenticated, service_role;
GRANT ALL ON TABLE arms_mpesa_transactions TO anon, authenticated, service_role;
GRANT ALL ON TABLE arms_users TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 2. Drop restrictive read-only policies and restore full CRUD policies for dashboard operation
DROP POLICY IF EXISTS "arms_tenants_anon_read_only" ON arms_tenants;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_tenants;
CREATE POLICY "Allow anon full access" ON arms_tenants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "arms_billing_anon_read_only" ON arms_billing;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_billing;
CREATE POLICY "Allow anon full access" ON arms_billing FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "arms_units_anon_read_only" ON arms_units;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_units;
CREATE POLICY "Allow anon full access" ON arms_units FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "arms_locations_anon_read_only" ON arms_locations;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_locations;
CREATE POLICY "Allow anon full access" ON arms_locations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "arms_payments_anon_read_only" ON arms_payments;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_payments;
CREATE POLICY "Allow anon full access" ON arms_payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "arms_penalties_anon_read_only" ON arms_penalties;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_penalties;
CREATE POLICY "Allow anon full access" ON arms_penalties FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "arms_kcb_stk_anon_read_only" ON arms_kcb_stk_requests;
DROP POLICY IF EXISTS "Allow anon full access" ON arms_kcb_stk_requests;
CREATE POLICY "Allow anon full access" ON arms_kcb_stk_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access" ON arms_users;
CREATE POLICY "Allow anon full access" ON arms_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
