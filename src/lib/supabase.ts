import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================
// ARMS - SUPABASE CONFIGURATION
// Lazy initialization to prevent build-time crashes
// ============================================
let _supabase: SupabaseClient | null = null;
export const supabase = new Proxy({} as SupabaseClient, {
    get(_, prop) {
        if (!_supabase) {
            _supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
        }
        return Reflect.get(_supabase, prop);
    }
});

// C2B M-Pesa Supabase Client (lazy)
let _c2bSupabase: SupabaseClient | null = null;
export const c2bSupabase = new Proxy({} as SupabaseClient, {
    get(_, prop) {
        if (!_c2bSupabase) {
            _c2bSupabase = createClient(
                process.env.NEXT_PUBLIC_C2B_SUPABASE_URL || 'https://pxcdaivlvltmdifxietb.supabase.co',
                process.env.NEXT_PUBLIC_C2B_SUPABASE_ANON_KEY!
            );
        }
        return Reflect.get(_c2bSupabase, prop);
    }
});

// ==================== AUTHENTICATION ====================
export async function loginUser(username: string, password: string) {
    const { data, error } = await supabase
        .from('arms_users')
        .select('*')
        .eq('user_name', username)
        .eq('active', true)
        .single();
    if (error || !data) return null;
    if (data.password_hash === password) return data;
    return null;
}

// ==================== LOCATIONS ====================
export async function getLocations() {
    const { data, error } = await supabase
        .from('arms_locations')
        .select('*')
        .eq('active', true)
        .order('location_name');
    if (error) throw error;
    return data || [];
}

export async function addLocation(location: { location_name: string; address?: string; description?: string }) {
    const { data, error } = await supabase.from('arms_locations').insert([location]).select().single();
    if (error) throw error;
    return data;
}

export async function updateLocation(id: number, updates: any) {
    const { data, error } = await supabase.from('arms_locations').update({ ...updates, updated_at: new Date().toISOString() }).eq('location_id', id).select().single();
    if (error) throw error;
    return data;
}

export async function deleteLocation(id: number) {
    const { error } = await supabase.from('arms_locations').update({ active: false }).eq('location_id', id);
    if (error) throw error;
}

