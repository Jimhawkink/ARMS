// ARMS — Agreement Sign API
// POST /api/agreements/sign  → record tenant acceptance
// GET  /api/agreements/sign?tenantId=X → get tenant's agreement status
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId');
        const all = searchParams.get('all');

        if (all) {
            // Admin: get all agreements with tenant info
            const { data, error } = await supabase
                .from('arms_tenant_agreements')
                .select(`*, arms_tenants(tenant_name, phone, arms_units(unit_name), arms_locations(location_name))`)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return NextResponse.json({ agreements: data || [] });
        }

        if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
        const { data, error } = await supabase
            .from('arms_tenant_agreements')
            .select('*')
            .eq('tenant_id', parseInt(tenantId))
            .order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ agreements: data || [], hasSigned: (data || []).some(a => a.accepted) });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            tenant_id, template_id, location_id, template_version,
            lease_start_date, lease_end_date, monthly_rent, deposit_amount,
            unit_name, issued_by,
            // Tenant signing fields (may be null if just issuing)
            accepted, signed_at, signature_text, device_info, agreement_snapshot,
        } = body;

        if (!tenant_id) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 });

        const { data, error } = await supabase.from('arms_tenant_agreements').insert([{
            tenant_id,
            template_id: template_id || null,
            location_id: location_id || null,
            template_version: template_version || '1.0',
            lease_start_date: lease_start_date || null,
            lease_end_date: lease_end_date || null,
            monthly_rent: monthly_rent || null,
            deposit_amount: deposit_amount || null,
            unit_name: unit_name || null,
            issued_by: issued_by || 'Admin',
            issued_at: new Date().toISOString(),
            accepted: accepted || false,
            signed_at: signed_at || null,
            signature_text: signature_text || null,
            device_info: device_info || null,
            agreement_snapshot: agreement_snapshot || null,
            created_at: new Date().toISOString(),
        }]).select().single();
        if (error) throw error;
        return NextResponse.json({ agreement: data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        const body = await req.json();
        const { data, error } = await supabase.from('arms_tenant_agreements')
            .update({ ...body })
            .eq('agreement_id', parseInt(id)).select().single();
        if (error) throw error;
        return NextResponse.json({ agreement: data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
