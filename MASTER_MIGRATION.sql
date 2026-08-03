-- =====================================================
-- FILE: arms_schema.sql
-- =====================================================
-- ============================================
-- ALPHA RENTAL MANAGEMENT SYSTEM (ARMS)
-- Complete Database Schema
-- Supabase PostgreSQL
-- ============================================

-- ==================== USERS ====================
CREATE TABLE IF NOT EXISTS arms_users (
    user_id SERIAL PRIMARY KEY,
    user_name VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(20),
    user_type VARCHAR(50) DEFAULT 'admin',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== SETTINGS ====================
CREATE TABLE IF NOT EXISTS arms_settings (
    setting_id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== LOCATIONS ====================
CREATE TABLE IF NOT EXISTS arms_locations (
    location_id SERIAL PRIMARY KEY,
    location_name VARCHAR(200) NOT NULL,
    address TEXT,
    description TEXT,
    total_units INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== UNITS ====================
CREATE TABLE IF NOT EXISTS arms_units (
    unit_id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES arms_locations(location_id) ON DELETE CASCADE,
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

-- ==================== TENANTS ====================
CREATE TABLE IF NOT EXISTS arms_tenants (
    tenant_id SERIAL PRIMARY KEY,
    tenant_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(200),
    id_number VARCHAR(50),
    unit_id INTEGER REFERENCES arms_units(unit_id),
    location_id INTEGER REFERENCES arms_locations(location_id),
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
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== BILLING ====================
CREATE TABLE IF NOT EXISTS arms_billing (
    billing_id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES arms_tenants(tenant_id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES arms_locations(location_id),
    unit_id INTEGER REFERENCES arms_units(unit_id),
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

-- ==================== PAYMENTS ====================
CREATE TABLE IF NOT EXISTS arms_payments (
    payment_id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES arms_tenants(tenant_id) ON DELETE CASCADE,
    billing_id INTEGER REFERENCES arms_billing(billing_id),
    location_id INTEGER REFERENCES arms_locations(location_id),
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash',
    mpesa_receipt VARCHAR(50),
    mpesa_phone VARCHAR(20),
    reference_no VARCHAR(100),
    payment_date TIMESTAMPTZ DEFAULT NOW(),
    recorded_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== M-PESA C2B TRANSACTIONS ====================
CREATE TABLE IF NOT EXISTS arms_mpesa_transactions (
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
    tenant_id INTEGER REFERENCES arms_tenants(tenant_id),
    payment_id INTEGER REFERENCES arms_payments(payment_id),
    matched_at TIMESTAMPTZ,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_arms_units_location ON arms_units(location_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenants_unit ON arms_tenants(unit_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenants_location ON arms_tenants(location_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenants_phone ON arms_tenants(phone);
CREATE INDEX IF NOT EXISTS idx_arms_billing_tenant ON arms_billing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_billing_month ON arms_billing(billing_month);
CREATE INDEX IF NOT EXISTS idx_arms_payments_tenant ON arms_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_payments_billing ON arms_payments(billing_id);
CREATE INDEX IF NOT EXISTS idx_arms_mpesa_msisdn ON arms_mpesa_transactions(msisdn);
CREATE INDEX IF NOT EXISTS idx_arms_mpesa_matched ON arms_mpesa_transactions(matched);

-- ==================== DISABLE RLS FOR SIMPLICITY ====================
ALTER TABLE arms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE arms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE arms_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE arms_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE arms_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE arms_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE arms_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE arms_mpesa_transactions ENABLE ROW LEVEL SECURITY;

-- Allow all access with anon key (same pattern as AlphaRetail)
DO $$ BEGIN
    CREATE POLICY "Allow all arms_users" ON arms_users FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow all arms_settings" ON arms_settings FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow all arms_locations" ON arms_locations FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow all arms_units" ON arms_units FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow all arms_tenants" ON arms_tenants FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow all arms_billing" ON arms_billing FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow all arms_payments" ON arms_payments FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Allow all arms_mpesa_transactions" ON arms_mpesa_transactions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==================== EXPENSES ====================
CREATE TABLE IF NOT EXISTS arms_expenses (
    expense_id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES arms_locations(location_id),
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

CREATE INDEX IF NOT EXISTS idx_expenses_location ON arms_expenses(location_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON arms_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON arms_expenses(category);

DO $$ BEGIN
    CREATE POLICY "Allow all arms_expenses" ON arms_expenses FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==================== SEED DATA ====================

-- Default admin user (password: admin123)
INSERT INTO arms_users (user_name, password_hash, name, email, phone, user_type)
VALUES ('admin', 'admin123', 'System Admin', 'admin@arms.com', '0720316175', 'admin')
ON CONFLICT (user_name) DO NOTHING;

-- Default settings
INSERT INTO arms_settings (setting_key, setting_value) VALUES
('company_name', 'Alpha Rental Management System'),
('company_phone', '0720316175'),
('company_email', 'info@arms.com'),
('mpesa_shortcode', '9830453'),
('currency', 'KES')
ON CONFLICT (setting_key) DO NOTHING;

-- 5 Locations
INSERT INTO arms_locations (location_name, address, description) VALUES
('METIPSO', 'Metipso Area', 'Metipso Rental Properties'),
('MM', 'MM Area', 'MM Rental Properties'),
('KABISOGE UPPER', 'Kabisoge Upper Area', 'Kabisoge Upper Rental Properties'),
('KABISOGE LOWER', 'Kabisoge Lower Area', 'Kabisoge Lower Rental Properties'),
('KABISOGE MAIN', 'Kabisoge Main Area', 'Kabisoge Main Rental Properties');



-- =====================================================
-- FILE: arms_ultra_features_migration.sql
-- =====================================================
-- ============================================================
-- ARMS Ultra Features Migration
-- Adds: Utility billing, Caretakers, SMS/Comms, Checklists,
--       Demand letters, Access control, Tenant portal
-- ============================================================

-- ==================== WATER & UTILITY BILLING ====================

-- Utility types (Water, Electricity, Gas, etc.)
CREATE TABLE IF NOT EXISTS public.arms_utility_types (
    utility_type_id SERIAL,
    utility_name character varying NOT NULL,
    unit_of_measure character varying DEFAULT 'Units'::character varying,
    billing_method character varying DEFAULT 'postpaid'::character varying, -- postpaid / prepaid
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_utility_types_pkey PRIMARY KEY (utility_type_id)
);

-- Meter readings per unit
CREATE TABLE IF NOT EXISTS public.arms_meter_readings (
    reading_id SERIAL,
    unit_id integer NOT NULL,
    utility_type_id integer NOT NULL,
    location_id integer,
    previous_reading numeric DEFAULT 0,
    current_reading numeric NOT NULL,
    consumption numeric GENERATED ALWAYS AS (current_reading - previous_reading) STORED,
    reading_date date NOT NULL DEFAULT CURRENT_DATE,
    reading_type character varying DEFAULT 'Regular'::character varying, -- Regular / Estimated
    read_by character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_meter_readings_pkey PRIMARY KEY (reading_id),
    CONSTRAINT arms_meter_readings_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.arms_units(unit_id),
    CONSTRAINT arms_meter_readings_utility_type_id_fkey FOREIGN KEY (utility_type_id) REFERENCES public.arms_utility_types(utility_type_id),
    CONSTRAINT arms_meter_readings_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- Utility bills (generated from meter readings)
CREATE TABLE IF NOT EXISTS public.arms_utility_bills (
    utility_bill_id SERIAL,
    tenant_id integer NOT NULL,
    unit_id integer NOT NULL,
    location_id integer,
    utility_type_id integer NOT NULL,
    reading_id integer,
    billing_month character varying NOT NULL,
    previous_reading numeric DEFAULT 0,
    current_reading numeric DEFAULT 0,
    consumption numeric DEFAULT 0,
    rate_per_unit numeric NOT NULL DEFAULT 0,
    fixed_charge numeric DEFAULT 0,
    total_amount numeric NOT NULL DEFAULT 0,
    amount_paid numeric DEFAULT 0,
    balance numeric NOT NULL DEFAULT 0,
    status character varying DEFAULT 'Unpaid'::character varying,
    due_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_utility_bills_pkey PRIMARY KEY (utility_bill_id),
    CONSTRAINT arms_utility_bills_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.arms_tenants(tenant_id),
    CONSTRAINT arms_utility_bills_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.arms_units(unit_id),
    CONSTRAINT arms_utility_bills_utility_type_id_fkey FOREIGN KEY (utility_type_id) REFERENCES public.arms_utility_types(utility_type_id),
    CONSTRAINT arms_utility_bills_reading_id_fkey FOREIGN KEY (reading_id) REFERENCES public.arms_meter_readings(reading_id),
    CONSTRAINT arms_utility_bills_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- Prepaid tokens (for electricity sub-metering)
CREATE TABLE IF NOT EXISTS public.arms_prepaid_tokens (
    token_id SERIAL,
    tenant_id integer NOT NULL,
    unit_id integer NOT NULL,
    location_id integer,
    utility_type_id integer NOT NULL,
    token_number character varying,
    amount_paid numeric NOT NULL,
    units_purchased numeric NOT NULL DEFAULT 0,
    rate_per_unit numeric NOT NULL DEFAULT 0,
    purchase_date timestamp with time zone DEFAULT now(),
    vended_at timestamp with time zone,
    status character varying DEFAULT 'Purchased'::character varying, -- Purchased / Vended / Expired
    meter_number character varying,
    receipt_number character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_prepaid_tokens_pkey PRIMARY KEY (token_id),
    CONSTRAINT arms_prepaid_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.arms_tenants(tenant_id),
    CONSTRAINT arms_prepaid_tokens_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.arms_units(unit_id),
    CONSTRAINT arms_prepaid_tokens_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- Seed default utility types
INSERT INTO public.arms_utility_types (utility_name, unit_of_measure, billing_method) VALUES
    ('Water', 'Cubic Metres', 'postpaid'),
    ('Electricity', 'kWh', 'prepaid'),
    ('Gas', 'Cubic Metres', 'postpaid'),
    ('Garbage', 'Flat Rate', 'postpaid')
ON CONFLICT DO NOTHING;

-- ==================== CARETAKER MANAGEMENT ====================

CREATE TABLE IF NOT EXISTS public.arms_caretakers (
    caretaker_id SERIAL,
    caretaker_name character varying NOT NULL,
    phone character varying NOT NULL,
    email character varying,
    id_number character varying,
    location_id integer,
    role character varying DEFAULT 'Caretaker'::character varying, -- Caretaker / Agent / Supervisor
    monthly_salary numeric DEFAULT 0,
    pay_day integer DEFAULT 28,
    is_active boolean DEFAULT true,
    assigned_units text, -- comma-separated unit_ids or 'all'
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_caretakers_pkey PRIMARY KEY (caretaker_id),
    CONSTRAINT arms_caretakers_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- Caretaker salary payments
CREATE TABLE IF NOT EXISTS public.arms_caretaker_salaries (
    salary_id SERIAL,
    caretaker_id integer NOT NULL,
    location_id integer,
    pay_period character varying NOT NULL, -- e.g. '2026-04'
    basic_salary numeric DEFAULT 0,
    allowances numeric DEFAULT 0,
    deductions numeric DEFAULT 0,
    net_pay numeric NOT NULL DEFAULT 0,
    payment_method character varying DEFAULT 'M-Pesa'::character varying,
    mpesa_receipt character varying,
    payment_date date DEFAULT CURRENT_DATE,
    status character varying DEFAULT 'Pending'::character varying, -- Pending / Paid
    paid_by character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_caretaker_salaries_pkey PRIMARY KEY (salary_id),
    CONSTRAINT arms_caretaker_salaries_caretaker_id_fkey FOREIGN KEY (caretaker_id) REFERENCES public.arms_caretakers(caretaker_id),
    CONSTRAINT arms_caretaker_salaries_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- Petty cash
CREATE TABLE IF NOT EXISTS public.arms_petty_cash (
    petty_cash_id SERIAL,
    location_id integer,
    transaction_type character varying NOT NULL, -- Income / Expense
    amount numeric NOT NULL,
    description text,
    category character varying,
    receipt_number character varying,
    transaction_date date DEFAULT CURRENT_DATE,
    recorded_by character varying,
    caretaker_id integer,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_petty_cash_pkey PRIMARY KEY (petty_cash_id),
    CONSTRAINT arms_petty_cash_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id),
    CONSTRAINT arms_petty_cash_caretaker_id_fkey FOREIGN KEY (caretaker_id) REFERENCES public.arms_caretakers(caretaker_id)
);

-- ==================== SMS & COMMUNICATION ====================

-- SMS configuration (AfricasTalking)
CREATE TABLE IF NOT EXISTS public.arms_sms_config (
    config_id SERIAL,
    provider character varying DEFAULT 'AfricasTalking'::character varying,
    api_key character varying NOT NULL,
    username character varying NOT NULL,
    sender_id character varying,
    short_code character varying,
    is_active boolean DEFAULT true,
    is_sandbox boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_sms_config_pkey PRIMARY KEY (config_id)
);

-- SMS logs
CREATE TABLE IF NOT EXISTS public.arms_sms_logs (
    sms_id SERIAL,
    recipient_phone character varying NOT NULL,
    recipient_name character varying,
    message text NOT NULL,
    message_type character varying DEFAULT 'Custom'::character varying, -- Reminder / Demand / Custom / Bulk
    tenant_id integer,
    location_id integer,
    provider character varying DEFAULT 'AfricasTalking'::character varying,
    provider_message_id character varying,
    status character varying DEFAULT 'Queued'::character varying, -- Queued / Sent / Delivered / Failed
    cost numeric DEFAULT 0,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    error_message text,
    sent_by character varying,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_sms_logs_pkey PRIMARY KEY (sms_id),
    CONSTRAINT arms_sms_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.arms_tenants(tenant_id),
    CONSTRAINT arms_sms_logs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- Automated reminder rules
CREATE TABLE IF NOT EXISTS public.arms_reminder_rules (
    rule_id SERIAL,
    rule_name character varying NOT NULL,
    trigger_type character varying NOT NULL, -- before_due / after_due / on_arrears
    days_offset integer DEFAULT 0, -- e.g. -3 = 3 days before due, +5 = 5 days after due
    message_template text NOT NULL,
    is_active boolean DEFAULT true,
    location_id integer, -- null = all locations
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_reminder_rules_pkey PRIMARY KEY (rule_id),
    CONSTRAINT arms_reminder_rules_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- WhatsApp Business API config
CREATE TABLE IF NOT EXISTS public.arms_whatsapp_config (
    config_id SERIAL,
    business_phone_number character varying NOT NULL,
    access_token text NOT NULL,
    phone_number_id character varying,
    business_account_id character varying,
    webhook_verify_token character varying,
    is_active boolean DEFAULT true,
    is_sandbox boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_whatsapp_config_pkey PRIMARY KEY (config_id)
);

-- ==================== DEMAND LETTERS & DOCUMENTS ====================

CREATE TABLE IF NOT EXISTS public.arms_demand_letters (
    letter_id SERIAL,
    tenant_id integer NOT NULL,
    location_id integer,
    unit_id integer,
    letter_type character varying NOT NULL, -- Arrears / Eviction / Notice / Final_Demand
    subject character varying NOT NULL,
    body text NOT NULL,
    amount_owed numeric DEFAULT 0,
    deadline_date date,
    issued_date date DEFAULT CURRENT_DATE,
    delivery_method character varying DEFAULT 'SMS'::character varying, -- SMS / WhatsApp / Print / Email
    sms_sent boolean DEFAULT false,
    whatsapp_sent boolean DEFAULT false,
    email_sent boolean DEFAULT false,
    status character varying DEFAULT 'Draft'::character varying, -- Draft / Issued / Acknowledged / Escalated
    issued_by character varying,
    tenant_acknowledged boolean DEFAULT false,
    acknowledged_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_demand_letters_pkey PRIMARY KEY (letter_id),
    CONSTRAINT arms_demand_letters_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.arms_tenants(tenant_id),
    CONSTRAINT arms_demand_letters_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id),
    CONSTRAINT arms_demand_letters_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.arms_units(unit_id)
);

-- ==================== MOVE-IN / MOVE-OUT CHECKLISTS ====================

CREATE TABLE IF NOT EXISTS public.arms_checklists (
    checklist_id SERIAL,
    checklist_type character varying NOT NULL, -- MoveIn / MoveOut
    tenant_id integer NOT NULL,
    unit_id integer NOT NULL,
    location_id integer,
    checklist_date date DEFAULT CURRENT_DATE,
    overall_condition character varying DEFAULT 'Good'::character varying, -- Excellent / Good / Fair / Poor
    notes text,
    completed_by character varying,
    is_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_checklists_pkey PRIMARY KEY (checklist_id),
    CONSTRAINT arms_checklists_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.arms_tenants(tenant_id),
    CONSTRAINT arms_checklists_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.arms_units(unit_id),
    CONSTRAINT arms_checklists_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- Checklist items
CREATE TABLE IF NOT EXISTS public.arms_checklist_items (
    item_id SERIAL,
    checklist_id integer NOT NULL,
    item_name character varying NOT NULL,
    category character varying DEFAULT 'General'::character varying, -- Keys / Furniture / Fixtures / Appliances / Walls / Plumbing / Electrical / General
    condition character varying DEFAULT 'Good'::character varying, -- Excellent / Good / Fair / Poor / Broken / Missing
    quantity integer DEFAULT 1,
    notes text,
    photo_url text,
    CONSTRAINT arms_checklist_items_pkey PRIMARY KEY (item_id),
    CONSTRAINT arms_checklist_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.arms_checklists(checklist_id) ON DELETE CASCADE
);

-- Default checklist templates
CREATE TABLE IF NOT EXISTS public.arms_checklist_templates (
    template_id SERIAL,
    template_type character varying NOT NULL, -- MoveIn / MoveOut
    item_name character varying NOT NULL,
    category character varying DEFAULT 'General'::character varying,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    CONSTRAINT arms_checklist_templates_pkey PRIMARY KEY (template_id)
);

-- Seed default checklist templates
INSERT INTO public.arms_checklist_templates (template_type, item_name, category, sort_order) VALUES
    ('MoveIn', 'Door Keys', 'Keys', 1),
    ('MoveIn', 'Window Keys', 'Keys', 2),
    ('MoveIn', 'Mailbox Key', 'Keys', 3),
    ('MoveIn', 'Main Door Lock', 'Fixtures', 10),
    ('MoveIn', 'Window Locks', 'Fixtures', 11),
    ('MoveIn', 'Ceiling Lights', 'Electrical', 20),
    ('MoveIn', 'Power Sockets', 'Electrical', 21),
    ('MoveIn', 'Water Taps', 'Plumbing', 30),
    ('MoveIn', 'Toilet', 'Plumbing', 31),
    ('MoveIn', 'Shower/Bathroom', 'Plumbing', 32),
    ('MoveIn', 'Kitchen Sink', 'Plumbing', 33),
    ('MoveIn', 'Walls & Paint', 'Walls', 40),
    ('MoveIn', 'Floor Condition', 'Walls', 41),
    ('MoveIn', 'Curtain Rods', 'Fixtures', 50),
    ('MoveIn', 'Cabinets', 'Furniture', 60),
    ('MoveIn', 'Countertop', 'Furniture', 61),
    ('MoveOut', 'Door Keys Returned', 'Keys', 1),
    ('MoveOut', 'Window Keys Returned', 'Keys', 2),
    ('MoveOut', 'Mailbox Key Returned', 'Keys', 3),
    ('MoveOut', 'Walls Clean', 'Walls', 10),
    ('MoveOut', 'Floor Clean', 'Walls', 11),
    ('MoveOut', 'All Fixtures Intact', 'Fixtures', 20),
    ('MoveOut', 'No Damage to Locks', 'Fixtures', 21),
    ('MoveOut', 'Plumbing Working', 'Plumbing', 30),
    ('MoveOut', 'Electrical Working', 'Electrical', 31),
    ('MoveOut', 'No Leftover Items', 'General', 40),
    ('MoveOut', 'Meter Readings Taken', 'General', 41)
ON CONFLICT DO NOTHING;

-- ==================== ACCESS CONTROL ====================

-- Extend arms_users with role-based access
ALTER TABLE public.arms_users ADD COLUMN IF NOT EXISTS user_role character varying DEFAULT 'admin'::character varying;
-- Roles: admin / caretaker / agent / owner / viewer
ALTER TABLE public.arms_users ADD COLUMN IF NOT EXISTS allowed_location_ids integer[] DEFAULT '{}';
-- Empty array = all locations

-- Role permissions definition
CREATE TABLE IF NOT EXISTS public.arms_role_permissions (
    id SERIAL,
    role_name character varying NOT NULL,
    can_manage_tenants boolean DEFAULT false,
    can_manage_units boolean DEFAULT false,
    can_record_payments boolean DEFAULT false,
    can_view_reports boolean DEFAULT false,
    can_send_sms boolean DEFAULT false,
    can_manage_utilities boolean DEFAULT false,
    can_manage_caretakers boolean DEFAULT false,
    can_issue_demand_letters boolean DEFAULT false,
    can_manage_settings boolean DEFAULT false,
    can_manage_users boolean DEFAULT false,
    can_view_dashboard boolean DEFAULT true,
    can_manage_expenses boolean DEFAULT false,
    can_manage_billing boolean DEFAULT false,
    can_manage_checklists boolean DEFAULT false,
    is_super_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_role_permissions_pkey PRIMARY KEY (id),
    CONSTRAINT arms_role_permissions_role_name_unique UNIQUE (role_name)
);

-- Seed default roles
INSERT INTO public.arms_role_permissions (role_name, can_manage_tenants, can_manage_units, can_record_payments, can_view_reports, can_send_sms, can_manage_utilities, can_manage_caretakers, can_issue_demand_letters, can_manage_settings, can_manage_users, can_manage_expenses, can_manage_billing, can_manage_checklists, is_super_admin) VALUES
    ('admin', true, true, true, true, true, true, true, true, true, true, true, true, true, true),
    ('caretaker', true, false, true, false, true, true, false, false, false, false, false, false, true, false),
    ('agent', true, true, true, true, true, true, false, true, false, false, true, true, true, false),
    ('owner', false, false, false, true, false, false, false, false, false, false, true, false, false, false),
    ('viewer', false, false, false, true, false, false, false, false, false, false, false, false, false, false)
ON CONFLICT (role_name) DO NOTHING;

-- ==================== TENANT SELF-SERVICE PORTAL ====================

CREATE TABLE IF NOT EXISTS public.arms_portal_users (
    portal_user_id SERIAL,
    tenant_id integer NOT NULL,
    username character varying NOT NULL UNIQUE,
    password_hash character varying NOT NULL,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    login_count integer DEFAULT 0,
    reset_token character varying,
    reset_token_expires timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_portal_users_pkey PRIMARY KEY (portal_user_id),
    CONSTRAINT arms_portal_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.arms_tenants(tenant_id)
);

-- Tenant issues/maintenance requests
CREATE TABLE IF NOT EXISTS public.arms_tenant_issues (
    issue_id SERIAL,
    tenant_id integer NOT NULL,
    unit_id integer,
    location_id integer,
    issue_type character varying NOT NULL, -- Maintenance / Plumbing / Electrical / Noise / Security / Other
    subject character varying NOT NULL,
    description text NOT NULL,
    priority character varying DEFAULT 'Medium'::character varying, -- Low / Medium / High / Urgent
    status character varying DEFAULT 'Open'::character varying, -- Open / In_Progress / Resolved / Closed
    reported_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    assigned_to integer, -- caretaker_id
    resolution_notes text,
    photo_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_tenant_issues_pkey PRIMARY KEY (issue_id),
    CONSTRAINT arms_tenant_issues_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.arms_tenants(tenant_id),
    CONSTRAINT arms_tenant_issues_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.arms_units(unit_id),
    CONSTRAINT arms_tenant_issues_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id),
    CONSTRAINT arms_tenant_issues_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.arms_caretakers(caretaker_id)
);

-- ==================== UTILITY RATE CONFIG PER LOCATION ====================

CREATE TABLE IF NOT EXISTS public.arms_utility_rates (
    rate_id SERIAL,
    utility_type_id integer NOT NULL,
    location_id integer, -- null = default rate for all locations
    rate_per_unit numeric NOT NULL DEFAULT 0,
    fixed_charge numeric DEFAULT 0,
    minimum_charge numeric DEFAULT 0,
    effective_date date DEFAULT CURRENT_DATE,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_utility_rates_pkey PRIMARY KEY (rate_id),
    CONSTRAINT arms_utility_rates_utility_type_id_fkey FOREIGN KEY (utility_type_id) REFERENCES public.arms_utility_types(utility_type_id),
    CONSTRAINT arms_utility_rates_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.arms_locations(location_id)
);

-- Seed default rates (Kenya typical)
INSERT INTO public.arms_utility_rates (utility_type_id, rate_per_unit, fixed_charge, minimum_charge) VALUES
    (1, 50.00, 200.00, 200.00), -- Water: KES 50/mÂ³, KES 200 fixed
    (2, 25.00, 0, 0),            -- Electricity: KES 25/kWh
    (3, 100.00, 0, 0),           -- Gas: KES 100/mÂ³
    (4, 0, 500.00, 500.00)       -- Garbage: KES 500 flat
ON CONFLICT DO NOTHING;

-- ==================== INDEXES FOR PERFORMANCE ====================
CREATE INDEX IF NOT EXISTS idx_arms_meter_readings_unit_date ON public.arms_meter_readings(unit_id, reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_arms_utility_bills_tenant_month ON public.arms_utility_bills(tenant_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_arms_sms_logs_tenant ON public.arms_sms_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_sms_logs_created ON public.arms_sms_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arms_demand_letters_tenant ON public.arms_demand_letters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_tenant_issues_tenant ON public.arms_tenant_issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_checklists_tenant ON public.arms_checklists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arms_caretaker_salaries_caretaker ON public.arms_caretaker_salaries(caretaker_id, pay_period);



-- =====================================================
-- FILE: arms_migration_billing_start.sql
-- =====================================================
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



-- =====================================================
-- FILE: arms_mobile_migration.sql
-- =====================================================
-- ============================================================
-- ARMS MOBILE APP MIGRATION
-- Adds mobile_pin to arms_tenants for tenant mobile app login
-- Run this once on your Supabase PostgreSQL database
-- ============================================================

-- 1. Add mobile_pin column to arms_tenants
ALTER TABLE arms_tenants
ADD COLUMN IF NOT EXISTS mobile_pin VARCHAR(6);

-- 2. Index for fast PIN lookups (partial â€” only indexed when set)
CREATE INDEX IF NOT EXISTS idx_arms_tenants_mobile_pin
ON arms_tenants(mobile_pin)
WHERE mobile_pin IS NOT NULL;

-- 3. Column comment for documentation
COMMENT ON COLUMN arms_tenants.mobile_pin IS
'4-6 digit numeric PIN set by admin for tenant mobile app login. Never store unhashed in production beyond MVP.';

-- ============================================================
-- VERIFICATION QUERY â€” run after migration
-- Should show the new column:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'arms_tenants' AND column_name = 'mobile_pin';
-- ============================================================



-- =====================================================
-- FILE: add_tenant_password.sql
-- =====================================================
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



-- =====================================================
-- FILE: arms_multi_room_migration.sql
-- =====================================================
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



-- =====================================================
-- FILE: arms_rbac_licensing_migration.sql
-- =====================================================
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



-- =====================================================
-- FILE: arms_tenant_licenses_migration.sql
-- =====================================================
-- ============================================================
-- ARMS: Tenant Licenses Migration
-- Creates arms_tenant_licenses table for mobile APK access control
-- Run this in your Supabase SQL editor
-- Safe to run multiple times (idempotent)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.arms_tenant_licenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER NOT NULL
                    REFERENCES public.arms_tenants(tenant_id) ON DELETE CASCADE,
    phone           TEXT NOT NULL DEFAULT '',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    licensed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ DEFAULT NULL,
    revoked_reason  TEXT DEFAULT NULL,
    CONSTRAINT arms_tenant_licenses_tenant_id_unique UNIQUE (tenant_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_arms_tenant_licenses_tenant_id
    ON public.arms_tenant_licenses (tenant_id);

CREATE INDEX IF NOT EXISTS idx_arms_tenant_licenses_phone
    ON public.arms_tenant_licenses (phone);

-- Enable RLS â€” no direct anon access; all access via service role through API routes
ALTER TABLE public.arms_tenant_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arms_tenant_licenses_anon_no_access" ON public.arms_tenant_licenses;
DROP POLICY IF EXISTS "arms_tenant_licenses_service_full_access" ON public.arms_tenant_licenses;

CREATE POLICY "arms_tenant_licenses_anon_no_access"
    ON public.arms_tenant_licenses
    FOR ALL TO anon
    USING (false);

CREATE POLICY "arms_tenant_licenses_service_full_access"
    ON public.arms_tenant_licenses
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- Auto-license all existing active tenants (bulk seed)
INSERT INTO public.arms_tenant_licenses (tenant_id, phone, is_active, licensed_at, last_seen_at)
SELECT
    t.tenant_id,
    COALESCE(t.phone, ''),
    true,
    now(),
    now()
FROM public.arms_tenants t
WHERE t.status = 'Active'
ON CONFLICT (tenant_id) DO NOTHING;

SELECT
    'arms_tenant_licenses migration complete' AS status,
    COUNT(*) AS total_licensed
FROM public.arms_tenant_licenses;



-- =====================================================
-- FILE: arms_unit_mpesa_config_migration.sql
-- =====================================================
-- ============================================================
-- ARMS: Per-Unit M-Pesa Till Configuration Migration
-- Creates arms_unit_mpesa_config table
-- Seeds till 9438697 for units in MM, RUNDA, GARDEN, SUNSHINE,
-- AIRVIEW, ELGON 01, HIGHWAY locations
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Create the per-unit M-Pesa config table
CREATE TABLE IF NOT EXISTS public.arms_unit_mpesa_config (
    config_id       SERIAL PRIMARY KEY,
    unit_id         INTEGER UNIQUE NOT NULL
                    REFERENCES public.arms_units(unit_id) ON DELETE CASCADE,
    till_number     VARCHAR(20)  DEFAULT '',
    shortcode       VARCHAR(20)  DEFAULT '',
    consumer_key    TEXT         DEFAULT '',
    consumer_secret TEXT         DEFAULT '',
    passkey         TEXT         DEFAULT '',
    environment     VARCHAR(20)  DEFAULT 'production',
    active          BOOLEAN      DEFAULT true,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. Unique index on unit_id (one till config per unit)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_mpesa_config_unit
    ON public.arms_unit_mpesa_config(unit_id);

-- 3. Enable RLS with permissive policy (matches all other ARMS tables)
ALTER TABLE public.arms_unit_mpesa_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow all arms_unit_mpesa_config"
        ON public.arms_unit_mpesa_config
        FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Add unit_id column to arms_stk_requests for tracking which unit triggered the push
ALTER TABLE public.arms_stk_requests
    ADD COLUMN IF NOT EXISTS unit_id INTEGER
    REFERENCES public.arms_units(unit_id);

-- 5. Seed till 9438697 for all active units in the 7 live locations
--    (MM, RUNDA, GARDEN, SUNSHINE, AIRVIEW, ELGON 01, HIGHWAY)
--    Leaves consumer_key, consumer_secret, shortcode, passkey empty
--    â€” admin fills those in via Settings â†’ Unit Tills
INSERT INTO public.arms_unit_mpesa_config (unit_id, till_number, environment)
SELECT
    u.unit_id,
    '9438697',
    'production'
FROM public.arms_units u
JOIN public.arms_locations l ON l.location_id = u.location_id
WHERE l.location_name IN (
    'MM', 'RUNDA', 'GARDEN', 'SUNSHINE', 'AIRVIEW', 'ELGON 01', 'HIGHWAY'
)
  AND u.active = true
ON CONFLICT (unit_id) DO NOTHING;

-- Done
SELECT
    'arms_unit_mpesa_config migration complete' AS status,
    COUNT(*) AS seeded_units
FROM public.arms_unit_mpesa_config;



-- =====================================================
-- FILE: arms_user_permissions_migration.sql
-- =====================================================
-- ============================================================
-- ARMS â€” Per-User Menu Permission Overrides Migration
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



-- =====================================================
-- FILE: add_stk_requests_table.sql
-- =====================================================
-- ============================================================
-- ARMS: Create arms_stk_requests table + add mpesa_name column
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create arms_stk_requests table (required for STK Push tracking)
-- Using SERIAL auto-creates the sequence
CREATE TABLE IF NOT EXISTS public.arms_stk_requests (
    id SERIAL PRIMARY KEY,
    checkout_request_id character varying NOT NULL UNIQUE,
    merchant_request_id character varying,
    phone character varying,
    amount numeric DEFAULT 0,
    account_reference character varying,
    tenant_id integer REFERENCES public.arms_tenants(tenant_id),
    status character varying DEFAULT 'Pending'::character varying,
    mpesa_receipt character varying,
    amount_paid numeric DEFAULT 0,
    result_code integer,
    result_desc text,
    raw_response jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.arms_stk_requests ENABLE ROW LEVEL SECURITY;

-- Allow anon key to read (for mobile app polling)
CREATE POLICY "Allow read access for stk_requests" ON public.arms_stk_requests
    FOR SELECT USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access on stk_requests" ON public.arms_stk_requests
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Add mpesa_name column to arms_payments (for payer name from M-Pesa)
ALTER TABLE public.arms_payments
    ADD COLUMN IF NOT EXISTS mpesa_name character varying;

-- 3. Enable Realtime on arms_stk_requests for mobile app polling
ALTER PUBLICATION supabase_realtime ADD TABLE public.arms_stk_requests;



-- =====================================================
-- FILE: enable_rls.sql
-- =====================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- ARMS Row Level Security (RLS) â€” Run in Supabase SQL Editor
-- This enables RLS on all ARMS tables and creates permissive
-- policies for authenticated access via the anon key.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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



-- =====================================================
-- FILE: vacation_column.sql
-- =====================================================
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



