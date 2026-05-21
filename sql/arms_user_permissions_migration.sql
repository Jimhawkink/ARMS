-- ============================================================
-- ARMS — Per-User Menu Permission Overrides Migration
-- Adds custom_permissions JSONB column to arms_users
-- This allows super admin to override individual user permissions
-- beyond their role defaults.
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Add custom_permissions column to arms_users
ALTER TABLE public.arms_users
    ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL;

-- 2. Add a comment for documentation
COMMENT ON COLUMN public.arms_users.custom_permissions IS
    'Optional per-user permission overrides. When set, these override the role-based permissions from arms_role_permissions. NULL means use role defaults.';

-- Done!
SELECT 'ARMS per-user permissions migration complete' AS status;
