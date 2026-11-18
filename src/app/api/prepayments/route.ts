import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const locationIdParam = searchParams.get('locationId');
        const locationId = locationIdParam && locationIdParam !== 'all' ? parseInt(locationIdParam, 10) : null;

        // Current system billing month is 2026-11; any bill for 2026-12 or later is an advance / prepayment
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // Cutoff for future months: strictly greater than currentMonth or '2026-11'
        const futureCutoff = currentMonth >= '2026-11' ? '2026-11' : currentMonth;

        // 1. Fetch advance bills for future months with amount_paid > 0
        let billsQuery = supabaseAdmin
            .from('arms_billing')
            .select('billing_id, tenant_id, billing_month, rent_amount, amount_paid, balance, status, created_at')
            .gt('billing_month', futureCutoff)
            .gt('amount_paid', 0)
            .order('billing_month', { ascending: true });

        // 2. Fetch all tenants
        let tenantsQuery = supabaseAdmin
            .from('arms_tenants')
            .select('tenant_id, tenant_name, phone, monthly_rent, balance, location_id, unit_id, arms_units(unit_name), arms_locations(location_name)')
            .eq('status', 'Active');

        if (locationId) {
            tenantsQuery = tenantsQuery.eq('location_id', locationId);
        }

        // 3. Fetch recent payments to attach payment details (receipt, method, date)
        let paymentsQuery = supabaseAdmin
            .from('arms_payments')
            .select('payment_id, tenant_id, amount, payment_method, mpesa_receipt, reference_no, payment_date, notes, location_id')
            .order('payment_date', { ascending: false })
            .limit(1000);

        if (locationId) {
            paymentsQuery = paymentsQuery.eq('location_id', locationId);
        }

        const [billsRes, tenantsRes, paymentsRes] = await Promise.all([
            billsQuery,
            tenantsQuery,
            paymentsQuery,
        ]);

        if (billsRes.error) throw billsRes.error;
        if (tenantsRes.error) throw tenantsRes.error;
        if (paymentsRes.error) throw paymentsRes.error;

        const tenantMap = new Map<number, any>();
        tenantsRes.data?.forEach(t => tenantMap.set(t.tenant_id, t));

        // Group payments by tenant
        const tenantPaymentsMap = new Map<number, any[]>();
        paymentsRes.data?.forEach(p => {
            const list = tenantPaymentsMap.get(p.tenant_id) || [];
            list.push(p);
            tenantPaymentsMap.set(p.tenant_id, list);
        });

        // Parse advance bills into enriched records
        const advanceRecords: any[] = [];
        const seenTenantAdvance = new Set<number>();

        (billsRes.data || []).forEach(b => {
            const tenant = tenantMap.get(b.tenant_id);
            if (!tenant) return; // If filtered by location or inactive

            seenTenantAdvance.add(b.tenant_id);
            const tenantPayments = tenantPaymentsMap.get(b.tenant_id) || [];
            // Find payment that might correspond to this month or latest payment
            const matchedPay = tenantPayments.find(p => p.notes?.includes(b.billing_month)) || tenantPayments[0];

            advanceRecords.push({
                type: 'advance_bill',
                record_id: `bill_${b.billing_id}`,
                billing_id: b.billing_id,
                tenant_id: b.tenant_id,
                tenant_name: tenant.tenant_name,
                phone: tenant.phone || '',
                unit_name: tenant.arms_units?.unit_name || '-',
                location_name: tenant.arms_locations?.location_name || '-',
                location_id: tenant.location_id,
                monthly_rent: tenant.monthly_rent || b.rent_amount,
                advance_paid: b.amount_paid,
                advance_balance_remaining: b.balance,
                target_month: b.billing_month,
                status: b.status, // 'Paid' | 'Partial'
                current_tenant_balance: tenant.balance || 0,
                receipt_code: matchedPay?.mpesa_receipt || matchedPay?.reference_no || '-',
                payment_method: matchedPay?.payment_method || 'Cash',
                payment_date: matchedPay?.payment_date || b.created_at,
                notes: matchedPay?.notes || '',
                raw_payment_id: matchedPay?.payment_id || null,
            });
        });

        // 4. Also check payments with [Credit: ...] for any tenants who have excess payment credit
        // CRITICAL: A tenant only has active credit if their current overall balance is negative (< 0).
        // If balance >= 0, any historical overpayment from past months was already consumed by subsequent bills!
        const creditRecords: any[] = [];
        (paymentsRes.data || []).forEach(p => {
            if (!p.notes || !p.notes.includes('[Credit:')) return;
            const m = p.notes.match(/\[Credit:(\d+(?:\.\d+)?)\]/);
            if (!m) return;
            const creditAmt = parseFloat(m[1]);
            if (creditAmt <= 0) return;

            const tenant = tenantMap.get(p.tenant_id);
            if (!tenant) return;
            if (tenant.balance === null || Number(tenant.balance) >= 0) return;

            const effectiveCredit = Math.min(creditAmt, Math.abs(Number(tenant.balance)));
            if (effectiveCredit <= 0) return;

            creditRecords.push({
                type: 'overpayment_credit',
                record_id: `pay_${p.payment_id}`,
                payment_id: p.payment_id,
                tenant_id: p.tenant_id,
                tenant_name: tenant.tenant_name,
                phone: tenant.phone || '',
                unit_name: tenant.arms_units?.unit_name || '-',
                location_name: tenant.arms_locations?.location_name || '-',
                location_id: tenant.location_id,
                monthly_rent: tenant.monthly_rent,
                advance_paid: effectiveCredit,
                advance_balance_remaining: 0,
                target_month: 'Credit Overpayment',
                status: 'Credit',
                current_tenant_balance: tenant.balance || 0,
                receipt_code: p.mpesa_receipt || p.reference_no || '-',
                payment_method: p.payment_method || 'Cash',
                payment_date: p.payment_date,
                notes: p.notes,
                raw_payment_id: p.payment_id,
            });
        });

        // Combined records
        const allPrepaymentRecords = [...advanceRecords, ...creditRecords];

        // Overall Metrics
        const totalAdvanceBillsAmount = advanceRecords.reduce((sum, r) => sum + (r.advance_paid || 0), 0);
        const totalCreditAmount = creditRecords.reduce((sum, r) => sum + (r.advance_paid || 0), 0);
        const totalPrepaymentSum = totalAdvanceBillsAmount + totalCreditAmount;

        const uniqueAdvanceTenants = new Set(allPrepaymentRecords.map(r => r.tenant_id));
        const fullyPaidMonthsCount = advanceRecords.filter(r => r.status === 'Paid').length;
        const partialAdvanceCount = advanceRecords.filter(r => r.status === 'Partial').length;

        // Specific December 2026 total
        const decRecords = advanceRecords.filter(r => r.target_month === '2026-12');
        const decTotal = decRecords.reduce((sum, r) => sum + (r.advance_paid || 0), 0);
        const decFullyPaid = decRecords.filter(r => r.status === 'Paid').length;

        return NextResponse.json({
            success: true,
            records: allPrepaymentRecords,
            advanceBills: advanceRecords,
            creditRecords,
            metrics: {
                totalPrepaymentSum,
                totalAdvanceBillsAmount,
                totalCreditAmount,
                totalTenantsCount: uniqueAdvanceTenants.size,
                fullyPaidMonthsCount,
                partialAdvanceCount,
                decemberTotal: decTotal,
                decemberCount: decRecords.length,
                decemberFullyPaid: decFullyPaid,
            },
        });
    } catch (err: any) {
        console.error('Error fetching prepayments:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
