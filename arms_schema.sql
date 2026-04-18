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
