import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { tenant_id, push_token } = await req.json();
        if (!tenant_id || !push_token) {
            return NextResponse.json({ error: 'tenant_id and push_token required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('arms_tenants')
            .update({ push_token })
            .eq('tenant_id', tenant_id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[POST /api/tenants/push-token]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
