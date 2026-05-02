import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS License Revoker — Super Admin only
// ============================================================

function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

export async function POST(req: NextRequest) {
    try {
        const { licenseId, isSuperAdmin } = await req.json();

        if (!isSuperAdmin) {
            return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
        }
        if (!licenseId) {
            return NextResponse.json({ error: 'licenseId is required' }, { status: 400 });
        }

        const supabase = getAdminClient();
        const { error } = await supabase
            .from('arms_licenses')
            .update({ is_active: false, revoked_at: new Date().toISOString() })
            .eq('license_id', licenseId);

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'License revoked successfully' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
