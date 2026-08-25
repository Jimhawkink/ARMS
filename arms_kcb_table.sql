-- ═══════════════════════════════════════════════════════════════
-- ARMS — KCB Buni STK Requests Table
-- Run this once in your Supabase SQL Editor
-- Same pattern as arms_stk_requests (M-Pesa), but for KCB Buni
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arms_kcb_stk_requests (
    id                   BIGSERIAL PRIMARY KEY,
    checkout_request_id  TEXT NOT NULL UNIQUE,
    merchant_request_id  TEXT,
    tenant_id            INTEGER REFERENCES arms_tenants(tenant_id),
    amount               NUMERIC(10,2) NOT NULL,
    amount_paid          NUMERIC(10,2),
    phone                TEXT NOT NULL,
    invoice_number       TEXT,
    status               TEXT NOT NULL DEFAULT 'Pending',  -- Pending | Completed | Failed | Cancelled
    mpesa_receipt        TEXT,
    result_code          TEXT,
    result_desc          TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ
);

-- Index for fast polling lookups by checkout ID
CREATE INDEX IF NOT EXISTS idx_arms_kcb_stk_checkout
    ON arms_kcb_stk_requests(checkout_request_id);

-- Index for tenant history
CREATE INDEX IF NOT EXISTS idx_arms_kcb_stk_tenant
    ON arms_kcb_stk_requests(tenant_id);

-- RLS: service role can read/write (callback uses service_role key)
ALTER TABLE arms_kcb_stk_requests ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (callback handler)
CREATE POLICY "service_role_all" ON arms_kcb_stk_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon/authenticated to READ their own records (for polling)
CREATE POLICY "anon_read" ON arms_kcb_stk_requests
    FOR SELECT TO anon, authenticated USING (true);
