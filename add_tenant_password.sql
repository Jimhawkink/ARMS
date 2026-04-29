-- ============================================
-- ARMS - Add tenant password for mobile app login
-- Tenants will log in using their phone number + PIN
-- ============================================

-- Add password_hash column to arms_tenants
ALTER TABLE arms_tenants
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT NULL;

-- Add login tracking columns
ALTER TABLE arms_tenants
ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE arms_tenants
ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- Add failed login tracking for security
ALTER TABLE arms_tenants
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;

ALTER TABLE arms_tenants
ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMPTZ DEFAULT NULL;

-- Create index for phone-based login lookups
CREATE INDEX IF NOT EXISTS idx_arms_tenants_phone_login ON arms_tenants(phone) WHERE phone IS NOT NULL AND status = 'Active';

-- Set default PIN for existing tenants (their phone number's last 4 digits)
-- They should change this on first login
UPDATE arms_tenants
SET password_hash = COALESCE(SUBSTRING(phone FROM '[0-9]{4}$'), '1234')
WHERE password_hash IS NULL AND phone IS NOT NULL;

-- Add RLS policy for tenant self-service (phone + password login)
-- Tenants can only read/update their own record
