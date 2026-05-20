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
 * POST /api/license/tenant-reactivate
 * Body: { tenantId: number }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { tenantId } = body;

        if (!tenantId || typeof tenantId !== 'number' || tenantId <= 0) {
            return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
        }

        const supabase = getServiceClient();

        const { data: existing } = await supabase
            .from('arms_tenant_licenses')
            .select('id')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (!existing) {
            return NextResponse.json({ error: 'License record not found' }, { status: 404 });
        }

        const { error } = await supabase
            .from('arms_tenant_licenses')
            .update({
                is_active: true,
                revoked_at: null,
                revoked_reason: null,
            })
            .eq('tenant_id', tenantId);

        if (error) {
            return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
    }
}
