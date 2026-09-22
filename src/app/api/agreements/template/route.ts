// ARMS — Agreement Template API (FIXED)
// GET  /api/agreements/template          → get active template (returns first + array)
// POST /api/agreements/template          → create template
// PATCH /api/agreements/template         → update template (id from body OR query)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const locationId = searchParams.get('locationId');
        let query = supabase.from('arms_agreement_templates').select('*').eq('is_active', true);
        if (locationId) query = (query as any).eq('location_id', parseInt(locationId));
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        const templates = data || [];
        // Return BOTH array AND first as singular so page can use either
        return NextResponse.json({ templates, template: templates[0] || null });
    } catch (err: any) {
        console.error('[GET template]', err);
        return NextResponse.json({ error: err.message, templates: [], template: null }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { location_id, title, content, admin_signature_url, admin_name, admin_title, version } = body;

        if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 });

        const { data, error } = await supabase
            .from('arms_agreement_templates')
            .insert([{
                location_id: location_id || null,
                title: title.trim(),
                content: content.trim(),
                admin_signature_url: admin_signature_url || null,
                admin_name: admin_name || '',
                admin_title: admin_title || 'Landlord / Property Manager',
                version: version || 'v1.0',
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ template: data });
    } catch (err: any) {
        console.error('[POST template]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        // Accept template_id from body OR from query param ?id=X
        const qId = new URL(req.url).searchParams.get('id');
        const id = body.template_id || (qId ? parseInt(qId) : null);
        if (!id) return NextResponse.json({ error: 'template_id required' }, { status: 400 });

        const { template_id, ...updates } = body;
        const { data, error } = await supabase
            .from('arms_agreement_templates')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('template_id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ template: data });
    } catch (err: any) {
        console.error('[PATCH template]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
