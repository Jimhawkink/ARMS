-- ═══════════════════════════════════════════════════════════════
-- ARMS Row Level Security (RLS) — Run in Supabase SQL Editor
-- This enables RLS on all ARMS tables and creates permissive
-- policies for authenticated access via the anon key.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Enable RLS on all ARMS tables
ALTER TABLE IF EXISTS arms_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_mpesa_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_stk_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_sms_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_demand_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_utility_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_caretakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_petty_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arms_licenses ENABLE ROW LEVEL SECURITY;

-- Step 2: Create policies that allow the anon key full access
-- (Your app authenticates users at the application level via arms_users table)
-- These policies ensure the anon key can still perform CRUD operations

-- Helper: Drop existing policies to avoid conflicts
DO $$ 
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'arms_tenants','arms_payments','arms_billing','arms_locations',
        'arms_units','arms_users','arms_mpesa_transactions','arms_stk_requests',
        'arms_portal_users','arms_expenses','arms_sms_log','arms_demand_letters',
        'arms_utility_readings','arms_caretakers','arms_petty_cash',
        'arms_checklists','arms_checklist_items','arms_licenses'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON %I', tbl);
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;
    END LOOP;
END $$;

-- Create permissive policies for anon role (your app's default)
DO $$ 
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'arms_tenants','arms_payments','arms_billing','arms_locations',
        'arms_units','arms_users','arms_mpesa_transactions','arms_stk_requests',
        'arms_portal_users','arms_expenses','arms_sms_log','arms_demand_letters',
        'arms_utility_readings','arms_caretakers','arms_petty_cash',
        'arms_checklists','arms_checklist_items','arms_licenses'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        BEGIN
            EXECUTE format(
                'CREATE POLICY "Allow anon full access" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
                tbl
            );
        EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'Table % does not exist, skipping', tbl;
        END;
    END LOOP;
END $$;

-- NOTE: The policies above allow full access via anon key.
-- For STRICTER security in the future, replace with JWT-based
-- auth where each user gets a Supabase auth token and policies
-- restrict access based on auth.uid().
