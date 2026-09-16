import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { licenseId, isSuperAdmin } = body;

        if (!isSuperAdmin) {
            return NextResponse.json(
                { error: 'Forbidden: Only the Super Admin can reset machine bindings' },
                { status: 403 }
            );
        }

        if (!licenseId) {
            return NextResponse.json({ error: 'licenseId is required' }, { status: 400 });
        }

        const supabase = getAdminClient();

        const { data: license, error: fetchError } = await supabase
            .from('arms_licenses')
            .select('license_id, client_name, is_active, revoked_at')
            .eq('license_id', licenseId)
            .single();

        if (fetchError || !license) {
            return NextResponse.json({ error: 'License not found' }, { status: 404 });
        }

        if (license.revoked_at) {
            return NextResponse.json({ error: 'Cannot reset a revoked license' }, { status: 400 });
        }

        const { error: updateError } = await supabase
            .from('arms_licenses')
            .update({ machine_id: null, is_active: false, activated_at: null })
            .eq('license_id', licenseId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Machine binding reset for ' + license.client_name + '. They can now re-activate on any machine.',
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}