import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

/**
 * POST /api/license/tenant-check
 *
 * Verifies if a tenant has active mobile app access.
 * Auto-creates a license on login.
 * FAIL-OPEN: Paying tenants are NEVER blocked due to version headers or network blips.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { tenantId, phone } = body;

        // If no tenantId provided, fail-open to let valid session through
        if (!tenantId || typeof tenantId !== 'number' || tenantId <= 0) {
            return NextResponse.json({ licensed: true });
        }

        const supabase = getServiceClient();
        const now = new Date().toISOString();

        // Check for existing license record
        const { data: existing, error: fetchError } = await supabase
            .from('arms_tenant_licenses')
            .select('id, is_active, revoked_reason')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (fetchError) {
            console.warn('[tenant-check] fetch warning (fail-open):', fetchError.message);
            return NextResponse.json({ licensed: true });
        }

        if (existing) {
            // Only block if explicitly revoked by landlord/admin with an active reason
            if (existing.is_active === false && existing.revoked_reason) {
                return NextResponse.json({
                    licensed: false,
                    reason: existing.revoked_reason || 'Access has been revoked by your landlord.',
                });
            }

            // Update last_seen_at in background
            await supabase
                .from('arms_tenant_licenses')
                .update({ last_seen_at: now, is_active: true })
                .eq('tenant_id', tenantId);

            return NextResponse.json({ licensed: true });
        }

        // No record — auto-create active license
        await supabase
            .from('arms_tenant_licenses')
            .upsert(
                [{
                    tenant_id: tenantId,
                    phone: phone || '',
                    is_active: true,
                    licensed_at: now,
                    last_seen_at: now,
                }],
                { onConflict: 'tenant_id' }
            );

        return NextResponse.json({ licensed: true, autoLicensed: true });
    } catch (err: unknown) {
        console.warn('[tenant-check] exception (fail-open):', err);
        return NextResponse.json({ licensed: true });
    }
}
