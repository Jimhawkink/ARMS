-- ============================================
-- ARMS MIGRATION: Add billing_start_month
-- Run this on your existing Supabase database
-- ============================================

ALTER TABLE arms_tenants 
ADD COLUMN IF NOT EXISTS billing_start_month VARCHAR(7);

-- Optionally backfill from move_in_date for existing tenants
UPDATE arms_tenants 
SET billing_start_month = TO_CHAR(move_in_date, 'YYYY-MM')
WHERE billing_start_month IS NULL AND move_in_date IS NOT NULL;
