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
 * Checks if a tenant is licensed to use the mobile app.
 * Auto-creates a license on first login (no admin action needed).
 * Updates last_seen_at on every call.
 *
 * Body: { tenantId: number, phone: string }
 *
 * Responses:
 *   { licensed: true }                       — active license
 *   { licensed: true, autoLicensed: true }   — newly created
 *   { licensed: false, reason: string }      — revoked
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { tenantId, phone } = body;

        // Validate tenantId
        if (!tenantId || typeof tenantId !== 'number' || !Number.isInteger(tenantId) || tenantId <= 0) {
            return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
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
            console.error('tenant-check fetch error:', fetchError.message);
            return NextResponse.json({ error: 'License check failed' }, { status: 500 });
        }

        if (existing) {
            // Update last_seen_at
            await supabase
                .from('arms_tenant_licenses')
                .update({ last_seen_at: now })
                .eq('tenant_id', tenantId);

            if (existing.is_active) {
                return NextResponse.json({ licensed: true });
            } else {
                return NextResponse.json({
                    licensed: false,
                    reason: existing.revoked_reason || 'Access has been revoked by your landlord.',
                });
            }
        }

        // No record — auto-create license (first login)
        const { error: insertError } = await supabase
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

        if (insertError) {
            console.error('tenant-check insert error:', insertError.message);
            return NextResponse.json({ error: 'License check failed' }, { status: 500 });
        }

        return NextResponse.json({ licensed: true, autoLicensed: true });
    } catch (err: unknown) {
        console.error('tenant-check error:', err);
        return NextResponse.json({ error: 'License check failed' }, { status: 500 });
    }
}
