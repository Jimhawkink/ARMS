// ARMS — Agreement Template API
// GET  /api/agreements/template?locationId=X  → get active template
// POST /api/agreements/template               → create template
// PATCH /api/agreements/template?id=X        → update template
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const locationId = searchParams.get('locationId');
        let query = supabase.from('arms_agreement_templates').select('*').eq('is_active', true);
        if (locationId) query = query.eq('location_id', parseInt(locationId));
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ templates: data || [] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { location_id, title, content, admin_signature_url, admin_name, admin_title, version } = body;
        const { data, error } = await supabase.from('arms_agreement_templates').insert([{
            location_id: location_id || null,
            title: title || 'Tenancy Agreement & Terms and Conditions',
            content: content || '',
            admin_signature_url: admin_signature_url || null,
            admin_name: admin_name || '',
            admin_title: admin_title || 'Landlord / Property Manager',
            version: version || '1.0',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }]).select().single();
        if (error) throw error;
        return NextResponse.json({ template: data });
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
        const { data, error } = await supabase.from('arms_agreement_templates')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('template_id', parseInt(id)).select().single();
        if (error) throw error;
        return NextResponse.json({ template: data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
