-- ============================================================
-- ARMS Ultra Features Migration
-- Adds: Utility billing, Caretakers, SMS/Comms, Checklists,
--       Demand letters, Access control, Tenant portal
-- ============================================================

-- ==================== WATER & UTILITY BILLING ====================

-- Utility types (Water, Electricity, Gas, etc.)
CREATE TABLE IF NOT EXISTS public.arms_utility_types (
    utility_type_id integer NOT NULL DEFAULT nextval('arms_utility_types_utility_type_id_seq'::regclass),
    utility_name character varying NOT NULL,
    unit_of_measure character varying DEFAULT 'Units'::character varying,
    billing_method character varying DEFAULT 'postpaid'::character varying, -- postpaid / prepaid
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT arms_utility_types_pkey PRIMARY KEY (utility_type_id)
);

-- Meter readings per unit
CREATE TABLE IF NOT EXISTS public.arms_meter_readings (
    reading_id integer NOT NULL DEFAULT nextval('arms_meter_readings_reading_id_seq'::regclass),
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
    utility_bill_id integer NOT NULL DEFAULT nextval('arms_utility_bills_utility_bill_id_seq'::regclass),
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
    token_id integer NOT NULL DEFAULT nextval('arms_prepaid_tokens_token_id_seq'::regclass),
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
    caretaker_id integer NOT NULL DEFAULT nextval('arms_caretakers_caretaker_id_seq'::regclass),
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
    salary_id integer NOT NULL DEFAULT nextval('arms_caretaker_salaries_salary_id_seq'::regclass),
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
    petty_cash_id integer NOT NULL DEFAULT nextval('arms_petty_cash_petty_cash_id_seq'::regclass),
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
    config_id integer NOT NULL DEFAULT nextval('arms_sms_config_config_id_seq'::regclass),
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
    sms_id integer NOT NULL DEFAULT nextval('arms_sms_logs_sms_id_seq'::regclass),
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
    rule_id integer NOT NULL DEFAULT nextval('arms_reminder_rules_rule_id_seq'::regclass),
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
    config_id integer NOT NULL DEFAULT nextval('arms_whatsapp_config_config_id_seq'::regclass),
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
    letter_id integer NOT NULL DEFAULT nextval('arms_demand_letters_letter_id_seq'::regclass),
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
    checklist_id integer NOT NULL DEFAULT nextval('arms_checklists_checklist_id_seq'::regclass),
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
    item_id integer NOT NULL DEFAULT nextval('arms_checklist_items_item_id_seq'::regclass),
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
    template_id integer NOT NULL DEFAULT nextval('arms_checklist_templates_template_id_seq'::regclass),
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
    id integer NOT NULL DEFAULT nextval('arms_role_permissions_id_seq'::regclass),
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
    portal_user_id integer NOT NULL DEFAULT nextval('arms_portal_users_portal_user_id_seq'::regclass),
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
    issue_id integer NOT NULL DEFAULT nextval('arms_tenant_issues_issue_id_seq'::regclass),
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
    rate_id integer NOT NULL DEFAULT nextval('arms_utility_rates_rate_id_seq'::regclass),
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
    (1, 50.00, 200.00, 200.00), -- Water: KES 50/m³, KES 200 fixed
    (2, 25.00, 0, 0),            -- Electricity: KES 25/kWh
    (3, 100.00, 0, 0),           -- Gas: KES 100/m³
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
