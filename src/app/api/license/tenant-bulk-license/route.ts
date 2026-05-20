import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

/**
 * POST /api/license/tenant-bulk-license
 *
 * Auto-creates license records for all active tenants who don't have one yet.
 * Returns: { licensed: number, skipped: number }
 */
export async function POST() {
    try {
        const supabase = getServiceClient();

        // Fetch all active tenants
        const { data: activeTenants, error: tenantsError } = await supabase
            .from('arms_tenants')
            .select('tenant_id, phone')
            .eq('status', 'Active');

        if (tenantsError) {
            return NextResponse.json({ error: 'Bulk license failed' }, { status: 500 });
        }

        if (!activeTenants || activeTenants.length === 0) {
            return NextResponse.json({ licensed: 0, skipped: 0 });
        }

        // Fetch existing license tenant_ids
        const { data: existingLicenses, error: licError } = await supabase
            .from('arms_tenant_licenses')
            .select('tenant_id');

        if (licError) {
            return NextResponse.json({ error: 'Bulk license failed' }, { status: 500 });
        }

        const existingIds = new Set((existingLicenses || []).map((l: { tenant_id: number }) => l.tenant_id));

        // Filter tenants without licenses
        const toCreate = activeTenants.filter(t => !existingIds.has(t.tenant_id));
        const skipped = activeTenants.length - toCreate.length;

        if (toCreate.length === 0) {
            return NextResponse.json({ licensed: 0, skipped });
        }

        const now = new Date().toISOString();
        const records = toCreate.map(t => ({
            tenant_id: t.tenant_id,
            phone: t.phone || '',
            is_active: true,
            licensed_at: now,
            last_seen_at: now,
        }));

        const { error: insertError } = await supabase
            .from('arms_tenant_licenses')
            .upsert(records, { onConflict: 'tenant_id' });

        if (insertError) {
            console.error('Bulk license insert error:', insertError.message);
            return NextResponse.json({ error: 'Bulk license failed' }, { status: 500 });
        }

        return NextResponse.json({ licensed: toCreate.length, skipped });
    } catch (err: unknown) {
        console.error('Bulk license error:', err);
        return NextResponse.json({ error: 'Bulk license failed' }, { status: 500 });
    }
}