// ==================== UNITS ====================
export async function getUnits(locationId?: number) {
    let query = supabase.from('arms_units').select('*, arms_locations(location_name)').eq('active', true).order('unit_name');
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function addUnit(unit: { location_id: number; unit_name: string; unit_type?: string; monthly_rent: number; deposit_amount?: number; floor_number?: string; description?: string }) {
    const { data, error } = await supabase.from('arms_units').insert([unit]).select().single();
    if (error) throw error;
    return data;
}

export async function updateUnit(id: number, updates: any) {
    const { data, error } = await supabase.from('arms_units').update({ ...updates, updated_at: new Date().toISOString() }).eq('unit_id', id).select().single();
    if (error) throw error;
    return data;
}

export async function deleteUnit(id: number) {
    const { error } = await supabase.from('arms_units').update({ active: false }).eq('unit_id', id);
    if (error) throw error;
}

// ==================== TENANTS ====================
export async function getTenants(locationId?: number) {
    let query = supabase.from('arms_tenants').select('*, arms_units(unit_name, monthly_rent), arms_locations(location_name)').order('tenant_name');
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function getTenantById(id: number) {
    const { data, error } = await supabase.from('arms_tenants').select('*, arms_units(unit_name, monthly_rent), arms_locations(location_name)').eq('tenant_id', id).single();
    if (error) throw error;
    return data;
}

export async function addTenant(tenant: {
    tenant_name: string; phone?: string; email?: string; id_number?: string;
    unit_id: number; location_id: number; monthly_rent: number;
    deposit_paid?: number; move_in_date?: string; billing_start_month?: string;
    notes?: string; emergency_contact?: string; emergency_phone?: string;
    password_hash?: string;
}) {
    const { data, error } = await supabase.from('arms_tenants').insert([{ ...tenant, status: 'Active', balance: 0 }]).select().single();
    if (error) throw error;
    // Mark unit as Occupied
    await supabase.from('arms_units').update({ status: 'Occupied' }).eq('unit_id', tenant.unit_id);

    // ── Auto-generate backdated bills from move_in_date to current month ──────
    // This ensures the tenant's balance reflects real arrears immediately.
    const rawMoveIn = tenant.move_in_date || tenant.billing_start_month;
    const monthlyRent = tenant.monthly_rent || 0;
    if (rawMoveIn && monthlyRent > 0) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const earliestMonth = rawMoveIn.slice(0, 7);
        const billsToCreate: any[] = [];
        let totalBalance = 0;
        let cursor = new Date(earliestMonth + '-01');
        const endDate = new Date(currentMonth + '-01');
        while (cursor <= endDate) {
            const curM = cursor.toISOString().slice(0, 7);
            billsToCreate.push({
                tenant_id: data.tenant_id,
                location_id: tenant.location_id,
                unit_id: tenant.unit_id,
                billing_month: curM,
                billing_date: `${curM}-01`,
                due_date: `${curM}-05`,
                rent_amount: monthlyRent,
                amount_paid: 0,
                balance: monthlyRent,
                status: 'Unpaid',
            });
            totalBalance += monthlyRent;
            cursor.setMonth(cursor.getMonth() + 1);
        }
        if (billsToCreate.length > 0) {
            await supabase.from('arms_billing').insert(billsToCreate);
            await supabase.from('arms_tenants').update({
                balance: totalBalance,
                updated_at: new Date().toISOString(),
            }).eq('tenant_id', data.tenant_id);
            return { ...data, balance: totalBalance };
        }
    }
    return data;
}

export async function updateTenant(id: number, updates: any) {
    const { data, error } = await supabase.from('arms_tenants').update({ ...updates, updated_at: new Date().toISOString() }).eq('tenant_id', id).select().single();
    if (error) throw error;
    return data;
}

export async function deactivateTenant(id: number) {
    const tenant = await getTenantById(id);
    if (tenant?.unit_id) {
        await supabase.from('arms_units').update({ status: 'Vacant' }).eq('unit_id', tenant.unit_id);
    }
    const { error } = await supabase.from('arms_tenants').update({ status: 'Inactive', move_out_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('tenant_id', id);
    if (error) throw error;
}

// ==================== BILLING ====================
export async function getBilling(filters?: { locationId?: number; month?: string; status?: string; tenantId?: number }) {
    let query = supabase.from('arms_billing').select('*, arms_tenants(tenant_name, phone), arms_units(unit_name), arms_locations(location_name)').order('billing_date', { ascending: false });
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.month) query = query.eq('billing_month', filters.month);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function generateMonthlyBills(month: string, locationId?: number): Promise<{
    bills: any[]; generated: number; skipped: number; catchUpMonths: number; errors: string[];
}> {
    // ── 1. Load all active tenants ───────────────────────────────────────────
    let query = supabase.from('arms_tenants').select('*').eq('status', 'Active');
    if (locationId) query = query.eq('location_id', locationId);
    const { data: tenants, error } = await query;
    if (error) throw error;
    if (!tenants?.length) return { bills: [], generated: 0, skipped: 0, catchUpMonths: 0, errors: [] };

    const allBills: any[] = [];
    let skipped = 0, catchUpMonths = 0;
    const errors: string[] = [];

    for (const tenant of tenants) {
        try {
            const monthlyRent = tenant.monthly_rent || 0;
            if (monthlyRent <= 0) { skipped++; continue; }

            // Determine earliest billing month from move_in_date
            const moveInDate = tenant.move_in_date || tenant.created_at?.slice(0, 10);
            const earliestMonth = moveInDate ? moveInDate.slice(0, 7) : month;

            // Skip if tenant hadn't moved in by this month  
            if (earliestMonth > month) { skipped++; continue; }

            // ── 2. Find ALL existing bill months for this tenant ─────────────
            const { data: existingBills } = await supabase
                .from('arms_billing').select('billing_month')
                .eq('tenant_id', tenant.tenant_id);
            const existingMonths = new Set((existingBills || []).map((b: any) => b.billing_month));

            // ── 3. Generate all missing months from move-in to target (catch-up) ─
            const newBillsToInsert: any[] = [];
            let balanceIncrease = 0;

            let cursor = new Date(earliestMonth + '-01');
            const endDate = new Date(month + '-01');

            while (cursor <= endDate) {
                const curMonth = cursor.toISOString().slice(0, 7);
                if (!existingMonths.has(curMonth)) {
                    newBillsToInsert.push({
                        tenant_id: tenant.tenant_id,
                        location_id: tenant.location_id,
                        unit_id: tenant.unit_id,
                        billing_month: curMonth,
                        billing_date: `${curMonth}-01`,
                        due_date: `${curMonth}-05`,
                        rent_amount: monthlyRent,
                        amount_paid: 0,
                        balance: monthlyRent,
                        status: 'Unpaid',
                    });
                    balanceIncrease += monthlyRent;
                    if (curMonth < month) catchUpMonths++;
                }
                cursor.setMonth(cursor.getMonth() + 1);
            }

            if (newBillsToInsert.length === 0) { skipped++; continue; }

            // ── 4. Batch insert bills ─────────────────────────────────────────
            const { data: inserted, error: insertErr } = await supabase
                .from('arms_billing').insert(newBillsToInsert).select();
            if (insertErr) { errors.push(`${tenant.tenant_name}: ${insertErr.message}`); continue; }
            if (inserted) allBills.push(...inserted);

            // ── 5. Update tenant balance (re-fetch to avoid race) ─────────────
            const { data: freshTenant } = await supabase
                .from('arms_tenants').select('balance').eq('tenant_id', tenant.tenant_id).single();
            const newBalance = Math.round(((freshTenant?.balance || 0) + balanceIncrease) * 100) / 100;
            await supabase.from('arms_tenants').update({
                balance: newBalance,
                updated_at: new Date().toISOString(),
            }).eq('tenant_id', tenant.tenant_id);

        } catch (err: any) {
            errors.push(`${tenant.tenant_name}: ${err.message}`);
        }
    }

    return { bills: allBills, generated: allBills.length, skipped, catchUpMonths, errors };
}

// ==================== ACCUMULATED ARREARS FOR TENANT ====================
// Computes REAL arrears from move_in_date → today, even if bills were never generated.
// Unbilled months are treated as fully owed (virtual) and shown with _virtual:true.
export async function getAccumulatedArrearsForTenant(tenantId: number) {
    const currentMonth = new Date().toISOString().slice(0, 7);

    // 1. Load tenant (we need monthly_rent and move_in_date)
    const { data: tenant, error: tenantErr } = await supabase
        .from('arms_tenants').select('monthly_rent, move_in_date, created_at, balance').eq('tenant_id', tenantId).single();
    if (tenantErr || !tenant) throw tenantErr || new Error('Tenant not found');

    const monthlyRent = Math.round((tenant.monthly_rent || 0) * 100) / 100;
    const rawMoveIn = tenant.move_in_date || tenant.created_at?.slice(0, 10);
    const earliestMonth = rawMoveIn ? rawMoveIn.slice(0, 7) : currentMonth;

    // 2. Load ALL billing records for this tenant (any status)
    const { data: allBills, error: billsErr } = await supabase
        .from('arms_billing').select('*').eq('tenant_id', tenantId)
        .order('billing_date', { ascending: true });
    if (billsErr) throw billsErr;

    const billsByMonth = new Map<string, any>((allBills || []).map(b => [b.billing_month, b]));

    // 3. Walk month-by-month from move_in to current, building unified bill list
    const resultBills: any[] = [];
    let arrearsTotal = 0;
    let currentMonthDue = 0;

    let cursor = new Date(earliestMonth + '-01');
    const endDate = new Date(currentMonth + '-01');

    while (cursor <= endDate) {
        const curMonth = cursor.toISOString().slice(0, 7);
        const bill = billsByMonth.get(curMonth);

        if (bill) {
            // Real bill exists — use its remaining balance
            const balance = Math.round((bill.balance || 0) * 100) / 100;
            if (balance > 0) {
                resultBills.push({ ...bill, _virtual: false });
                if (curMonth < currentMonth) arrearsTotal += balance;
                else currentMonthDue += balance;
            }
        } else {
            // No bill generated for this month — whole rent is owed (virtual)
            if (monthlyRent > 0) {
                resultBills.push({
                    billing_id: null,
                    tenant_id: tenantId,
                    billing_month: curMonth,
                    billing_date: `${curMonth}-01`,
                    due_date: `${curMonth}-05`,
                    rent_amount: monthlyRent,
                    amount_paid: 0,
                    balance: monthlyRent,
                    status: 'Unbilled',
                    _virtual: true,
                });
                if (curMonth < currentMonth) arrearsTotal += monthlyRent;
                else currentMonthDue += monthlyRent;
            }
        }
        cursor.setMonth(cursor.getMonth() + 1);
    }

    const totalDue = Math.round((arrearsTotal + currentMonthDue) * 100) / 100;
    const arrearsMonths = resultBills.filter(b => b.billing_month < currentMonth).map(b => b.billing_month);
    const hasVirtualBills = resultBills.some(b => b._virtual);
    const virtualMonths = resultBills.filter(b => b._virtual).map(b => b.billing_month);

    return {
        bills: resultBills,
        arrearsTotal: Math.round(arrearsTotal * 100) / 100,
        currentMonthDue: Math.round(currentMonthDue * 100) / 100,
        totalDue,
        arrearsMonths,
        hasVirtualBills,
        virtualMonths,
    };
}

// ==================== PAYMENTS ====================
export async function getPayments(filters?: { locationId?: number; tenantId?: number; startDate?: string; endDate?: string; method?: string }) {
    let query = supabase.from('arms_payments')
        .select('*, arms_tenants(tenant_name, phone, monthly_rent, balance, id_number, arms_units(unit_name)), arms_locations(location_name)')
        .order('payment_date', { ascending: false });
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    if (filters?.method) query = query.eq('payment_method', filters.method);
    if (filters?.startDate) query = query.gte('payment_date', filters.startDate);
    if (filters?.endDate) query = query.lte('payment_date', filters.endDate);
    const { data, error } = await query;
    if (error) throw error;
    // Parse arrears tags from notes
    return (data || []).map(p => ({
        ...p,
        arrears_paid: parseNoteTag(p.notes, 'ArrearsPaid'),
        current_rent_paid: parseNoteTag(p.notes, 'CurrentRentPaid'),
    }));
}

// Helper to parse numeric tags from payment notes, e.g. [ArrearsPaid:3000]
function parseNoteTag(notes: string | null, tag: string): number {
    if (!notes) return 0;
    const m = notes.match(new RegExp(`\\[${tag}:(\\d+(?:\\.\\d+)?)\\]`));
    return m ? parseFloat(m[1]) : 0;
}

export async function recordPayment(payment: {
    tenant_id: number; amount: number; payment_method: string;
    mpesa_receipt?: string; mpesa_phone?: string; reference_no?: string;
    recorded_by?: string; notes?: string; location_id?: number;
}): Promise<any> {
    // ── 1. Validate and fetch fresh tenant data ──────────────────────────────
    const paymentAmount = Math.round(payment.amount * 100) / 100;
    if (paymentAmount <= 0) throw new Error('Payment amount must be greater than zero');

    const { data: tenant, error: tenantErr } = await supabase
        .from('arms_tenants').select('*').eq('tenant_id', payment.tenant_id).single();
    if (tenantErr || !tenant) throw new Error('Tenant not found');

    const currentMonth = new Date().toISOString().slice(0, 7);

    // ── 2. Auto-generate missing bills from move_in_date to current month ────
    //      This ensures backdated tenants always have bill records for FIFO.
    const moveInDate = tenant.move_in_date || tenant.created_at?.slice(0, 10);
    const earliestMonth = moveInDate ? moveInDate.slice(0, 7) : currentMonth;

    // Find which months already have bills
    const { data: existingBills } = await supabase
        .from('arms_billing').select('billing_month').eq('tenant_id', payment.tenant_id);
    const existingMonths = new Set((existingBills || []).map((b: any) => b.billing_month));

    // Generate any missing month bills up to current month
    const billsToCreate: any[] = [];
    let autoBalanceIncrease = 0;
    let cursor2 = new Date(earliestMonth + '-01');
    const endDate2 = new Date(currentMonth + '-01');
    while (cursor2 <= endDate2) {
        const curM = cursor2.toISOString().slice(0, 7);
        if (!existingMonths.has(curM) && (tenant.monthly_rent || 0) > 0) {
            billsToCreate.push({
                tenant_id: payment.tenant_id,
                location_id: tenant.location_id,
                unit_id: tenant.unit_id,
                billing_month: curM, billing_date: `${curM}-01`, due_date: `${curM}-05`,
                rent_amount: tenant.monthly_rent, amount_paid: 0,
                balance: tenant.monthly_rent, status: 'Unpaid',
            });
            autoBalanceIncrease += tenant.monthly_rent;
        }
        cursor2.setMonth(cursor2.getMonth() + 1);
    }
    if (billsToCreate.length > 0) {
        await supabase.from('arms_billing').insert(billsToCreate);
        // Reflect newly generated bills in tenant balance
        const { data: freshT } = await supabase.from('arms_tenants').select('balance').eq('tenant_id', payment.tenant_id).single();
        const updatedBal = Math.round(((freshT?.balance || 0) + autoBalanceIncrease) * 100) / 100;
        await supabase.from('arms_tenants').update({ balance: updatedBal, updated_at: new Date().toISOString() }).eq('tenant_id', payment.tenant_id);
    }

    // ── 3. Fetch ALL bills with outstanding balance, oldest first (FIFO) ─────
    const { data: bills, error: billsErr } = await supabase
        .from('arms_billing').select('*')
        .eq('tenant_id', payment.tenant_id)
        .gt('balance', 0)
        .order('billing_date', { ascending: true });
    if (billsErr) throw billsErr;

    // ── 4. Strict FIFO allocation with precise cent-level arithmetic ──────────
    let remaining = paymentAmount;
    let arrearsPaid = 0;
    let currentRentPaid = 0;
    let creditAmount = 0;

    interface Alloc {
        billingId: number; billing_month: string;
        amountAllocated: number;
        newAmountPaid: number; newBalance: number; newStatus: string;
        isArrear: boolean;
    }
    const allocations: Alloc[] = [];

    for (const bill of (bills || [])) {
        if (remaining <= 0) break;
        const billBalance = Math.round((bill.balance || 0) * 100) / 100;
        if (billBalance <= 0) continue;

        const allocAmount = Math.min(remaining, billBalance);
        const newAmountPaid = Math.round(((bill.amount_paid || 0) + allocAmount) * 100) / 100;
        const newBalance = Math.max(0, Math.round((bill.rent_amount - newAmountPaid) * 100) / 100);
        const newStatus: string = newBalance <= 0 ? 'Paid' : newAmountPaid > 0 ? 'Partial' : 'Unpaid';
        const isArrear = bill.billing_month < currentMonth;

        allocations.push({ billingId: bill.billing_id, billing_month: bill.billing_month, amountAllocated: allocAmount, newAmountPaid, newBalance, newStatus, isArrear });

        if (isArrear) arrearsPaid = Math.round((arrearsPaid + allocAmount) * 100) / 100;
        else currentRentPaid = Math.round((currentRentPaid + allocAmount) * 100) / 100;

        remaining = Math.round((remaining - allocAmount) * 100) / 100;
    }

    // Any leftover is credit (overpayment)
    creditAmount = Math.round(remaining * 100) / 100;

    // ── 4. Build rich notes with allocation metadata ────────────────────────
    const nbMonths = allocations.length;
    const arrearsMonths = allocations.filter(a => a.isArrear).map(a => a.billing_month).join(',');
    const metaTags = [
        `[ArrearsPaid:${arrearsPaid}]`,
        `[CurrentRentPaid:${currentRentPaid}]`,
        nbMonths > 0 ? `[BillsCleared:${nbMonths}]` : '',
        arrearsMonths ? `[ArrearMonths:${arrearsMonths}]` : '',
        creditAmount > 0 ? `[Credit:${creditAmount}]` : '',
    ].filter(Boolean).join('');
    const finalNotes = payment.notes ? `${payment.notes} ${metaTags}` : metaTags;

    // ── 5. Insert payment record ─────────────────────────────────────────────
    const { data: paymentRecord, error: payError } = await supabase
        .from('arms_payments').insert([{
            tenant_id: payment.tenant_id,
            billing_id: allocations.length > 0 ? allocations[0].billingId : null,
            location_id: payment.location_id || tenant.location_id,
            amount: paymentAmount,
            payment_method: payment.payment_method,
            mpesa_receipt: payment.mpesa_receipt || null,
            mpesa_phone: payment.mpesa_phone || null,
            reference_no: payment.reference_no || null,
            recorded_by: payment.recorded_by || null,
            notes: finalNotes,
            payment_date: new Date().toISOString(),
        }]).select().single();
    if (payError) throw payError;

    // ── 6. Update billing records in parallel ────────────────────────────────
    await Promise.all(
        allocations.map(alloc =>
            supabase.from('arms_billing').update({
                amount_paid: alloc.newAmountPaid,
                balance: alloc.newBalance,
                status: alloc.newStatus,
                updated_at: new Date().toISOString(),
            }).eq('billing_id', alloc.billingId)
        )
    );

    // ── 7. Update tenant balance (re-fetch to avoid stale data race) ─────────
    const { data: freshTenant } = await supabase
        .from('arms_tenants').select('balance').eq('tenant_id', payment.tenant_id).single();
    const latestBalance = Math.round(((freshTenant?.balance || 0)) * 100) / 100;
    const newTenantBalance = Math.max(0, Math.round((latestBalance - paymentAmount) * 100) / 100);
    await supabase.from('arms_tenants').update({
        balance: newTenantBalance,
        updated_at: new Date().toISOString(),
    }).eq('tenant_id', payment.tenant_id);

    // ── 8. Return full breakdown for receipt & UI ────────────────────────────
    return {
        ...paymentRecord,
        arrearsPaid,
        currentRentPaid,
        creditAmount,
        billsCleared: allocations.filter(a => a.newStatus === 'Paid').length,
        arrearsMonthsCleared: allocations.filter(a => a.isArrear && a.newStatus === 'Paid').length,
        newTenantBalance,
        allocations,
    };
}

// ==================== DELETE PAYMENT ====================
export async function deletePayment(paymentId: number) {
    const { data: payment, error } = await supabase.from('arms_payments').select('*').eq('payment_id', paymentId).single();
    if (error || !payment) throw new Error('Payment not found');

    // Get all bills for tenant ordered oldest first to reverse FIFO in reverse order
    const { data: bills } = await supabase
        .from('arms_billing').select('*')
        .eq('tenant_id', payment.tenant_id)
        .order('billing_date', { ascending: false }); // newest first for reversal

    let amountToReverse = payment.amount;
    // Reverse from most recently paid bills first (reverse FIFO)
    const paidBills = (bills || []).filter(b => (b.amount_paid || 0) > 0);
    for (const bill of paidBills) {
        if (amountToReverse <= 0) break;
        const reverseAmount = Math.min(amountToReverse, bill.amount_paid || 0);
        const newAmountPaid = Math.max(0, (bill.amount_paid || 0) - reverseAmount);
        const newBalance = bill.rent_amount - newAmountPaid;
        const newStatus = newBalance <= 0 ? 'Paid' : newAmountPaid > 0 ? 'Partial' : 'Unpaid';
        await supabase.from('arms_billing').update({
            amount_paid: newAmountPaid,
            balance: Math.max(0, newBalance),
            status: newStatus,
            updated_at: new Date().toISOString()
        }).eq('billing_id', bill.billing_id);
        amountToReverse -= reverseAmount;
    }

    // Restore tenant balance
    const { data: tenant } = await supabase.from('arms_tenants').select('balance').eq('tenant_id', payment.tenant_id).single();
    if (tenant) {
        await supabase.from('arms_tenants').update({
            balance: (tenant.balance || 0) + payment.amount,
            updated_at: new Date().toISOString()
        }).eq('tenant_id', payment.tenant_id);
    }

    const { error: delErr } = await supabase.from('arms_payments').delete().eq('payment_id', paymentId);
    if (delErr) throw delErr;
}

// ==================== UPDATE PAYMENT ====================
export async function updatePaymentNotes(paymentId: number, updates: { reference_no?: string; notes?: string }) {
    const { data, error } = await supabase.from('arms_payments').update(updates).eq('payment_id', paymentId).select().single();
    if (error) throw error;
    return data;
}

// ==================== ARREARS PAYMENTS DETAIL ====================
export async function getArrearsPaymentsDetail(locationId?: number) {
    let query = supabase.from('arms_payments')
        .select('*, arms_tenants(tenant_name, phone, monthly_rent, balance, arms_units(unit_name)), arms_locations(location_name)')
        .order('payment_date', { ascending: false });
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(p => ({
        ...p,
        arrears_paid: parseNoteTag(p.notes, 'ArrearsPaid'),
        current_rent_paid: parseNoteTag(p.notes, 'CurrentRentPaid'),
    })).filter(p => p.arrears_paid > 0);
}

// ==================== M-PESA C2B ====================
export async function getMpesaTransactions(matched?: boolean) {
    let query = supabase.from('arms_mpesa_transactions').select('*, arms_tenants(tenant_name, phone)').order('created_at', { ascending: false });
    if (matched !== undefined) query = query.eq('matched', matched);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function autoMatchMpesa(transactionId: number) {
    const { data: txn } = await supabase.from('arms_mpesa_transactions').select('*').eq('id', transactionId).single();
    if (!txn || txn.matched) return null;

    // Try to match by phone
    const phone = txn.msisdn?.replace(/^254/, '0');
    const { data: tenant } = await supabase.from('arms_tenants').select('*').eq('phone', phone).eq('status', 'Active').single();

    if (tenant) {
        // Record payment
        const paymentRecord = await recordPayment({
            tenant_id: tenant.tenant_id,
            amount: txn.trans_amount,
            payment_method: 'M-Pesa',
            mpesa_receipt: txn.trans_id,
            mpesa_phone: phone,
            location_id: tenant.location_id,
            recorded_by: 'M-Pesa Auto',
            notes: `Auto-matched from M-Pesa: ${txn.first_name} ${txn.last_name}`
        });

        // Mark transaction as matched
        await supabase.from('arms_mpesa_transactions').update({
            matched: true,
            tenant_id: tenant.tenant_id,
            payment_id: paymentRecord.payment_id,
            matched_at: new Date().toISOString()
        }).eq('id', transactionId);

        return { tenant, paymentRecord };
    }
    return null;
}

export async function autoMatchAllUnmatched() {
    const { data: unmatched } = await supabase.from('arms_mpesa_transactions').select('*').eq('matched', false);
    if (!unmatched) return [];
    const results = [];
    for (const txn of unmatched) {
        const result = await autoMatchMpesa(txn.id);
        if (result) results.push(result);
    }
    return results;
}

// ==================== REPORTS ====================
export async function getTenantStatement(tenantId: number) {
    const [tenant, bills, payments] = await Promise.all([
        getTenantById(tenantId),
        getBilling({ tenantId }),
        getPayments({ tenantId })
    ]);
    return { tenant, bills, payments };
}

export async function getLocationSummary(locationId?: number) {
    let tenantQuery = supabase.from('arms_tenants').select('*');
    let unitQuery = supabase.from('arms_units').select('*').eq('active', true);
    if (locationId) {
        tenantQuery = tenantQuery.eq('location_id', locationId);
        unitQuery = unitQuery.eq('location_id', locationId);
    }
    const [{ data: tenants }, { data: units }] = await Promise.all([tenantQuery, unitQuery]);
    const activeTenants = tenants?.filter(t => t.status === 'Active') || [];
    const totalUnits = units?.length || 0;
    const occupiedUnits = units?.filter(u => u.status === 'Occupied').length || 0;
    const totalArrears = activeTenants.reduce((sum, t) => sum + (t.balance || 0), 0);
    const expectedRevenue = activeTenants.reduce((sum, t) => sum + (t.monthly_rent || 0), 0);
    return { totalUnits, occupiedUnits, vacantUnits: totalUnits - occupiedUnits, activeTenants: activeTenants.length, totalArrears, expectedRevenue };
}

// ==================== DASHBOARD STATS ====================
export async function getDashboardStats(locationId?: number) {
    const summary = await getLocationSummary(locationId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const todayStr = new Date().toISOString().split('T')[0];

    let billQuery = supabase.from('arms_billing').select('*').eq('billing_month', currentMonth);
    if (locationId) billQuery = billQuery.eq('location_id', locationId);
    const { data: bills } = await billQuery;

    let paymentQuery = supabase.from('arms_payments').select('amount').gte('payment_date', `${currentMonth}-01`);
    if (locationId) paymentQuery = paymentQuery.eq('location_id', locationId);
    const { data: payments } = await paymentQuery;

    // All-time arrears paid: parse from notes
    let allPayQuery = supabase.from('arms_payments').select('amount, notes');
    if (locationId) allPayQuery = allPayQuery.eq('location_id', locationId);
    const { data: allPayments } = await allPayQuery;
    const totalArrearsPaid = (allPayments || []).reduce((sum, p) => sum + parseNoteTag(p.notes, 'ArrearsPaid'), 0);
    const totalCurrentRentPaid = (allPayments || []).reduce((sum, p) => sum + parseNoteTag(p.notes, 'CurrentRentPaid'), 0);

    // Tenants who moved in today
    let todayQ = supabase.from('arms_tenants').select('tenant_id', { count: 'exact', head: true }).eq('status', 'Active').gte('move_in_date', todayStr).lte('move_in_date', todayStr);
    if (locationId) todayQ = todayQ.eq('location_id', locationId);
    const { count: tenantsNewToday } = await todayQ;

    const monthlyCollected = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const monthlyBilled = bills?.reduce((sum, b) => sum + (b.rent_amount || 0), 0) || 0;
    const collectionRate = monthlyBilled > 0 ? Math.round((monthlyCollected / monthlyBilled) * 100) : 0;

    return { ...summary, monthlyCollected, monthlyBilled, collectionRate, totalArrearsPaid, totalCurrentRentPaid, tenantsNewToday: tenantsNewToday || 0 };
}

export async function getRecentPayments(limit = 10, locationId?: number) {
    let query = supabase.from('arms_payments').select('*, arms_tenants(tenant_name, phone), arms_locations(location_name)').order('payment_date', { ascending: false }).limit(limit);
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function getOverdueTenants(locationId?: number) {
    let query = supabase.from('arms_tenants').select('*, arms_units(unit_name), arms_locations(location_name)').eq('status', 'Active').gt('balance', 0).order('balance', { ascending: false });
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// ==================== UNPAID RENT CALCULATOR ====================
// Generates month-by-month unpaid rent with 2% late penalty (after 5th)
// Only for active tenants who haven't moved out
export async function calculateUnpaidRent(locationId?: number) {
    // 1. Get all ACTIVE tenants (no move_out_date or move_out_date in future)
    let tenantQuery = supabase.from('arms_tenants')
        .select('*, arms_units(unit_name, monthly_rent), arms_locations(location_name)')
        .eq('status', 'Active')
        .order('tenant_name');
    if (locationId) tenantQuery = tenantQuery.eq('location_id', locationId);
    const { data: tenants, error: tErr } = await tenantQuery;
    if (tErr) throw tErr;

    // Filter out tenants who have moved out
    const activeTenants = (tenants || []).filter(t => {
        if (!t.move_out_date) return true;
        return new Date(t.move_out_date) > new Date();
    });

    if (activeTenants.length === 0) return [];

    // 2. Get all billing and payment records for these tenants
    const tenantIds = activeTenants.map(t => t.tenant_id);
    const [billRes, payRes] = await Promise.all([
        supabase.from('arms_billing').select('*').in('tenant_id', tenantIds),
        supabase.from('arms_payments').select('*').in('tenant_id', tenantIds),
    ]);
    const allBills = billRes.data || [];
    const allPayments = payRes.data || [];

    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // e.g. "2026-04"
    const currentDay = now.getDate();

    // 3. For each tenant, calculate unpaid months
    const results = activeTenants.map(tenant => {
        const moveIn = tenant.move_in_date || tenant.billing_start_month || tenant.created_at?.slice(0, 10);
        if (!moveIn) return null;

        const moveInDate = new Date(moveIn);
        const monthlyRent = tenant.monthly_rent || tenant.arms_units?.monthly_rent || 0;

        // Generate all expected billing months from move-in to current month
        const expectedMonths: string[] = [];
        const startDate = new Date(moveInDate.getFullYear(), moveInDate.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
        let cursor = new Date(startDate);
        while (cursor <= endDate) {
            expectedMonths.push(cursor.toISOString().slice(0, 7));
            cursor.setMonth(cursor.getMonth() + 1);
        }

        // Check existing bills for this tenant
        const tenantBills = allBills.filter(b => b.tenant_id === tenant.tenant_id);
        const tenantPayments = allPayments.filter(p => p.tenant_id === tenant.tenant_id);

        let totalUnpaid = 0;
        let totalPenalty = 0;
        const unpaidMonths: { month: string; rent: number; paid: number; balance: number; penalty: number; status: string }[] = [];

        for (const month of expectedMonths) {
            const existingBill = tenantBills.find(b => b.billing_month === month);

            if (existingBill) {
                // Bill exists - use its data
                const billBalance = existingBill.balance || 0;
                if (existingBill.status !== 'Paid' && billBalance > 0) {
                    // Calculate penalty: if past the 5th of the billed month and still unpaid
                    const billMonthDate = new Date(month + '-05');
                    const isLate = now > billMonthDate;
                    const penalty = isLate ? Math.round(monthlyRent * 0.02) : 0;

                    unpaidMonths.push({
                        month,
                        rent: existingBill.rent_amount || monthlyRent,
                        paid: existingBill.amount_paid || 0,
                        balance: billBalance,
                        penalty,
                        status: existingBill.status,
                    });
                    totalUnpaid += billBalance;
                    totalPenalty += penalty;
                }
            } else {
                // No bill exists for this month - it's unpaid
                const billMonthDate = new Date(month + '-05');
                const isLate = now > billMonthDate;
                const penalty = isLate ? Math.round(monthlyRent * 0.02) : 0;

                unpaidMonths.push({
                    month,
                    rent: monthlyRent,
                    paid: 0,
                    balance: monthlyRent,
                    penalty,
                    status: 'Unpaid',
                });
                totalUnpaid += monthlyRent;
                totalPenalty += penalty;
            }
        }

        if (unpaidMonths.length === 0) return null;

        return {
            ...tenant,
            unpaidMonths,
            totalUnpaid,
            totalPenalty,
            totalOwed: totalUnpaid + totalPenalty,
            monthsOwed: unpaidMonths.length,
        };
    }).filter(Boolean) as any[];

    return results;
}

// ==================== 12-MONTH ANALYTICS ====================
export async function get12MonthAnalytics(locationId?: number) {
    const months: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.toISOString().slice(0, 7));
    }

    // Fetch all billing and payments for the 12-month range
    const startMonth = months[0];
    const endMonth = months[months.length - 1];
    let billQ = supabase.from('arms_billing').select('*').gte('billing_month', startMonth).lte('billing_month', endMonth);
    let payQ = supabase.from('arms_payments').select('*').gte('payment_date', `${startMonth}-01`);
    if (locationId) { billQ = billQ.eq('location_id', locationId); payQ = payQ.eq('location_id', locationId); }
    const [{ data: allBills }, { data: allPayments }] = await Promise.all([billQ, payQ]);

    const analytics = months.map(month => {
        const monthBills = allBills?.filter(b => b.billing_month === month) || [];
        const monthPayments = allPayments?.filter(p => p.payment_date?.startsWith(month)) || [];
        const billed = monthBills.reduce((s, b) => s + (b.rent_amount || 0), 0);
        const collected = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
        const cashCollected = monthPayments.filter(p => p.payment_method === 'Cash').reduce((s, p) => s + (p.amount || 0), 0);
        const mpesaCollected = monthPayments.filter(p => p.payment_method === 'M-Pesa').reduce((s, p) => s + (p.amount || 0), 0);
        const unpaid = monthBills.filter(b => b.status !== 'Paid').reduce((s, b) => s + (b.balance || 0), 0);
        const paidCount = monthBills.filter(b => b.status === 'Paid').length;
        const unpaidCount = monthBills.filter(b => b.status !== 'Paid').length;
        const label = new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return { month, label, billed, collected, cashCollected, mpesaCollected, unpaid, paidCount, unpaidCount, rate: billed > 0 ? Math.round((collected / billed) * 100) : 0 };
    });
    return analytics;
}

export async function getCurrentMonthGrid(locationId?: number) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    let query = supabase.from('arms_billing').select('*, arms_tenants(tenant_name, phone), arms_units(unit_name), arms_locations(location_name)').eq('billing_month', currentMonth);
    if (locationId) query = query.eq('location_id', locationId);
    const { data } = await query;
    const paid = data?.filter(b => b.status === 'Paid') || [];
    const unpaid = data?.filter(b => b.status !== 'Paid') || [];
    const totalDue = unpaid.reduce((s, b) => s + (b.balance || 0), 0);
    const totalPaid = paid.reduce((s, b) => s + (b.amount_paid || 0), 0);
    return { paid, unpaid, totalDue, totalPaid, currentMonth };
}

// ==================== SETTINGS ====================
export async function getSettings() {
    const { data, error } = await supabase.from('arms_settings').select('*');
    if (error) throw error;
    return data || [];
}

export async function updateSetting(key: string, value: string) {
    const { error } = await supabase.from('arms_settings').upsert({ setting_key: key, setting_value: value }, { onConflict: 'setting_key' });
    if (error) throw error;
}

// ==================== EXPENSES ====================
export async function getExpenses(filters?: { locationId?: number; category?: string; startDate?: string; endDate?: string }) {
    let query = supabase.from('arms_expenses').select('*, arms_locations(location_name)').order('expense_date', { ascending: false });
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.startDate) query = query.gte('expense_date', filters.startDate);
    if (filters?.endDate) query = query.lte('expense_date', filters.endDate);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function addExpense(expense: { location_id?: number; expense_date: string; category: string; description?: string; amount: number; payment_method?: string; vendor?: string; receipt_number?: string; recorded_by?: string; recurring?: boolean; recurring_interval?: string; notes?: string }) {
    const { data, error } = await supabase.from('arms_expenses').insert(expense).select().single();
    if (error) throw error;
    return data;
}

export async function updateExpense(id: number, updates: Record<string, any>) {
    const { data, error } = await supabase.from('arms_expenses').update(updates).eq('expense_id', id).select().single();
    if (error) throw error;
    return data;
}

export async function deleteExpense(id: number) {
    const { error } = await supabase.from('arms_expenses').delete().eq('expense_id', id);
    if (error) throw error;
}

export async function getExpenseCategories() {
    const { data, error } = await supabase.from('arms_expenses').select('category');
    if (error) throw error;
    const cats = Array.from(new Set(data?.map(d => d.category) || []));
    return cats.sort();
}

export async function getExpenseSummary(locationId?: number) {
    const expenses = await getExpenses(locationId ? { locationId } : undefined);
    const totalAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const byCategory: Record<string, number> = {};
    expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + (e.amount || 0); });
    const byLocation: Record<string, number> = {};
    expenses.forEach(e => { const loc = e.arms_locations?.location_name || 'Unknown'; byLocation[loc] = (byLocation[loc] || 0) + (e.amount || 0); });
    const thisMonth = expenses.filter(e => e.expense_date?.startsWith(new Date().toISOString().slice(0, 7)));
    const thisMonthTotal = thisMonth.reduce((s, e) => s + (e.amount || 0), 0);
    return { totalAmount, byCategory, byLocation, thisMonthTotal, count: expenses.length };
}

// ==================== UTILITY BILLING ====================
export async function getUtilityTypes() {
    const { data, error } = await supabase.from('arms_utility_types').select('*').eq('is_active', true).order('utility_name');
    if (error) throw error;
    return data || [];
}

export async function getMeterReadings(filters?: { unitId?: number; utilityTypeId?: number; locationId?: number }) {
    let query = supabase.from('arms_meter_readings').select('*, arms_units(unit_name), arms_utility_types(utility_name, unit_of_measure)').order('reading_date', { ascending: false });
    if (filters?.unitId) query = query.eq('unit_id', filters.unitId);
    if (filters?.utilityTypeId) query = query.eq('utility_type_id', filters.utilityTypeId);
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function addMeterReading(reading: { unit_id: number; utility_type_id: number; location_id?: number; previous_reading: number; current_reading: number; reading_date?: string; reading_type?: string; read_by?: string; notes?: string }) {
    const { data, error } = await supabase.from('arms_meter_readings').insert(reading).select().single();
    if (error) throw error;
    return data;
}

export async function getLatestReading(unitId: number, utilityTypeId: number) {
    const { data, error } = await supabase.from('arms_meter_readings')
        .select('current_reading').eq('unit_id', unitId).eq('utility_type_id', utilityTypeId)
        .order('reading_date', { ascending: false }).limit(1);
    if (error) throw error;
    return data?.[0]?.current_reading || 0;
}

export async function getUtilityBills(filters?: { tenantId?: number; locationId?: number; month?: string; utilityTypeId?: number }) {
    let query = supabase.from('arms_utility_bills').select('*, arms_tenants(tenant_name, phone), arms_units(unit_name), arms_utility_types(utility_name, unit_of_measure), arms_locations(location_name)').order('billing_month', { ascending: false });
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.month) query = query.eq('billing_month', filters.month);
    if (filters?.utilityTypeId) query = query.eq('utility_type_id', filters.utilityTypeId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function generateUtilityBills(month: string, utilityTypeId: number, locationId?: number) {
    // Get rate
    let rateQuery = supabase.from('arms_utility_rates').select('*').eq('utility_type_id', utilityTypeId).eq('is_active', true);
    if (locationId) rateQuery = rateQuery.eq('location_id', locationId);
    const { data: rates } = await rateQuery;
    const rate = rates?.[0];
    if (!rate) throw new Error('No utility rate configured for this type');

    // Get occupied units
    let unitQuery = supabase.from('arms_units').select('*, arms_tenants!inner(tenant_id, tenant_name, phone, status), arms_locations(location_name)').eq('status', 'Occupied').eq('active', true);
    if (locationId) unitQuery = unitQuery.eq('location_id', locationId);
    const { data: units } = await unitQuery;
    if (!units?.length) return { generated: 0, bills: [] };

    const bills: any[] = [];
    for (const unit of units) {
        const tenant = Array.isArray(unit.arms_tenants) ? unit.arms_tenants[0] : unit.arms_tenants;
        if (!tenant || tenant.status !== 'Active') continue;

        // Check if bill already exists
        const { data: existing } = await supabase.from('arms_utility_bills').select('utility_bill_id')
            .eq('tenant_id', tenant.tenant_id).eq('utility_type_id', utilityTypeId).eq('billing_month', month);
        if (existing && existing.length > 0) continue;

        // Get latest reading for this unit
        const latestReading = await getLatestReading(unit.unit_id, utilityTypeId);
        const previousReading = 0; // simplified - would need previous month's reading

        const consumption = latestReading - previousReading;
        const totalAmount = (consumption * rate.rate_per_unit) + rate.fixed_charge;

        const { data: bill, error } = await supabase.from('arms_utility_bills').insert({
            tenant_id: tenant.tenant_id,
            unit_id: unit.unit_id,
            location_id: unit.location_id,
            utility_type_id: utilityTypeId,
            billing_month: month,
            previous_reading: previousReading,
            current_reading: latestReading,
            consumption,
            rate_per_unit: rate.rate_per_unit,
            fixed_charge: rate.fixed_charge,
            total_amount: totalAmount,
            balance: totalAmount,
            due_date: `${month}-10`,
            status: 'Unpaid',
        }).select().single();
        if (!error && bill) bills.push(bill);
    }
    return { generated: bills.length, bills };
}

export async function getUtilityRates(locationId?: number) {
    let query = supabase.from('arms_utility_rates').select('*, arms_utility_types(utility_name, unit_of_measure), arms_locations(location_name)').eq('is_active', true);
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function addPrepaidToken(token: { tenant_id: number; unit_id: number; location_id?: number; utility_type_id: number; amount_paid: number; units_purchased: number; rate_per_unit: number; meter_number?: string; receipt_number?: string; notes?: string }) {
    const { data, error } = await supabase.from('arms_prepaid_tokens').insert(token).select().single();
    if (error) throw error;
    return data;
}

export async function getPrepaidTokens(filters?: { tenantId?: number; locationId?: number }) {
    let query = supabase.from('arms_prepaid_tokens').select('*, arms_tenants(tenant_name, phone), arms_units(unit_name)').order('purchase_date', { ascending: false });
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// ==================== CARETAKER MANAGEMENT ====================
export async function getCaretakers(locationId?: number) {
    let query = supabase.from('arms_caretakers').select('*, arms_locations(location_name)').eq('is_active', true).order('caretaker_name');
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function addCaretaker(caretaker: { caretaker_name: string; phone: string; email?: string; id_number?: string; location_id?: number; role?: string; monthly_salary?: number; notes?: string }) {
    const { data, error } = await supabase.from('arms_caretakers').insert(caretaker).select().single();
    if (error) throw error;
    return data;
}

export async function updateCaretaker(id: number, updates: any) {
    const { data, error } = await supabase.from('arms_caretakers').update({ ...updates, updated_at: new Date().toISOString() }).eq('caretaker_id', id).select().single();
    if (error) throw error;
    return data;
}

export async function getCaretakerSalaries(filters?: { caretakerId?: number; locationId?: number; payPeriod?: string }) {
    let query = supabase.from('arms_caretaker_salaries').select('*, arms_caretakers(caretaker_name, phone, role), arms_locations(location_name)').order('payment_date', { ascending: false });
    if (filters?.caretakerId) query = query.eq('caretaker_id', filters.caretakerId);
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.payPeriod) query = query.eq('pay_period', filters.payPeriod);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function recordCaretakerSalary(salary: { caretaker_id: number; location_id?: number; pay_period: string; basic_salary?: number; allowances?: number; deductions?: number; net_pay: number; payment_method?: string; mpesa_receipt?: string; paid_by?: string; notes?: string }) {
    const { data, error } = await supabase.from('arms_caretaker_salaries').insert({ ...salary, status: 'Paid', payment_date: new Date().toISOString().split('T')[0] }).select().single();
    if (error) throw error;
    return data;
}

export async function getPettyCash(filters?: { locationId?: number; startDate?: string; endDate?: string }) {
    let query = supabase.from('arms_petty_cash').select('*, arms_locations(location_name), arms_caretakers(caretaker_name)').order('transaction_date', { ascending: false });
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.startDate) query = query.gte('transaction_date', filters.startDate);
    if (filters?.endDate) query = query.lte('transaction_date', filters.endDate);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function addPettyCash(entry: { location_id?: number; transaction_type: string; amount: number; description?: string; category?: string; receipt_number?: string; recorded_by?: string; caretaker_id?: number; notes?: string }) {
    const { data, error } = await supabase.from('arms_petty_cash').insert(entry).select().single();
    if (error) throw error;
    return data;
}

// ==================== SMS & COMMUNICATION ====================
export async function getSMSConfig() {
    const { data, error } = await supabase.from('arms_sms_config').select('*').eq('is_active', true).limit(1);
    if (error) throw error;
    return data?.[0] || null;
}

export async function updateSMSConfig(config: { api_key: string; username: string; sender_id?: string; short_code?: string; is_sandbox?: boolean }) {
    const { data: existing } = await supabase.from('arms_sms_config').select('config_id').eq('is_active', true).limit(1);
    if (existing && existing.length > 0) {
        const { data, error } = await supabase.from('arms_sms_config').update({ ...config, updated_at: new Date().toISOString() }).eq('config_id', existing[0].config_id).select().single();
        if (error) throw error;
        return data;
    }
    const { data, error } = await supabase.from('arms_sms_config').insert(config).select().single();
    if (error) throw error;
    return data;
}

export async function getWhatsAppConfig() {
    const { data, error } = await supabase.from('arms_whatsapp_config').select('*').eq('is_active', true).limit(1);
    if (error) throw error;
    return data?.[0] || null;
}

export async function updateWhatsAppConfig(config: { business_phone_number: string; access_token: string; phone_number_id?: string; business_account_id?: string; webhook_verify_token?: string; is_sandbox?: boolean }) {
    const { data: existing } = await supabase.from('arms_whatsapp_config').select('config_id').eq('is_active', true).limit(1);
    if (existing && existing.length > 0) {
        const { data, error } = await supabase.from('arms_whatsapp_config').update({ ...config, updated_at: new Date().toISOString() }).eq('config_id', existing[0].config_id).select().single();
        if (error) throw error;
        return data;
    }
    const { data, error } = await supabase.from('arms_whatsapp_config').insert(config).select().single();
    if (error) throw error;
    return data;
}

export async function getSMSLogs(filters?: { tenantId?: number; locationId?: number; messageType?: string; limit?: number }) {
    let query = supabase.from('arms_sms_logs').select('*, arms_tenants(tenant_name, phone), arms_locations(location_name)').order('created_at', { ascending: false });
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.messageType) query = query.eq('message_type', filters.messageType);
    if (filters?.limit) query = query.limit(filters.limit);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function logSMS(sms: { recipient_phone: string; recipient_name?: string; message: string; message_type?: string; tenant_id?: number; location_id?: number; provider?: string; status?: string; cost?: number; sent_by?: string }) {
    const { data, error } = await supabase.from('arms_sms_logs').insert(sms).select().single();
    if (error) throw error;
    return data;
}

export async function getReminderRules(locationId?: number) {
    let query = supabase.from('arms_reminder_rules').select('*').order('days_offset');
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function addReminderRule(rule: { rule_name: string; trigger_type: string; days_offset?: number; message_template: string; location_id?: number }) {
    const { data, error } = await supabase.from('arms_reminder_rules').insert(rule).select().single();
    if (error) throw error;
    return data;
}

export async function updateReminderRule(id: number, updates: any) {
    const { data, error } = await supabase.from('arms_reminder_rules').update(updates).eq('rule_id', id).select().single();
    if (error) throw error;
    return data;
}

// ==================== DEMAND LETTERS ====================
export async function getDemandLetters(filters?: { tenantId?: number; locationId?: number; letterType?: string; status?: string }) {
    let query = supabase.from('arms_demand_letters').select('*, arms_tenants(tenant_name, phone, balance, arms_units(unit_name)), arms_locations(location_name), arms_units(unit_name)').order('issued_date', { ascending: false });
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.letterType) query = query.eq('letter_type', filters.letterType);
    if (filters?.status) query = query.eq('status', filters.status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function createDemandLetter(letter: { tenant_id: number; location_id?: number; unit_id?: number; letter_type: string; subject: string; body: string; amount_owed?: number; deadline_date?: string; delivery_method?: string; issued_by?: string }) {
    const { data, error } = await supabase.from('arms_demand_letters').insert({ ...letter, status: 'Issued' }).select().single();
    if (error) throw error;
    return data;
}

export async function updateDemandLetter(id: number, updates: any) {
    const { data, error } = await supabase.from('arms_demand_letters').update({ ...updates, updated_at: new Date().toISOString() }).eq('letter_id', id).select().single();
    if (error) throw error;
    return data;
}

// ==================== CHECKLISTS ====================
export async function getChecklists(filters?: { tenantId?: number; unitId?: number; checklistType?: string }) {
    let query = supabase.from('arms_checklists').select('*, arms_tenants(tenant_name), arms_units(unit_name), arms_locations(location_name)').order('checklist_date', { ascending: false });
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    if (filters?.unitId) query = query.eq('unit_id', filters.unitId);
    if (filters?.checklistType) query = query.eq('checklist_type', filters.checklistType);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function getChecklistTemplates(type?: string) {
    let query = supabase.from('arms_checklist_templates').select('*').eq('is_active', true).order('sort_order');
    if (type) query = query.eq('template_type', type);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function createChecklist(checklist: { checklist_type: string; tenant_id: number; unit_id: number; location_id?: number; overall_condition?: string; notes?: string; completed_by?: string; items: { item_name: string; category?: string; condition?: string; notes?: string }[] }) {
    const { items, ...checklistData } = checklist;
    const { data: created, error } = await supabase.from('arms_checklists').insert(checklistData).select().single();
    if (error) throw error;
    if (items && items.length > 0) {
        await supabase.from('arms_checklist_items').insert(items.map(item => ({ ...item, checklist_id: created.checklist_id })));
    }
    return created;
}

export async function getChecklistItems(checklistId: number) {
    const { data, error } = await supabase.from('arms_checklist_items').select('*').eq('checklist_id', checklistId);
    if (error) throw error;
    return data || [];
}

export async function updateChecklistItem(id: number, updates: any) {
    const { data, error } = await supabase.from('arms_checklist_items').update(updates).eq('item_id', id).select().single();
    if (error) throw error;
    return data;
}

export async function completeChecklist(id: number, completedBy: string) {
    const { data, error } = await supabase.from('arms_checklists').update({ is_completed: true, completed_by: completedBy }).eq('checklist_id', id).select().single();
    if (error) throw error;
    return data;
}

// ==================== TENANT ISSUES ====================
export async function getTenantIssues(filters?: { tenantId?: number; locationId?: number; status?: string; issueType?: string }) {
    let query = supabase.from('arms_tenant_issues').select('*, arms_tenants(tenant_name, phone), arms_units(unit_name), arms_locations(location_name)').order('reported_at', { ascending: false });
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.issueType) query = query.eq('issue_type', filters.issueType);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function createTenantIssue(issue: { tenant_id: number; unit_id?: number; location_id?: number; issue_type: string; subject: string; description: string; priority?: string; photo_url?: string }) {
    const { data, error } = await supabase.from('arms_tenant_issues').insert(issue).select().single();
    if (error) throw error;
    return data;
}

export async function updateTenantIssue(id: number, updates: any) {
    const { data, error } = await supabase.from('arms_tenant_issues').update({ ...updates, updated_at: new Date().toISOString() }).eq('issue_id', id).select().single();
    if (error) throw error;
    return data;
}

// ==================== ACCESS CONTROL ====================
export async function getRolePermissions() {
    const { data, error } = await supabase.from('arms_role_permissions').select('*').order('role_name');
    if (error) throw error;
    return data || [];
}

export async function updateRolePermissions(roleName: string, updates: any) {
    const { data, error } = await supabase.from('arms_role_permissions').update(updates).eq('role_name', roleName).select().single();
    if (error) throw error;
    return data;
}

export async function getUserPermissions(userId: number) {
    const { data: user, error } = await supabase.from('arms_users').select('user_role, allowed_location_ids').eq('user_id', userId).single();
    if (error || !user) return null;
    const { data: role } = await supabase.from('arms_role_permissions').select('*').eq('role_name', user.user_role || 'admin').single();
    return { ...role, allowed_location_ids: user.allowed_location_ids || [] };
}

// ==================== PORTAL USERS ====================
export async function createPortalUser(portalUser: { tenant_id: number; username: string; password_hash: string }) {
    const { data, error } = await supabase.from('arms_portal_users').insert(portalUser).select().single();
    if (error) throw error;
    return data;
}

export async function loginPortalUser(username: string, password: string) {
    const { data, error } = await supabase.from('arms_portal_users').select('*, arms_tenants(*)').eq('username', username).eq('is_active', true).single();
    if (error || !data) return null;
    if (data.password_hash === password) {
        await supabase.from('arms_portal_users').update({ last_login: new Date().toISOString(), login_count: (data.login_count || 0) + 1 }).eq('portal_user_id', data.portal_user_id);
        return data;
    }
    return null;
}

// ==================== ADVANCED ANALYTICS ====================
export async function getProfitAndLoss(locationId?: number, months: number = 12) {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - months + 1, 1).toISOString().slice(0, 7);

    // Revenue
    let revQuery = supabase.from('arms_payments').select('amount, payment_date, location_id').gte('payment_date', `${startMonth}-01`);
    if (locationId) revQuery = revQuery.eq('location_id', locationId);
    const { data: payments } = await revQuery;

    // Expenses
    let expQuery = supabase.from('arms_expenses').select('amount, expense_date, category, location_id').gte('expense_date', `${startMonth}-01`);
    if (locationId) expQuery = expQuery.eq('location_id', locationId);
    const { data: expenses } = await expQuery;

    const monthlyPnL: Record<string, { revenue: number; expenses: number; profit: number; expenseBreakdown: Record<string, number> }> = {};

    (payments || []).forEach(p => {
        const m = p.payment_date?.slice(0, 7);
        if (!m) return;
        if (!monthlyPnL[m]) monthlyPnL[m] = { revenue: 0, expenses: 0, profit: 0, expenseBreakdown: {} };
        monthlyPnL[m].revenue += p.amount || 0;
    });

    (expenses || []).forEach(e => {
        const m = e.expense_date?.slice(0, 7);
        if (!m) return;
        if (!monthlyPnL[m]) monthlyPnL[m] = { revenue: 0, expenses: 0, profit: 0, expenseBreakdown: {} };
        monthlyPnL[m].expenses += e.amount || 0;
        monthlyPnL[m].expenseBreakdown[e.category] = (monthlyPnL[m].expenseBreakdown[e.category] || 0) + (e.amount || 0);
    });

    Object.keys(monthlyPnL).forEach(m => {
        monthlyPnL[m].profit = monthlyPnL[m].revenue - monthlyPnL[m].expenses;
    });

    const totalRevenue = Object.values(monthlyPnL).reduce((s, v) => s + v.revenue, 0);
    const totalExpenses = Object.values(monthlyPnL).reduce((s, v) => s + v.expenses, 0);

    return { monthly: monthlyPnL, totalRevenue, totalExpenses, totalProfit: totalRevenue - totalExpenses };
}

export async function getCashFlowStatement(locationId?: number, months: number = 12) {
    const pnl = await getProfitAndLoss(locationId, months);
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - months + 1, 1).toISOString().slice(0, 7);

    // Operating activities
    let revQuery = supabase.from('arms_payments').select('amount, payment_method, payment_date').gte('payment_date', `${startMonth}-01`);
    if (locationId) revQuery = revQuery.eq('location_id', locationId);
    const { data: payments } = await revQuery;

    const cashInflows = (payments || []).filter(p => p.payment_method === 'Cash').reduce((s, p) => s + (p.amount || 0), 0);
    const mpesaInflows = (payments || []).filter(p => p.payment_method === 'M-Pesa').reduce((s, p) => s + (p.amount || 0), 0);

    // Outstanding receivables
    let billQ = supabase.from('arms_billing').select('balance').gt('balance', 0);
    if (locationId) billQ = billQ.eq('location_id', locationId);
    const { data: unpaidBills } = await billQ;
    const outstandingReceivables = (unpaidBills || []).reduce((s, b) => s + (b.balance || 0), 0);

    return {
        ...pnl,
        cashInflows,
        mpesaInflows,
        totalInflows: cashInflows + mpesaInflows,
        outstandingReceivables,
        netCashFromOps: pnl.totalRevenue - pnl.totalExpenses,
    };
}

export async function getOccupancyAndROI(locationId?: number) {
    let unitQuery = supabase.from('arms_units').select('*').eq('active', true);
    if (locationId) unitQuery = unitQuery.eq('location_id', locationId);
    const { data: units } = await unitQuery;

    let tenantQuery = supabase.from('arms_tenants').select('*').eq('status', 'Active');
    if (locationId) tenantQuery = tenantQuery.eq('location_id', locationId);
    const { data: tenants } = await tenantQuery;

    const totalUnits = units?.length || 0;
    const occupiedUnits = units?.filter(u => u.status === 'Occupied').length || 0;
    const vacantUnits = totalUnits - occupiedUnits;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    const totalMonthlyRent = (tenants || []).reduce((s, t) => s + (t.monthly_rent || 0), 0);
    const vacancyCost = (units || []).filter(u => u.status === 'Vacant').reduce((s, u) => s + (u.monthly_rent || 0), 0);

    // Annual ROI calculation
    const annualRevenue = totalMonthlyRent * 12;
    let expQuery = supabase.from('arms_expenses').select('amount');
    if (locationId) expQuery = expQuery.eq('location_id', locationId);
    const { data: expenses } = await expQuery;
    const annualExpenses = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0) * 12; // rough annualized

    // Per-location ROI
    const locationROI: Record<string, { revenue: number; vacancyCost: number; units: number; occupied: number }> = {};
    (units || []).forEach(u => {
        const locName = u.arms_locations?.location_name || 'Unknown';
        if (!locationROI[locName]) locationROI[locName] = { revenue: 0, vacancyCost: 0, units: 0, occupied: 0 };
        locationROI[locName].units++;
        if (u.status === 'Occupied') {
            locationROI[locName].occupied++;
            locationROI[locName].revenue += u.monthly_rent || 0;
        } else {
            locationROI[locName].vacancyCost += u.monthly_rent || 0;
        }
    });

    return {
        totalUnits, occupiedUnits, vacantUnits, occupancyRate,
        totalMonthlyRent, vacancyCost, annualRevenue,
        roi: annualRevenue > 0 ? Math.round(((annualRevenue - annualExpenses) / annualRevenue) * 100) : 0,
        locationROI,
    };
}
