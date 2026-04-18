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
    deposit_paid?: number; move_in_date?: string; notes?: string;
    emergency_contact?: string; emergency_phone?: string;
}) {
    const { data, error } = await supabase.from('arms_tenants').insert([{ ...tenant, status: 'Active' }]).select().single();
    if (error) throw error;
    // Mark unit as Occupied
    await supabase.from('arms_units').update({ status: 'Occupied' }).eq('unit_id', tenant.unit_id);
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

export async function generateMonthlyBills(month: string, locationId?: number) {
    // Get all active tenants, optionally filtered by location
    let query = supabase.from('arms_tenants').select('*').eq('status', 'Active');
    if (locationId) query = query.eq('location_id', locationId);
    const { data: tenants, error } = await query;
    if (error) throw error;
    if (!tenants || tenants.length === 0) return [];

    const bills: any[] = [];
    for (const tenant of tenants) {
        // Check if bill already exists for this month
        const { data: existing } = await supabase
            .from('arms_billing')
            .select('billing_id')
            .eq('tenant_id', tenant.tenant_id)
            .eq('billing_month', month)
            .single();

        if (!existing) {
            const billingDate = `${month}-01`;
            const dueDate = `${month}-05`;
            const bill = {
                tenant_id: tenant.tenant_id,
                location_id: tenant.location_id,
                unit_id: tenant.unit_id,
                billing_month: month,
                billing_date: billingDate,
                due_date: dueDate,
                rent_amount: tenant.monthly_rent,
                balance: tenant.monthly_rent,
                status: 'Unpaid'
            };
            const { data, error: insertErr } = await supabase.from('arms_billing').insert([bill]).select().single();
            if (!insertErr && data) bills.push(data);

            // Update tenant balance
            await supabase.from('arms_tenants').update({
                balance: (tenant.balance || 0) + tenant.monthly_rent,
                updated_at: new Date().toISOString()
            }).eq('tenant_id', tenant.tenant_id);
        }
    }
    return bills;
}

// ==================== PAYMENTS ====================
export async function getPayments(filters?: { locationId?: number; tenantId?: number; startDate?: string; endDate?: string; method?: string }) {
    let query = supabase.from('arms_payments').select('*, arms_tenants(tenant_name, phone), arms_locations(location_name)').order('payment_date', { ascending: false });
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);
    if (filters?.method) query = query.eq('payment_method', filters.method);
    if (filters?.startDate) query = query.gte('payment_date', filters.startDate);
    if (filters?.endDate) query = query.lte('payment_date', filters.endDate);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function recordPayment(payment: {
    tenant_id: number; amount: number; payment_method: string;
    mpesa_receipt?: string; mpesa_phone?: string; reference_no?: string;
    recorded_by?: string; notes?: string; location_id?: number;
}) {
    // Get tenant info
    const { data: tenant } = await supabase.from('arms_tenants').select('*').eq('tenant_id', payment.tenant_id).single();
    if (!tenant) throw new Error('Tenant not found');

    // Get unpaid bills sorted by oldest first (FIFO)
    const { data: unpaidBills } = await supabase
        .from('arms_billing')
        .select('*')
        .eq('tenant_id', payment.tenant_id)
        .gt('balance', 0)
        .order('billing_date', { ascending: true });

    let remainingAmount = payment.amount;
    const allocations: { billingId: number; amount: number }[] = [];

    // Allocate payment to oldest bills first
    if (unpaidBills) {
        for (const bill of unpaidBills) {
            if (remainingAmount <= 0) break;
            const allocAmount = Math.min(remainingAmount, bill.balance);
            allocations.push({ billingId: bill.billing_id, amount: allocAmount });
            remainingAmount -= allocAmount;
        }
    }

    // Record the payment (link to first bill if applicable)
    const { data: paymentRecord, error: payError } = await supabase.from('arms_payments').insert([{
        tenant_id: payment.tenant_id,
        billing_id: allocations.length > 0 ? allocations[0].billingId : null,
        location_id: payment.location_id || tenant.location_id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        mpesa_receipt: payment.mpesa_receipt,
        mpesa_phone: payment.mpesa_phone,
        reference_no: payment.reference_no,
        recorded_by: payment.recorded_by,
        notes: payment.notes,
        payment_date: new Date().toISOString()
    }]).select().single();
    if (payError) throw payError;

    // Update each bill allocation
    for (const alloc of allocations) {
        const bill = unpaidBills?.find(b => b.billing_id === alloc.billingId);
        if (bill) {
            const newAmountPaid = (bill.amount_paid || 0) + alloc.amount;
            const newBalance = bill.rent_amount - newAmountPaid;
            const newStatus = newBalance <= 0 ? 'Paid' : newAmountPaid > 0 ? 'Partial' : 'Unpaid';
            await supabase.from('arms_billing').update({
                amount_paid: newAmountPaid,
                balance: Math.max(0, newBalance),
                status: newStatus,
                updated_at: new Date().toISOString()
            }).eq('billing_id', alloc.billingId);
        }
    }

    // Update tenant balance
    const newTenantBalance = Math.max(0, (tenant.balance || 0) - payment.amount);
    await supabase.from('arms_tenants').update({
        balance: newTenantBalance,
        updated_at: new Date().toISOString()
    }).eq('tenant_id', payment.tenant_id);

    return paymentRecord;
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
    let billQuery = supabase.from('arms_billing').select('*').eq('billing_month', currentMonth);
    if (locationId) billQuery = billQuery.eq('location_id', locationId);
    const { data: bills } = await billQuery;

    let paymentQuery = supabase.from('arms_payments').select('amount').gte('payment_date', `${currentMonth}-01`);
    if (locationId) paymentQuery = paymentQuery.eq('location_id', locationId);
    const { data: payments } = await paymentQuery;

    const monthlyCollected = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const monthlyBilled = bills?.reduce((sum, b) => sum + (b.rent_amount || 0), 0) || 0;
    const collectionRate = monthlyBilled > 0 ? Math.round((monthlyCollected / monthlyBilled) * 100) : 0;

    return { ...summary, monthlyCollected, monthlyBilled, collectionRate };
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
