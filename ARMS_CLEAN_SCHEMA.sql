-- ============================================================
-- ARMS CLEAN SCHEMA - Properly Ordered
-- Run this in Supabase SQL Editor (Run without RLS)
-- ============================================================

-- ==================== CORE TABLES ====================

CREATE TABLE IF NOT EXISTS public.arms_users (
    user_id SERIAL PRIMARY KEY,
    user_name VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(20),
    user_type VARCHAR(50) DEFAULT 'admin',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_role VARCHAR DEFAULT 'admin',
    allowed_location_ids INTEGER[] DEFAULT '{}',
    is_super_admin BOOLEAN DEFAULT false,
    custom_permissions JSONB DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS public.arms_settings (
    setting_id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.arms_locations (
    location_id SERIAL PRIMARY KEY,
    location_name VARCHAR(200) NOT NULL,
    address TEXT,
    description TEXT,
    total_units INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.arms_units (
    unit_id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES public.arms_locations(location_id) ON DELETE CASCADE,
    unit_name VARCHAR(100) NOT NULL,
    unit_type VARCHAR(50) DEFAULT 'Single Room',
    monthly_rent DECIMAL(12,2) NOT NULL DEFAULT 0,
    deposit_amount DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'Vacant',
    floor_number VARCHAR(20),
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.arms_tenants (
    tenant_id SERIAL PRIMARY KEY,
    tenant_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(200),
    id_number VARCHAR(50),
    unit_id INTEGER REFERENCES public.arms_units(unit_id),
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    monthly_rent DECIMAL(12,2) NOT NULL DEFAULT 0,
    deposit_paid DECIMAL(12,2) DEFAULT 0,
    move_in_date DATE,
    move_out_date DATE,
    billing_start_month VARCHAR(7),
    status VARCHAR(30) DEFAULT 'Active',
    emergency_contact VARCHAR(200),
    emergency_phone VARCHAR(20),
    notes TEXT,
    balance DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    mobile_pin VARCHAR(6),
    password_hash VARCHAR(255) DEFAULT NULL,
    last_login TIMESTAMPTZ DEFAULT NULL,
    login_count INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMPTZ DEFAULT NULL,
    is_on_vacation BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.arms_billing (
    billing_id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES public.arms_tenants(tenant_id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    unit_id INTEGER REFERENCES public.arms_units(unit_id),
    billing_month VARCHAR(7) NOT NULL,
    billing_date DATE NOT NULL,
    due_date DATE NOT NULL,
    rent_amount DECIMAL(12,2) NOT NULL,
    amount_paid DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'Unpaid',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.arms_payments (
    payment_id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES public.arms_tenants(tenant_id) ON DELETE CASCADE,
    billing_id INTEGER REFERENCES public.arms_billing(billing_id),
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash',
    mpesa_receipt VARCHAR(50),
    mpesa_phone VARCHAR(20),
    mpesa_name VARCHAR,
    reference_no VARCHAR(100),
    payment_date TIMESTAMPTZ DEFAULT NOW(),
    recorded_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.arms_mpesa_transactions (
    id SERIAL PRIMARY KEY,
    transaction_type VARCHAR(50),
    trans_id VARCHAR(50) UNIQUE,
    trans_time VARCHAR(50),
    trans_amount DECIMAL(12,2),
    business_short_code VARCHAR(20),
    bill_ref_number VARCHAR(100),
    invoice_number VARCHAR(100),
    org_account_balance DECIMAL(12,2),
    third_party_trans_id VARCHAR(100),
    msisdn VARCHAR(20),
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    matched BOOLEAN DEFAULT false,
    tenant_id INTEGER REFERENCES public.arms_tenants(tenant_id),
    payment_id INTEGER REFERENCES public.arms_payments(payment_id),
    matched_at TIMESTAMPTZ,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== STK PUSH (must be before mpesa_config references it) ====================

CREATE TABLE IF NOT EXISTS public.arms_stk_requests (
    id SERIAL PRIMARY KEY,
    checkout_request_id VARCHAR NOT NULL UNIQUE,
    merchant_request_id VARCHAR,
    phone VARCHAR,
    amount NUMERIC DEFAULT 0,
    account_reference VARCHAR,
    tenant_id INTEGER REFERENCES public.arms_tenants(tenant_id),
    unit_id INTEGER REFERENCES public.arms_units(unit_id),
    status VARCHAR DEFAULT 'Pending',
    mpesa_receipt VARCHAR,
    amount_paid NUMERIC DEFAULT 0,
    result_code INTEGER,
    result_desc TEXT,
    raw_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== LICENSES ====================

CREATE TABLE IF NOT EXISTS public.arms_licenses (
    license_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT UNIQUE NOT NULL,
    client_name TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    machine_id TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT false,
    features JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ DEFAULT NULL,
    revoked_at TIMESTAMPTZ DEFAULT NULL,
    notes TEXT DEFAULT NULL
);

-- ==================== TENANT LICENSES ====================

CREATE TABLE IF NOT EXISTS public.arms_tenant_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id INTEGER NOT NULL REFERENCES public.arms_tenants(tenant_id) ON DELETE CASCADE,
    phone TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    licensed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ DEFAULT NULL,
    revoked_reason TEXT DEFAULT NULL,
    CONSTRAINT arms_tenant_licenses_tenant_id_unique UNIQUE (tenant_id)
);

-- ==================== PER-UNIT MPESA CONFIG ====================

CREATE TABLE IF NOT EXISTS public.arms_unit_mpesa_config (
    config_id SERIAL PRIMARY KEY,
    unit_id INTEGER UNIQUE NOT NULL REFERENCES public.arms_units(unit_id) ON DELETE CASCADE,
    till_number VARCHAR(20) DEFAULT '',
    shortcode VARCHAR(20) DEFAULT '',
    consumer_key TEXT DEFAULT '',
    consumer_secret TEXT DEFAULT '',
    passkey TEXT DEFAULT '',
    environment VARCHAR(20) DEFAULT 'production',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== EXPENSES ====================

CREATE TABLE IF NOT EXISTS public.arms_expenses (
    expense_id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) DEFAULT 'Cash',
    vendor VARCHAR(200),
    receipt_number VARCHAR(100),
    recorded_by VARCHAR(100),
    recurring BOOLEAN DEFAULT FALSE,
    recurring_interval VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== UTILITY BILLING ====================

CREATE TABLE IF NOT EXISTS public.arms_utility_types (
    utility_type_id SERIAL PRIMARY KEY,
    utility_name VARCHAR NOT NULL,
    unit_of_measure VARCHAR DEFAULT 'Units',
    billing_method VARCHAR DEFAULT 'postpaid',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.arms_meter_readings (
    reading_id SERIAL PRIMARY KEY,
    unit_id INTEGER NOT NULL REFERENCES public.arms_units(unit_id),
    utility_type_id INTEGER NOT NULL REFERENCES public.arms_utility_types(utility_type_id),
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    previous_reading NUMERIC DEFAULT 0,
    current_reading NUMERIC NOT NULL,
    consumption NUMERIC GENERATED ALWAYS AS (current_reading - previous_reading) STORED,
    reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reading_type VARCHAR DEFAULT 'Regular',
    read_by VARCHAR,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.arms_utility_bills (
    utility_bill_id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES public.arms_tenants(tenant_id),
    unit_id INTEGER NOT NULL REFERENCES public.arms_units(unit_id),
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    utility_type_id INTEGER NOT NULL REFERENCES public.arms_utility_types(utility_type_id),
    reading_id INTEGER REFERENCES public.arms_meter_readings(reading_id),
    billing_month VARCHAR NOT NULL,
    previous_reading NUMERIC DEFAULT 0,
    current_reading NUMERIC DEFAULT 0,
    consumption NUMERIC DEFAULT 0,
    rate_per_unit NUMERIC NOT NULL DEFAULT 0,
    fixed_charge NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    amount_paid NUMERIC DEFAULT 0,
    balance NUMERIC NOT NULL DEFAULT 0,
    status VARCHAR DEFAULT 'Unpaid',
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.arms_prepaid_tokens (
    token_id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES public.arms_tenants(tenant_id),
    unit_id INTEGER NOT NULL REFERENCES public.arms_units(unit_id),
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    utility_type_id INTEGER NOT NULL REFERENCES public.arms_utility_types(utility_type_id),
    token_number VARCHAR,
    amount_paid NUMERIC NOT NULL,
    units_purchased NUMERIC NOT NULL DEFAULT 0,
    rate_per_unit NUMERIC NOT NULL DEFAULT 0,
    purchase_date TIMESTAMPTZ DEFAULT NOW(),
    vended_at TIMESTAMPTZ,
    status VARCHAR DEFAULT 'Purchased',
    meter_number VARCHAR,
    receipt_number VARCHAR,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== CARETAKERS ====================

CREATE TABLE IF NOT EXISTS public.arms_caretakers (
    caretaker_id SERIAL PRIMARY KEY,
    caretaker_name VARCHAR NOT NULL,
    phone VARCHAR NOT NULL,
    email VARCHAR,
    id_number VARCHAR,
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    role VARCHAR DEFAULT 'Caretaker',
    monthly_salary NUMERIC DEFAULT 0,
    pay_day INTEGER DEFAULT 28,
    is_active BOOLEAN DEFAULT true,
    assigned_units TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== DEMAND LETTERS ====================

CREATE TABLE IF NOT EXISTS public.arms_demand_letters (
    letter_id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES public.arms_tenants(tenant_id),
    location_id INTEGER REFERENCES public.arms_locations(location_id),
    unit_id INTEGER REFERENCES public.arms_units(unit_id),
    letter_type VARCHAR NOT NULL,
    subject VARCHAR NOT NULL,
    body TEXT NOT NULL,
    amount_owed NUMERIC DEFAULT 0,
    deadline_date DATE,
    issued_date DATE DEFAULT CURRENT_DATE,
    delivery_method VARCHAR DEFAULT 'SMS',
    sms_sent BOOLEAN DEFAULT false,
    whatsapp_sent BOOLEAN DEFAULT false,
    email_sent BOOLEAN DEFAULT false,
    status VARCHAR DEFAULT 'Draft',
    issued_by VARCHAR,
    tenant_acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== CHECKLIST TEMPLATES ====================

CREATE TABLE IF NOT EXISTS public.arms_checklist_templates (
    template_id SERIAL PRIMARY KEY,
    template_type VARCHAR NOT NULL,
    item_name VARCHAR NOT NULL,
    category VARCHAR DEFAULT 'General',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.arms_checklist_items (
    item_id SERIAL PRIMARY KEY,
    checklist_id INTEGER NOT NULL,
    item_name VARCHAR NOT NULL,
    category VARCHAR DEFAULT 'General',
    condition VARCHAR DEFAULT 'Good',
    quantity INTEGER DEFAULT 1,
    notes TEXT,
    photo_url TEXT
);

-- ==================== MULTI-ROOM JUNCTION TABLE ====================

CREATE TABLE IF NOT EXISTS public.arms_tenant_units (
    tenant_unit_id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES public.arms_tenants(tenant_id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES public.arms_units(unit_id),
    is_primary BOOLEAN DEFAULT false,
    custom_rent NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, unit_id)
);

-- ==================== ROLE PERMISSIONS ====================

CREATE TABLE IF NOT EXISTS public.arms_role_permissions (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR NOT NULL,
    can_manage_tenants BOOLEAN DEFAULT false,
    can_manage_units BOOLEAN DEFAULT false,
    can_record_payments BOOLEAN DEFAULT false,
    can_view_reports BOOLEAN DEFAULT false,
    can_send_sms BOOLEAN DEFAULT false,
    can_manage_utilities BOOLEAN DEFAULT false,
    can_manage_caretakers BOOLEAN DEFAULT false,
    can_issue_demand_letters BOOLEAN DEFAULT false,
    can_manage_settings BOOLEAN DEFAULT false,
    can_manage_users BOOLEAN DEFAULT false,
    can_view_dashboard BOOLEAN DEFAULT true,
    can_manage_expenses BOOLEAN DEFAULT false,
    can_manage_billing BOOLEAN DEFAULT false,
    can_manage_checklists BOOLEAN DEFAULT false,
    is_super_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT arms_role_permissions_role_name_unique UNIQUE (role_name)
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_arms_units_location ON public.arms_units(location_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenants_unit ON public.arms_tenants(unit_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenants_location ON public.arms_tenants(location_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenants_phone ON public.arms_tenants(phone);
CREATE INDEX IF NOT EXISTS idx_arms_billing_tenant ON public.arms_billing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_billing_month ON public.arms_billing(billing_month);
CREATE INDEX IF NOT EXISTS idx_arms_payments_tenant ON public.arms_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_payments_billing ON public.arms_payments(billing_id);
CREATE INDEX IF NOT EXISTS idx_arms_mpesa_msisdn ON public.arms_mpesa_transactions(msisdn);
CREATE INDEX IF NOT EXISTS idx_arms_mpesa_matched ON public.arms_mpesa_transactions(matched);
CREATE INDEX IF NOT EXISTS idx_expenses_location ON public.arms_expenses(location_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.arms_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_arms_meter_readings_unit_date ON public.arms_meter_readings(unit_id, reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_arms_utility_bills_tenant_month ON public.arms_utility_bills(tenant_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_arms_demand_letters_tenant ON public.arms_demand_letters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenant_licenses_tenant_id ON public.arms_tenant_licenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenant_licenses_phone ON public.arms_tenant_licenses(phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_mpesa_config_unit ON public.arms_unit_mpesa_config(unit_id);
CREATE INDEX IF NOT EXISTS idx_tenant_units_tenant ON public.arms_tenant_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_units_unit ON public.arms_tenant_units(unit_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenants_mobile_pin ON public.arms_tenants(mobile_pin) WHERE mobile_pin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arms_tenants_phone_login ON public.arms_tenants(phone) WHERE phone IS NOT NULL AND status = 'Active';

-- ==================== RLS POLICIES (Allow all via anon key) ====================

ALTER TABLE public.arms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_mpesa_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_stk_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_demand_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_caretakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_utility_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_utility_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_prepaid_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_unit_mpesa_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_tenant_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_tenant_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arms_checklist_items ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'arms_users','arms_settings','arms_locations','arms_units',
        'arms_tenants','arms_billing','arms_payments','arms_mpesa_transactions',
        'arms_stk_requests','arms_expenses','arms_demand_letters','arms_caretakers',
        'arms_utility_types','arms_meter_readings','arms_utility_bills',
        'arms_prepaid_tokens','arms_unit_mpesa_config','arms_tenant_units',
        'arms_tenant_licenses','arms_role_permissions','arms_checklist_templates',
        'arms_checklist_items'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        BEGIN
            EXECUTE format(
                'DROP POLICY IF EXISTS "Allow anon full access" ON public.%I', tbl
            );
            EXECUTE format(
                'CREATE POLICY "Allow anon full access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)',
                tbl
            );
        EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'Table % does not exist, skipping', tbl;
        END;
    END LOOP;
END $$;

-- arms_licenses: block anon, allow service role
DROP POLICY IF EXISTS "arms_licenses_anon_no_access" ON public.arms_licenses;
DROP POLICY IF EXISTS "arms_licenses_service_full_access" ON public.arms_licenses;
CREATE POLICY "arms_licenses_anon_no_access" ON public.arms_licenses FOR ALL TO anon USING (false);
CREATE POLICY "arms_licenses_service_full_access" ON public.arms_licenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- STK requests realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.arms_stk_requests;

-- ==================== SEED DATA ====================

INSERT INTO public.arms_users (user_name, password_hash, name, email, phone, user_type, user_role, active, is_super_admin, allowed_location_ids)
VALUES ('jimhawkins', 'Arms@2024!SuperAdmin', 'Jimhawkins Korir', 'jimhawkins@alphasolutions.co.ke', '0720316175', 'admin', 'admin', true, true, '{}')
ON CONFLICT (user_name) DO UPDATE SET is_super_admin = true, active = true;

INSERT INTO public.arms_settings (setting_key, setting_value) VALUES
('company_name', 'Alpha Rental Management System'),
('company_phone', '0720316175'),
('company_email', 'info@arms.com'),
('mpesa_shortcode', '9830453'),
('currency', 'KES')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.arms_utility_types (utility_name, unit_of_measure, billing_method) VALUES
('Water', 'Cubic Metres', 'postpaid'),
('Electricity', 'kWh', 'prepaid'),
('Gas', 'Cubic Metres', 'postpaid'),
('Garbage', 'Flat Rate', 'postpaid')
ON CONFLICT DO NOTHING;

INSERT INTO public.arms_role_permissions (role_name, can_manage_tenants, can_manage_units, can_record_payments, can_view_reports, can_send_sms, can_manage_utilities, can_manage_caretakers, can_issue_demand_letters, can_manage_settings, can_manage_users, can_manage_expenses, can_manage_billing, can_manage_checklists, is_super_admin) VALUES
('admin', true, true, true, true, true, true, true, true, true, true, true, true, true, true),
('manager', true, true, true, true, true, true, true, true, false, false, true, true, true, false),
('caretaker', true, false, true, false, true, true, false, false, false, false, false, false, true, false),
('agent', true, true, true, true, true, true, false, true, false, false, true, true, true, false),
('viewer', false, false, false, true, false, false, false, false, false, false, false, false, false, false)
ON CONFLICT (role_name) DO NOTHING;

SELECT 'ARMS schema created successfully!' AS status;
