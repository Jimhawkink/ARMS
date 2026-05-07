-- ============================================================
-- ARMS: Add Vacation Support for Kenyan University Hostels
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add is_on_vacation column to arms_tenants
ALTER TABLE public.arms_tenants 
ADD COLUMN IF NOT EXISTS is_on_vacation BOOLEAN DEFAULT false;

-- Verify
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'arms_tenants' 
AND column_name = 'is_on_vacation';
