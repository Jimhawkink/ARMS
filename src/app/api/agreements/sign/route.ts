// ARMS — Agreement Sign API (FIXED v2)
// GET  /api/agreements/sign?all=1       → all agreements (manual join, no FK needed)
// GET  /api/agreements/sign?tenantId=X → tenant's agreement status
// POST /api/agreements/sign             → issue agreement
// PATCH /api/agreements/sign?id=X      → update (sign, mark read etc)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId');
        const all      = searchParams.get('all');

        // ── ADMIN: all agreements ──────────────────────────────
        if (all) {
            // Fetch agreements WITHOUT relying on Supabase FK joins
            const { data: agreements, error: aErr } = await supabase
                .from('arms_tenant_agreements')
                .select('*')
                .order('created_at', { ascending: false });

            if (aErr) throw aErr;
            if (!agreements || agreements.length === 0)
                return NextResponse.json({ agreements: [] });

            // Fetch tenant info separately — plain query, no FK joins needed
            const tenantIds = [...new Set(agreements.map((a: any) => a.tenant_id))];
            const { data: tenants } = await supabase
                .from('arms_tenants')
                .select('tenant_id, tenant_name, phone')
                .in('tenant_id', tenantIds);

            const tenantMap: Record<number, any> = {};
            (tenants || []).forEach((t: any) => { tenantMap[t.tenant_id] = t; });

            // Merge — FIX: was (t.tenant_name || a.unit_name) ? `Tenant #${id}` : 'Unknown'
            // operator precedence caused it to always return Tenant #ID when unit_name was set
            const merged = agreements.map((a: any) => {
                const t = tenantMap[a.tenant_id] || {};
                return {
                    ...a,
                    tenant_name:   t.tenant_name   || `Tenant #${a.tenant_id}`,
                    phone:         t.phone          || '',
                    unit_name:     a.unit_name      || '—',
                    location_name: a.location_name  || '—',
                };
            });

            return NextResponse.json({ agreements: merged });
        }


        // ── TENANT: their own agreement ────────────────────────
        if (!tenantId) return NextResponse.json({ error: 'tenantId or all required' }, { status: 400 });

        const { data, error } = await supabase
            .from('arms_tenant_agreements')
            .select(`
                *,
                arms_agreement_templates(title, content, admin_name, admin_title, admin_signature_url, version)
            `)
            .eq('tenant_id', parseInt(tenantId))
            .order('created_at', { ascending: false });

        if (error) {
            // Fallback without join if FK missing
            const { data: d2, error: e2 } = await supabase
                .from('arms_tenant_agreements')
                .select('*')
                .eq('tenant_id', parseInt(tenantId))
                .order('created_at', { ascending: false });
            if (e2) throw e2;
            return NextResponse.json({ agreements: d2 || [], hasSigned: (d2 || []).some((a: any) => a.accepted) });
        }

        // Enrich with template data if not in snapshot
        const enriched = (data || []).map((a: any) => {
            const tmpl = a.arms_agreement_templates;
            if (!a.agreement_snapshot?.content && tmpl?.content) {
                a.agreement_snapshot = { ...a.agreement_snapshot, content: tmpl.content };
            }
            return a;
        });

        return NextResponse.json({
            agreements: enriched,
            hasSigned: enriched.some((a: any) => a.accepted),
        });

    } catch (err: any) {
        console.error('[GET /api/agreements/sign]', err);
        return NextResponse.json({ error: err.message, agreements: [] }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            tenant_id, template_id, location_id,
            lease_start_date, lease_end_date, monthly_rent, deposit_amount,
            unit_name, issued_by,
            accepted, signed_at, signature_text, device_info, agreement_snapshot,
        } = body;

        if (!tenant_id) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 });

        // If template_id given but snapshot has no content, fetch template content
        let snapshot = agreement_snapshot || null;
        if (template_id && (!snapshot?.content)) {
            const { data: tmpl } = await supabase
                .from('arms_agreement_templates')
                .select('title, content, admin_name, admin_title, admin_signature_url, version')
                .eq('template_id', template_id)
                .single();
            if (tmpl) {
                snapshot = { ...snapshot, ...tmpl };
            }
        }

        // Remove template_version if column doesn't exist
        const insertData: any = {
            tenant_id,
            template_id:        template_id     || null,
            location_id:        location_id     || null,
            lease_start_date:   lease_start_date || null,
            lease_end_date:     lease_end_date   || null,
            monthly_rent:       monthly_rent     ?? 0,
            deposit_amount:     deposit_amount   ?? 0,
            unit_name:          unit_name        || null,
            issued_by:          issued_by        || 'Admin',
            issued_at:          new Date().toISOString(),
            accepted:           accepted         || false,
            signed_at:          signed_at        || null,
            signature_text:     signature_text   || null,
            device_info:        device_info      || null,
            agreement_snapshot: snapshot,
            created_at:         new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('arms_tenant_agreements')
            .insert([insertData])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ agreement: data });
    } catch (err: any) {
        console.error('[POST /api/agreements/sign]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const qId  = searchParams.get('id');
        const body = await req.json();
        const id   = body.agreement_id || (qId ? parseInt(qId) : null);
        if (!id) return NextResponse.json({ error: 'agreement_id required' }, { status: 400 });

        const { agreement_id, ...updates } = body;
        const { data, error } = await supabase
            .from('arms_tenant_agreements')
            .update(updates)
            .eq('agreement_id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ agreement: data });
    } catch (err: any) {
        console.error('[PATCH /api/agreements/sign]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
