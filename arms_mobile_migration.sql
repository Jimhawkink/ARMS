-- ============================================================
-- ARMS MOBILE APP MIGRATION
-- Adds mobile_pin to arms_tenants for tenant mobile app login
-- Run this once on your Supabase PostgreSQL database
-- ============================================================

-- 1. Add mobile_pin column to arms_tenants
ALTER TABLE arms_tenants
ADD COLUMN IF NOT EXISTS mobile_pin VARCHAR(6);

-- 2. Index for fast PIN lookups (partial — only indexed when set)
CREATE INDEX IF NOT EXISTS idx_arms_tenants_mobile_pin
ON arms_tenants(mobile_pin)
WHERE mobile_pin IS NOT NULL;

-- 3. Column comment for documentation
COMMENT ON COLUMN arms_tenants.mobile_pin IS
'4-6 digit numeric PIN set by admin for tenant mobile app login. Never store unhashed in production beyond MVP.';

-- ============================================================
-- VERIFICATION QUERY — run after migration
-- Should show the new column:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'arms_tenants' AND column_name = 'mobile_pin';
-- ============================================================
