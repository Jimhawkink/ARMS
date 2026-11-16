import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Always compute dates in Nairobi time (EAT = UTC+3)
function getNairobiNow(): Date {
    const now = new Date();
    // Shift by +3 hours to get Nairobi local time
    return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}
function localDateStr(d: Date = getNairobiNow()) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function localMonthStr(d: Date = getNairobiNow()) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ─── POST /api/penalties  → generate penalties starting from 6th (10% flat monthly rent) ──────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const locationId: number | undefined = body.locationId ? Number(body.locationId) : undefined;

        const today = getNairobiNow();
        const todayDay = today.getUTCDate();
        const currentMonth = localMonthStr(today);

        // Rent is due by 5th. 10% flat penalty begins strictly on 6th!
        if (todayDay < 6) {
            return NextResponse.json({ 
                generated: 0, 
                skipped: 0, 
                message: 'Before 6th — grace period active until 5th midnight. No penalties yet.' 
            });
        }

        // Clean up any stray penalties generated before the 6th
        await supabaseAdmin
            .from('arms_penalties')
            .delete()
            .eq('billing_month', currentMonth)
            .lt('penalty_date', `${currentMonth}-06`);

        // Fetch unpaid/partial bills for CURRENT month only (November 2026 onwards)
        let q = supabaseAdmin
            .from('arms_billing')
            .select('billing_id, tenant_id, location_id, rent_amount, balance, status, billing_month')
            .eq('billing_month', currentMonth)
            .in('status', ['Unpaid', 'Partial'])
            .gt('balance', 0)
            .limit(10000);
        if (locationId) q = (q as any).eq('location_id', locationId);

        const { data: bills, error: billErr } = await q;
        if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 });
        if (!bills || bills.length === 0) {
            return NextResponse.json({ generated: 0, skipped: 0, message: 'No unpaid bills found for ' + currentMonth });
        }

        // Build one 10% flat penalty row per overdue tenant (dated 6th of the month)
        const rows = bills.map((bill: any) => {
            const rent = Number(bill.rent_amount) || 0;
            const penaltyAmt = Math.round(rent * 0.10);
            return {
                tenant_id:     bill.tenant_id,
                billing_id:    bill.billing_id,
                billing_month: currentMonth,
                penalty_date:  `${currentMonth}-06`,
                amount:        penaltyAmt,
                status:        'Active',
                reason:        `Late rent penalty (10% flat) — ${currentMonth} (after 5th grace period)`,
            };
        }).filter(r => r.amount > 0);

        // Upsert in batches of 200 — duplicates are safely handled by unique constraint
        let generated = 0, skipped = 0;
        for (let i = 0; i < rows.length; i += 200) {
            const batch = rows.slice(i, i + 200);
            const { data, error } = await supabaseAdmin
                .from('arms_penalties')
                .upsert(batch, { onConflict: 'tenant_id,billing_month,penalty_date', ignoreDuplicates: false })
                .select('penalty_id');
            if (!error) generated += (data?.length || 0);
            else skipped += batch.length;
        }

        return NextResponse.json({ 
            generated, 
            skipped, 
            bills: bills.length, 
            penalty_rate: '10%',
            penalty_date: `${currentMonth}-06`
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ─── GET /api/penalties  → Intelligent Tenant Penalty Rollup ───────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId') ? Number(searchParams.get('tenantId')) : undefined;

        // ── Single Tenant Mode (e.g. for Payment Modal) ────────────────────────
        if (tenantId) {
            const today = getNairobiNow();
            const todayDay = today.getUTCDate();
            const currentMonth = localMonthStr(today);

            // Auto-generate 10% flat penalty for tenant if today >= 6th and tenant has unpaid bill for current month
            if (todayDay >= 6) {
                try {
                    const { data: curBill } = await supabaseAdmin
                        .from('arms_billing')
                        .select('billing_id, rent_amount, balance, status')
                        .eq('tenant_id', tenantId)
                        .eq('billing_month', currentMonth)
                        .in('status', ['Unpaid', 'Partial'])
                        .gt('balance', 0)
                        .maybeSingle();

                    if (curBill) {
                        const rent = Number(curBill.rent_amount) || 0;
                        const penAmt = Math.round(rent * 0.10);
                        if (penAmt > 0) {
                            await supabaseAdmin
                                .from('arms_penalties')
                                .upsert([{
                                    tenant_id: tenantId,
                                    billing_id: curBill.billing_id,
                                    billing_month: currentMonth,
                                    penalty_date: `${currentMonth}-06`,
                                    amount: penAmt,
                                    status: 'Active',
                                    reason: `Late rent penalty (10% flat) — ${currentMonth} (after 5th grace period)`,
                                }], { onConflict: 'tenant_id,billing_month,penalty_date', ignoreDuplicates: false });
                        }
                    }
                } catch {
                    // non-fatal, proceed with reading existing
                }
            }

            const { data: tenantPens, error: penErr } = await supabaseAdmin
                .from('arms_penalties')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('penalty_date', { ascending: true });

            if (penErr) return NextResponse.json({ error: penErr.message }, { status: 500 });

            const allPens = tenantPens || [];
            const activePens = allPens.filter(p => p.status === 'Active');
            const penTotal = activePens.reduce((s, p) => s + Number(p.amount), 0);
            const penDays = activePens.length;
            const penDates = activePens.map(p => p.penalty_date);

            return NextResponse.json({
                tenant_id: tenantId,
                penalty_days: penDays,
                total_penalty: penTotal,
                penalty_dates: penDates,
                active_penalties: activePens,
                penalties: allPens,
                penalty_rate: '10%',
                daily_rate: 0
            });
        }

        const month = searchParams.get('month') || localMonthStr(new Date());
        const locationId = searchParams.get('locationId') ? Number(searchParams.get('locationId')) : undefined;

        // 1. Fetch bills for the month
        let billQ = supabaseAdmin
            .from('arms_billing')
            .select('billing_id, tenant_id, location_id, unit_id, rent_amount, amount_paid, balance, status, billing_month')
            .eq('billing_month', month)
            .limit(10000);
        if (locationId) billQ = (billQ as any).eq('location_id', locationId);
        if (tenantId) billQ = (billQ as any).eq('tenant_id', tenantId);

        const { data: bills, error: billErr } = await billQ;
        if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 });

        // 1.5 Auto-sync penalties for current month if date >= 6th
        const today = getNairobiNow();
        const todayDay = today.getUTCDate();
        const currentMonth = localMonthStr(today);

        if (todayDay >= 6 && month === currentMonth && bills && bills.length > 0) {
            try {
                const unpaidBills = bills.filter((b: any) => (b.balance || 0) > 0 && b.status !== 'Paid');
                if (unpaidBills.length > 0) {
                    const syncRows = unpaidBills.map((b: any) => {
                        const rent = Number(b.rent_amount) || 0;
                        const penAmt = Math.round(rent * 0.10);
                        return {
                            tenant_id: b.tenant_id,
                            billing_id: b.billing_id,
                            billing_month: month,
                            penalty_date: `${month}-06`,
                            amount: penAmt,
                            status: 'Active',
                            reason: `Late rent penalty (10% flat) — ${month} (after 5th grace period)`,
                        };
                    }).filter(r => r.amount > 0);

                    if (syncRows.length > 0) {
                        for (let i = 0; i < syncRows.length; i += 200) {
                            await supabaseAdmin
                                .from('arms_penalties')
                                .upsert(syncRows.slice(i, i + 200), {
                                    onConflict: 'tenant_id,billing_month,penalty_date',
                                    ignoreDuplicates: false,
                                });
                        }
                    }
                }
            } catch (syncErr) {
                console.error('Error auto-syncing penalties:', syncErr);
            }
        }

        // 2. Fetch all penalties for this month
        let penQ = supabaseAdmin
            .from('arms_penalties')
            .select('penalty_id, tenant_id, billing_month, penalty_date, amount, status, reason, waived_by, waived_at, waive_reason')
            .eq('billing_month', month)
            .limit(10000);
        if (tenantId) penQ = (penQ as any).eq('tenant_id', tenantId);

        const { data: penalties, error: penErr } = await penQ;
        if (penErr) return NextResponse.json({ error: penErr.message }, { status: 500 });

        // Group penalties by tenant
        const penByTenant: Record<number, any[]> = {};
        (penalties || []).forEach(p => {
            if (!penByTenant[p.tenant_id]) penByTenant[p.tenant_id] = [];
            penByTenant[p.tenant_id].push(p);
        });

        // 3. Fetch active tenants with their unit & estate/location details
        const tenantIds = Array.from(new Set([
            ...(bills || []).map(b => b.tenant_id),
            ...(penalties || []).map(p => p.tenant_id)
        ]));

        const tenantMap: Record<number, any> = {};
        if (tenantIds.length > 0) {
            // Chunk tenant fetching if large
            for (let i = 0; i < tenantIds.length; i += 200) {
                const chunk = tenantIds.slice(i, i + 200);
                const { data: tData } = await supabaseAdmin
                    .from('arms_tenants')
                    .select('tenant_id, tenant_name, phone, monthly_rent, balance, status, location_id, unit_id, arms_units(unit_id, unit_name, arms_locations(location_id, location_name))')
                    .in('tenant_id', chunk);
                (tData || []).forEach(t => { tenantMap[t.tenant_id] = t; });
            }
        }

        // 4. Map bill by tenant
        const billByTenant: Record<number, any> = {};
        (bills || []).forEach(b => { billByTenant[b.tenant_id] = b; });

        // 5. Build intelligent tenant-level penalty objects
        let totalPenaltiesAccrued = 0;
        let totalRentOwed = 0;
        let totalWaived = 0;
        let totalPaid = 0;
        let activePenalizedTenantsCount = 0;

        const tenantRows: any[] = [];
        const seenTenantIds = new Set<number>();

        // Process all bills first
        (bills || []).forEach(b => {
            seenTenantIds.add(b.tenant_id);
            const t = tenantMap[b.tenant_id];
            if (!t) return;

            // Location filter if specified
            if (locationId && t.location_id !== locationId && b.location_id !== locationId) return;

            const tPens = penByTenant[b.tenant_id] || [];
            const activePens = tPens.filter(p => p.status === 'Active');
            const waivedPens = tPens.filter(p => p.status === 'Waived');
            const paidPens = tPens.filter(p => p.status === 'Paid');

            const activePenaltyAmt = activePens.reduce((sum, p) => sum + Number(p.amount), 0);
            const waivedPenaltyAmt = waivedPens.reduce((sum, p) => sum + Number(p.amount), 0);
            const paidPenaltyAmt = paidPens.reduce((sum, p) => sum + Number(p.amount), 0);

            const rentBalance = Number(b.balance) || 0;
            const rentAmount = Number(b.rent_amount) || Number(t.monthly_rent) || 0;
            const rentPaid = Number(b.amount_paid) || 0;

            const totalDue = rentBalance + activePenaltyAmt;
            const overallArrears = (Number(t.balance) || rentBalance) + activePenaltyAmt;

            if (activePens.length > 0) activePenalizedTenantsCount++;
            totalPenaltiesAccrued += activePenaltyAmt;
            totalRentOwed += rentBalance;
            totalWaived += waivedPenaltyAmt;
            totalPaid += paidPenaltyAmt;

            // Only include tenants with rent balance or penalties
            if (activePens.length > 0 || rentBalance > 0 || waivedPens.length > 0) {
                tenantRows.push({
                    tenant_id: b.tenant_id,
                    tenant_name: t.tenant_name || 'Unknown',
                    phone: t.phone || '',
                    unit_name: t.arms_units?.unit_name || `Unit ${b.unit_id}`,
                    location_name: t.arms_units?.arms_locations?.location_name || 'General',
                    location_id: t.location_id || b.location_id,
                    monthly_rent: rentAmount,
                    rent_paid: rentPaid,
                    rent_balance: rentBalance,
                    billing_status: b.status,
                    penalty_days: activePens.length,
                    penalty_rate: '10%',
                    total_penalty: activePenaltyAmt,
                    total_rent_plus_penalty: totalDue,
                    overall_arrears: overallArrears,
                    penalty_status: activePens.length > 0 ? 'Active' : (waivedPens.length > 0 ? 'Waived' : 'Paid'),
                    penalty_dates: activePens.map(p => p.penalty_date).sort(),
                    active_penalties: activePens,
                    waived_penalties: waivedPens,
                    paid_penalties: paidPens,
                    waived_amount: waivedPenaltyAmt,
                    paid_amount: paidPenaltyAmt,
                });
            }
        });

        // Sort by highest total due first
        tenantRows.sort((a, b) => b.total_rent_plus_penalty - a.total_rent_plus_penalty);

        // Calculate days elapsed from 6th to today
        const daysElapsed = todayDay >= 6 ? (todayDay - 6 + 1) : 0;

        const totalDebtWithPenalties = tenantRows.reduce((sum, t) => sum + Number(t.overall_arrears || 0), 0);

        const summary = {
            total_tenants_penalized: activePenalizedTenantsCount,
            total_penalty_accrued: totalPenaltiesAccrued,
            total_rent_owed: totalRentOwed,
            grand_total_due: totalRentOwed + totalPenaltiesAccrued,
            total_debt_accrued: totalDebtWithPenalties,
            days_elapsed: daysElapsed,
            total_waived_amount: totalWaived,
            total_paid_amount: totalPaid,
            month: month,
            penalty_rate: '10%',
            daily_rate: 0,
            grace_period_until: '5th'
        };

        return NextResponse.json({
            tenants: tenantRows,
            total: tenantRows.length,
            summary
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ─── PATCH /api/penalties  → waive single/bulk or mark paid ──────────────────
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, penaltyId, tenantId, month, waivedBy, reason } = body;
        const now = new Date().toISOString();

        if (action === 'mark_paid') {
            if (!tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
            const amountToPay = typeof body.amount === 'number' ? body.amount : null;

            // If an explicit amount is passed, allocate FIFO up to that amount only!
            if (amountToPay !== null) {
                if (amountToPay <= 0) {
                    return NextResponse.json({ ok: true, count: 0, message: 'No excess payment amount to cover penalties' });
                }
                let q = supabaseAdmin.from('arms_penalties')
                    .select('penalty_id, amount')
                    .eq('tenant_id', Number(tenantId))
                    .eq('status', 'Active')
                    .order('penalty_date', { ascending: true });
                if (month) q = (q as any).eq('billing_month', month);
                const { data: activePens, error: fetchErr } = await q;
                if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

                let penRem = amountToPay;
                const paidIds: number[] = [];
                for (const p of (activePens || [])) {
                    const cost = p.amount || 100;
                    if (penRem >= cost) {
                        paidIds.push(p.penalty_id);
                        penRem -= cost;
                    } else {
                        break;
                    }
                }
                if (paidIds.length > 0) {
                    const { error } = await supabaseAdmin.from('arms_penalties')
                        .update({ status: 'Paid', updated_at: now })
                        .in('penalty_id', paidIds);
                    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
                }
                return NextResponse.json({ ok: true, count: paidIds.length, amountCovered: amountToPay - penRem });
            }

            // Only mark all paid if explicitly forced by admin (force === true)
            if (body.force === true) {
                let q = supabaseAdmin.from('arms_penalties').update({
                    status: 'Paid',
                    updated_at: now,
                }).eq('tenant_id', Number(tenantId)).eq('status', 'Active');
                if (month) q = (q as any).eq('billing_month', month);
                const { data, error } = await q.select('penalty_id');
                if (error) return NextResponse.json({ error: error.message }, { status: 500 });
                return NextResponse.json({ ok: true, count: data?.length || 0 });
            }

            return NextResponse.json({ ok: true, count: 0, message: 'Amount required to mark penalties paid' });
        }

        if (action === 'waive_single') {
            const { error } = await supabaseAdmin.from('arms_penalties').update({
                status: 'Waived', 
                waived_by: waivedBy || 'Admin',
                waived_at: now, 
                waive_reason: reason || 'Administrative waiver', 
                updated_at: now,
            }).eq('penalty_id', penaltyId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true });
        }

        if (action === 'waive_bulk' || action === 'waive_tenant') {
            const { data, error } = await supabaseAdmin.from('arms_penalties').update({
                status: 'Waived', 
                waived_by: waivedBy || 'Admin',
                waived_at: now, 
                waive_reason: reason || 'Administrative waiver', 
                updated_at: now,
            })
            .eq('tenant_id', tenantId)
            .eq('billing_month', month || localMonthStr(new Date()))
            .eq('status', 'Active')
            .select('penalty_id');

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true, count: data?.length || 0 });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
