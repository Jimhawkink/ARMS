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
 * GET /api/license/tenant-list
 * Returns all tenant licenses joined with tenant, unit, and location data.
 */
export async function GET() {
    try {
        const supabase = getServiceClient();

        const { data, error } = await supabase
            .from('arms_tenant_licenses')
            .select(`
                id, tenant_id, phone, is_active,
                licensed_at, last_seen_at, revoked_at, revoked_reason,
                tenant:arms_tenants(
                    tenant_name,
                    arms_units(unit_name),
                    arms_locations(location_name)
                )
            `)
            .order('licensed_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const licenses = (data || []).map((row: any) => ({
            id: row.id,
            tenant_id: row.tenant_id,
            phone: row.phone,
            is_active: row.is_active,
            licensed_at: row.licensed_at,
            last_seen_at: row.last_seen_at,
            revoked_at: row.revoked_at,
            revoked_reason: row.revoked_reason,
            tenant_name: row.tenant?.tenant_name || null,
            unit_name: row.tenant?.arms_units?.unit_name || null,
            location_name: row.tenant?.arms_locations?.location_name || null,
        }));

        return NextResponse.json({ licenses });
    } catch (err: unknown) {
        console.error('tenant-list error:', err);
        return NextResponse.json({ error: 'Failed to fetch licenses' }, { status: 500 });
    }
}
