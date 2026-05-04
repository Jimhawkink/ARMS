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
