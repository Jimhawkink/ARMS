import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ─── Helper ───────────────────────────────────────────────────────────────────
function localDateStr(d: Date = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localMonthStr(d: Date = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── POST /api/penalties  → generate today's penalties ────────────────────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const locationId: number | undefined = body.locationId ? Number(body.locationId) : undefined;

        const today = new Date();
        const todayDay = today.getDate();
        const currentMonth = localMonthStr(today);

        if (todayDay < 5) {
            return NextResponse.json({ generated: 0, skipped: 0, message: 'Before 5th — no penalties yet' });
        }

        // Build penalty dates from 5th → today
        const penaltyDates: string[] = [];
        for (let d = 5; d <= todayDay; d++) {
            penaltyDates.push(localDateStr(new Date(today.getFullYear(), today.getMonth(), d)));
        }

        // Fetch unpaid/partial bills for CURRENT month only (November 2026 onwards)
        let q = supabaseAdmin
            .from('arms_billing')
            .select('billing_id, tenant_id, location_id, balance, status, billing_month')
            .eq('billing_month', currentMonth)
            .in('status', ['Unpaid', 'Partial'])
            .gt('balance', 0);
        if (locationId) q = (q as any).eq('location_id', locationId);

        const { data: bills, error: billErr } = await q;
        if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 });
        if (!bills || bills.length === 0) {
            return NextResponse.json({ generated: 0, skipped: 0, message: 'No unpaid bills found for ' + currentMonth });
        }

        // Build one row per tenant per penalty day
        const rows = bills.flatMap((bill: any) =>
            penaltyDates.map(date => ({
                tenant_id:     bill.tenant_id,
                billing_id:    bill.billing_id,
                billing_month: currentMonth,
                penalty_date:  date,
                amount:        100,
                status:        'Active',
                reason:        `Late payment penalty — ${currentMonth} (after 5th)`,
            }))
        );

        // Upsert in batches of 200 — duplicates are ignored safely
        let generated = 0, skipped = 0;
        for (let i = 0; i < rows.length; i += 200) {
            const batch = rows.slice(i, i + 200);
            const { data, error } = await supabaseAdmin
                .from('arms_penalties')
                .upsert(batch, { onConflict: 'tenant_id,billing_month,penalty_date', ignoreDuplicates: true })
                .select('penalty_id');
            if (!error) generated += (data?.length || 0);
            else skipped += batch.length;
        }

        return NextResponse.json({ generated, skipped, bills: bills.length, days: penaltyDates.length });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ─── GET /api/penalties  → fetch penalties with filters ───────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const locationId = searchParams.get('locationId') ? Number(searchParams.get('locationId')) : undefined;
        const tenantId   = searchParams.get('tenantId')   ? Number(searchParams.get('tenantId'))   : undefined;
        const month      = searchParams.get('month')      || undefined;
        const status     = searchParams.get('status')     || undefined;
        const page       = Number(searchParams.get('page')     || '1');
        const pageSize   = Number(searchParams.get('pageSize') || '50');
        const offset     = (page - 1) * pageSize;

        let q = supabaseAdmin
            .from('arms_penalties')
            .select(`
                penalty_id, tenant_id, billing_id, billing_month, penalty_date,
                amount, status, reason, waived_by, waived_at, waive_reason, created_at,
                arms_tenants!inner(tenant_name, phone, unit_id,
                    arms_units(unit_name,
                        arms_locations(location_id, location_name)))
            `, { count: 'exact' })
            .order('penalty_date', { ascending: false })
            .order('tenant_id',    { ascending: true })
            .range(offset, offset + pageSize - 1);

        if (tenantId)   q = (q as any).eq('tenant_id',     tenantId);
        if (month)      q = (q as any).eq('billing_month', month);
        if (status)     q = (q as any).eq('status',        status);
        if (locationId) q = (q as any).eq('arms_tenants.arms_units.arms_locations.location_id', locationId);

        const { data, count, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Summary query (all pages)
        let sq = supabaseAdmin.from('arms_penalties').select('status, amount');
        if (tenantId) sq = (sq as any).eq('tenant_id',     tenantId);
        if (month)    sq = (sq as any).eq('billing_month', month);
        const { data: all } = await sq;

        const summary = (all || []).reduce((acc: any, r: any) => {
            const s = (r.status || '').toLowerCase();
            if (s === 'active') { acc.active++; acc.totalActive += Number(r.amount); }
            if (s === 'waived') { acc.waived++; }
            if (s === 'paid')   { acc.paid++; }
            return acc;
        }, { active: 0, waived: 0, paid: 0, totalActive: 0 });

        return NextResponse.json({ rows: data || [], total: count || 0, summary });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ─── PATCH /api/penalties  → waive single or bulk ─────────────────────────────
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, penaltyId, tenantId, month, waivedBy, reason } = body;
        const now = new Date().toISOString();

        if (action === 'waive_single') {
            const { error } = await supabaseAdmin.from('arms_penalties').update({
                status: 'Waived', waived_by: waivedBy || 'Admin',
                waived_at: now, waive_reason: reason, updated_at: now,
            }).eq('penalty_id', penaltyId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true });
        }

        if (action === 'waive_bulk') {
            const { data, error } = await supabaseAdmin.from('arms_penalties').update({
                status: 'Waived', waived_by: waivedBy || 'Admin',
                waived_at: now, waive_reason: reason, updated_at: now,
            }).eq('tenant_id', tenantId).eq('billing_month', month).eq('status', 'Active').select('penalty_id');
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true, count: data?.length || 0 });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
