-- ============================================================
-- ARMS Multi-Room Tenant Support Migration
-- Allows tenants to rent multiple rooms (e.g. Room 1, Room 2, Store, Hardware)
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Junction table: maps tenants to multiple units/rooms
CREATE TABLE IF NOT EXISTS arms_tenant_units (
  tenant_unit_id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES arms_tenants(tenant_id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES arms_units(unit_id),
  is_primary BOOLEAN DEFAULT false,
  custom_rent NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, unit_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenant_units_tenant ON arms_tenant_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_units_unit ON arms_tenant_units(unit_id);

-- Backfill: Populate from existing active tenants
-- Their current unit_id becomes the primary room
INSERT INTO arms_tenant_units (tenant_id, unit_id, is_primary, custom_rent)
SELECT t.tenant_id, t.unit_id, true, t.monthly_rent
FROM arms_tenants t
WHERE t.unit_id IS NOT NULL AND t.status = 'Active'
ON CONFLICT (tenant_id, unit_id) DO NOTHING;

-- Done! The arms_tenants.unit_id column stays as the "primary" unit
-- monthly_rent in arms_tenants = TOTAL rent across all rooms
-- Individual room rents are tracked in arms_tenant_units.custom_rent
