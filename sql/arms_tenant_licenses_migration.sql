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

-- Enable RLS — no direct anon access; all access via service role through API routes
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
