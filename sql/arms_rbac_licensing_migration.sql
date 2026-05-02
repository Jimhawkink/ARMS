-- ============================================================
-- ARMS Ultra RBAC & Licensing Migration
-- Run this in your Supabase SQL editor
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Add is_super_admin column to arms_users if not exists
ALTER TABLE public.arms_users
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- 2. Seed the Super Admin account (Jimhawkins Korir)
-- Password is stored as plain text to match existing auth pattern
-- Change 'Arms@2024!SuperAdmin' to your desired password
INSERT INTO public.arms_users (
    user_name, password_hash, name, email, phone,
    user_type, user_role, active, is_super_admin,
    allowed_location_ids
)
VALUES (
    'jimhawkins',
    'Arms@2024!SuperAdmin',
    'Jimhawkins Korir',
    'jimhawkins@alphasolutions.co.ke',
    '0720316175',
    'admin',
    'admin',
    true,
    true,
    '{}'
)
ON CONFLICT (user_name) DO UPDATE SET
    is_super_admin = true,
    active = true,
    user_type = 'admin',
    user_role = 'admin';

-- 3. Create arms_licenses table
CREATE TABLE IF NOT EXISTS public.arms_licenses (
    license_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT UNIQUE NOT NULL,
    client_name TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    machine_id TEXT DEFAULT NULL,          -- NULL until first activation
    is_active BOOLEAN DEFAULT false,
    features JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    activated_at TIMESTAMPTZ DEFAULT NULL,
    revoked_at TIMESTAMPTZ DEFAULT NULL,
    notes TEXT DEFAULT NULL
);

-- 4. Index on license_key for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_arms_licenses_key
    ON public.arms_licenses (license_key);

-- 5. Index on machine_id for fast machine lookups
CREATE INDEX IF NOT EXISTS idx_arms_licenses_machine
    ON public.arms_licenses (machine_id)
    WHERE machine_id IS NOT NULL;

-- 6. Enable RLS on arms_licenses
ALTER TABLE public.arms_licenses ENABLE ROW LEVEL SECURITY;

-- 7. Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "arms_licenses_anon_no_access" ON public.arms_licenses;
DROP POLICY IF EXISTS "arms_licenses_service_full_access" ON public.arms_licenses;

-- 8. Anon key: NO direct access (all access goes through API routes)
CREATE POLICY "arms_licenses_anon_no_access"
    ON public.arms_licenses
    FOR ALL
    TO anon
    USING (false);

-- 9. Authenticated (service role via API): full access
CREATE POLICY "arms_licenses_service_full_access"
    ON public.arms_licenses
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 10. Ensure admin role has all permissions in arms_role_permissions
INSERT INTO public.arms_role_permissions (
    role_name, can_manage_tenants, can_manage_units, can_record_payments,
    can_view_reports, can_send_sms, can_manage_utilities, can_manage_caretakers,
    can_issue_demand_letters, can_manage_settings, can_manage_users,
    can_view_dashboard, can_manage_expenses, can_manage_billing,
    can_manage_checklists, is_super_admin
)
VALUES ('admin', true, true, true, true, true, true, true, true, true, true, true, true, true, true, false)
ON CONFLICT (role_name) DO UPDATE SET
    can_manage_tenants = true, can_manage_units = true, can_record_payments = true,
    can_view_reports = true, can_send_sms = true, can_manage_utilities = true,
    can_manage_caretakers = true, can_issue_demand_letters = true,
    can_manage_settings = true, can_manage_users = true, can_view_dashboard = true,
    can_manage_expenses = true, can_manage_billing = true, can_manage_checklists = true;

-- 11. Ensure manager role exists with restricted permissions
INSERT INTO public.arms_role_permissions (
    role_name, can_manage_tenants, can_manage_units, can_record_payments,
    can_view_reports, can_send_sms, can_manage_utilities, can_manage_caretakers,
    can_issue_demand_letters, can_manage_settings, can_manage_users,
    can_view_dashboard, can_manage_expenses, can_manage_billing,
    can_manage_checklists, is_super_admin
)
VALUES ('manager', true, true, true, true, true, true, true, true, false, false, true, true, true, true, false)
ON CONFLICT (role_name) DO UPDATE SET
    can_manage_settings = false,
    can_manage_users = false,
    is_super_admin = false;

-- 12. Ensure caretaker role exists
INSERT INTO public.arms_role_permissions (
    role_name, can_manage_tenants, can_manage_units, can_record_payments,
    can_view_reports, can_send_sms, can_manage_utilities, can_manage_caretakers,
    can_issue_demand_letters, can_manage_settings, can_manage_users,
    can_view_dashboard, can_manage_expenses, can_manage_billing,
    can_manage_checklists, is_super_admin
)
VALUES ('caretaker', true, false, true, false, true, true, false, false, false, false, true, false, true, true, false)
ON CONFLICT (role_name) DO UPDATE SET
    can_manage_settings = false, can_manage_users = false, is_super_admin = false;

-- 13. Ensure viewer role exists
INSERT INTO public.arms_role_permissions (
    role_name, can_manage_tenants, can_manage_units, can_record_payments,
    can_view_reports, can_send_sms, can_manage_utilities, can_manage_caretakers,
    can_issue_demand_letters, can_manage_settings, can_manage_users,
    can_view_dashboard, can_manage_expenses, can_manage_billing,
    can_manage_checklists, is_super_admin
)
VALUES ('viewer', false, false, false, true, false, false, false, false, false, false, true, false, false, false, false)
ON CONFLICT (role_name) DO UPDATE SET
    can_manage_settings = false, can_manage_users = false, is_super_admin = false;

-- Done!
SELECT 'ARMS RBAC & Licensing migration complete' AS status;
