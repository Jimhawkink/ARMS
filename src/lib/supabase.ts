import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS TENANT MOBILE APP — SUPABASE CONFIGURATION
// Same Supabase instance as the ARMS web app
// ============================================================

const SUPABASE_URL = 'https://zkamuhvrmazozhudbtuw.supabase.co';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprYW11aHZybWF6b3podWRidHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDE3OTYsImV4cCI6MjA5OTgxNzc5Nn0.Y6gkKQDWuLxcmhlYTZvKase7MzDO_Ehymitef6OE5JU';

// M-Pesa STK Push — uses the ARMS web app API (Vercel-hosted Next.js)
// Credentials are resolved per-unit from arms_unit_mpesa_config on the server
const ARMS_API_URL = 'https://arms-opal.vercel.app/api';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// TYPES
// ============================================================

export interface TenantSession {
    tenant_id: number;
    tenant_name: string;
    phone: string;
    id_number: string;
    unit_name: string;
    unit_id: number;
    location_name: string;
    location_id: number;
    monthly_rent: number;
    deposit_paid: number;
    move_in_date: string;
    balance: number;
    email: string;
    loggedInAt: number; // timestamp ms
}

export interface BillingRecord {
    billing_id: number | null;
    tenant_id: number;
    billing_month: string; // "YYYY-MM"
    billing_date: string;
    due_date: string;
    rent_amount: number;
    amount_paid: number;
    balance: number;
    status: string; // 'Paid' | 'Partial' | 'Unpaid' | 'Unbilled'
    _virtual?: boolean;
}

export interface PaymentRecord {
    payment_id: number;
    tenant_id: number;
    billing_id: number | null;
    amount: number;
    payment_method: string;
    mpesa_receipt: string | null;
    mpesa_phone: string | null;
    reference_no: string | null;
    notes: string | null;
    payment_date: string;
    created_at: string;
    billing_month?: string; // parsed from notes or billing join
}

export interface STKResult {
    success: boolean;
    checkoutRequestId?: string;
    mpesaReceipt?: string;
    error?: string;
}

// ============================================================
// AUTH — PIN LOGIN
// Fetch active tenants and match PIN locally (avoid exposing PIN in query params)
// ============================================================

export async function loginTenantByPin(pin: string): Promise<TenantSession | null> {
    try {
        // Fetch all active tenants with unit + location join
        const { data, error } = await supabase
            .from('arms_tenants')
            .select(`
                tenant_id, tenant_name, phone, id_number, email,
                unit_id, location_id, monthly_rent, deposit_paid,
                move_in_date, balance, mobile_pin,
                arms_units(unit_name),
                arms_locations(location_name)
            `)
            .eq('status', 'Active');

        if (error) {
            console.error('ARMS login fetch error:', error.message);
            return null;
        }

        if (!data || data.length === 0) return null;

        // Match PIN (string comparison to avoid type mismatch)
        const pinStr = String(pin).trim();
        const matched = data.find(
            (t: any) => t.mobile_pin && String(t.mobile_pin).trim() === pinStr
        );

        if (!matched) return null;

        return {
            tenant_id: matched.tenant_id,
            tenant_name: matched.tenant_name,
            phone: matched.phone || '',
            id_number: matched.id_number || '',
            email: matched.email || '',
            unit_id: matched.unit_id,
            unit_name: (matched as any).arms_units?.unit_name || 'N/A',
            location_id: matched.location_id,
            location_name: (matched as any).arms_locations?.location_name || 'N/A',
            monthly_rent: matched.monthly_rent || 0,
            deposit_paid: matched.deposit_paid || 0,
            move_in_date: matched.move_in_date || '',
            balance: matched.balance || 0,
            loggedInAt: Date.now(),
        };
    } catch (err: any) {
        console.error('loginTenantByPin exception:', err);
        return null;
    }
}

// ============================================================
// VACATION HELPERS (matches web app logic exactly)
// ============================================================

const VACATION_MONTHS = ['05', '06', '07', '08']; // May, Jun, Jul, Aug

function isVacationMonth(month: string): boolean {
    const mm = month.slice(5, 7);
    return VACATION_MONTHS.includes(mm);
}

function getEffectiveRent(monthlyRent: number, month: string, isOnVacation: boolean): number {
    if (isOnVacation && isVacationMonth(month)) {
        return Math.round(monthlyRent * 0.5 * 100) / 100;
    }
    return monthlyRent;
}

// ============================================================
// BILLING — Get tenant's billing records (unpaid + all)
// Generates virtual "Unbilled" entries for months with no DB record,
// matching the web app behaviour exactly.
// ============================================================

export async function getTenantBilling(tenantId: number): Promise<BillingRecord[]> {
    try {
        const { data, error } = await supabase
            .from('arms_billing')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('billing_date', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (err: any) {
        console.error('getTenantBilling error:', err.message);
        return [];
    }
}

// Returns all unpaid bills (DB records) + virtual unbilled months
export async function getUnpaidBilling(tenantId: number): Promise<BillingRecord[]> {
    try {
        // Fetch tenant info (rent, move-in, vacation status)
        const { data: tenant } = await supabase
            .from('arms_tenants')
            .select('monthly_rent, move_in_date, is_on_vacation')
            .eq('tenant_id', tenantId)
            .single();

        const monthlyRent = tenant?.monthly_rent || 0;
        const isOnVacation = !!(tenant as any)?.is_on_vacation;
        const moveIn = tenant?.move_in_date || null;

        // Fetch all existing billing records
        const { data: allBills, error } = await supabase
            .from('arms_billing')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('billing_date', { ascending: true });

        if (error) throw error;

        const existingSet = new Set((allBills || []).map((b: any) => b.billing_month));
        const currentMonth = new Date().toISOString().slice(0, 7);
        const earliestMonth = moveIn ? moveIn.slice(0, 7) : currentMonth;

        // Generate virtual "Unbilled" entries for months missing in DB
        const virtualBills: BillingRecord[] = [];
        let cursor = new Date(earliestMonth + '-01');
        const end = new Date(currentMonth + '-01');

        while (cursor <= end) {
            const m = cursor.toISOString().slice(0, 7);
            if (!existingSet.has(m)) {
                const effectiveRent = getEffectiveRent(monthlyRent, m, isOnVacation);
                virtualBills.push({
                    billing_id: null,
                    tenant_id: tenantId,
                    billing_month: m,
                    billing_date: `${m}-01`,
                    due_date: `${m}-05`,
                    rent_amount: effectiveRent,
                    amount_paid: 0,
                    balance: effectiveRent,
                    status: 'Unbilled',
                    _virtual: true,
                });
            }
            cursor.setMonth(cursor.getMonth() + 1);
        }

        // Filter existing to only unpaid, then combine with virtual
        const unpaidExisting = (allBills || []).filter((b: any) => b.status !== 'Paid');
        const combined = [...unpaidExisting, ...virtualBills];
        combined.sort((a, b) => a.billing_month.localeCompare(b.billing_month));

        return combined;
    } catch (err: any) {
        console.error('getUnpaidBilling error:', err.message);
        return [];
    }
}

// Get the TRUE total balance = sum of all unpaid (real + virtual) bills
export async function getTrueTotalBalance(tenantId: number): Promise<{ total: number; effectiveRent: number }> {
    try {
        const unpaid = await getUnpaidBilling(tenantId);
        let total = unpaid.reduce((s, b) => s + (b.balance || 0), 0);

        // Effective rent for THIS month
        const { data: tenant } = await supabase
            .from('arms_tenants')
            .select('monthly_rent, is_on_vacation')
            .eq('tenant_id', tenantId)
            .single();
        const monthlyRent = tenant?.monthly_rent || 0;
        const isOnVacation = !!(tenant as any)?.is_on_vacation;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const effectiveRent = getEffectiveRent(monthlyRent, currentMonth, isOnVacation);

        // Subtract unallocated payments (billing_id IS NULL) — these are MPesa
        // payments not linked to any billing record (e.g. payments on unbilled months)
        const { data: unallocated } = await supabase
            .from('arms_payments')
            .select('amount')
            .eq('tenant_id', tenantId)
            .is('billing_id', null);
        const unallocSum = (unallocated || []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
        total = Math.max(0, Math.round((total - unallocSum) * 100) / 100);

        return { total, effectiveRent };
    } catch {
        return { total: 0, effectiveRent: 0 };
    }
}



// ============================================================
// PAYMENTS — Get tenant's payment history
// ============================================================

export async function getTenantPayments(tenantId: number): Promise<PaymentRecord[]> {
    try {
        const { data, error } = await supabase
            .from('arms_payments')
            .select('*, arms_billing(billing_month)')
            .eq('tenant_id', tenantId)
            .order('payment_date', { ascending: false });

        if (error) throw error;

        return (data || []).map((p: any) => ({
            ...p,
            billing_month: p.arms_billing?.billing_month || extractBillingMonth(p.notes),
        }));
    } catch (err: any) {
        console.error('getTenantPayments error:', err.message);
        return [];
    }
}

// Helper — extract billing month from notes if direct join is unavailable
function extractBillingMonth(notes: string | null): string {
    if (!notes) return '';
    const m = notes.match(/(\d{4}-\d{2})/);
    return m ? m[1] : '';
}

// ============================================================
// TENANT BALANCE — Refresh true total balance (real + virtual bills)
// ============================================================

export async function refreshTenantBalance(tenantId: number): Promise<number> {
    try {
        const { total } = await getTrueTotalBalance(tenantId);
        return total;
    } catch {
        try {
            const { data } = await supabase
                .from('arms_tenants')
                .select('balance')
                .eq('tenant_id', tenantId)
                .single();
            return data?.balance || 0;
        } catch {
            return 0;
        }
    }
}
// ============================================================
// GET LATEST PAYMENT — Fetch most recent completed payment for tenant
// Used to recover M-Pesa receipt + amount after STK timeout
// ============================================================

export async function getLatestPayment(tenantId: number): Promise<{
    mpesa_receipt: string;
    amount: number;
    payment_date: string;
} | null> {
    try {
        const { data, error } = await supabase
            .from('arms_payments')
            .select('mpesa_receipt, amount, payment_date')
            .eq('tenant_id', tenantId)
            .order('payment_date', { ascending: false })
            .limit(1)
            .single();
        if (error || !data) return null;
        return {
            mpesa_receipt: data.mpesa_receipt || 'MPesa',
            amount: data.amount || 0,
            payment_date: data.payment_date || '',
        };
    } catch {
        return null;
    }
}

// ============================================================
// MPESA STK PUSH — Initiate payment
// payerPhone: the phone that receives the STK prompt (may differ from tenant)
// tenantPhone: the tenant's registered phone (for account reference)
// ============================================================

export async function initiateSTKPush(params: {
    payerPhone: string;
    amount: number;
    tenantId: number;
    tenantPhone: string;
    description: string;
}): Promise<{ checkoutRequestId: string | null; error: string | null; tillNotConfigured?: boolean }> {
    try {
        // Normalize phone to 254XXXXXXXXX format
        const normalized = normalizePhone(params.payerPhone);
        if (!normalized) {
            return { checkoutRequestId: null, error: 'Invalid phone number format' };
        }

        // Convert to 07xx format for the API (it normalizes internally)
        const phoneFor07 = '0' + normalized.slice(3);

        const payload = {
            phone: phoneFor07,
            amount: Math.round(params.amount),
            accountReference: `ARMS-${params.tenantId}`,
            transactionDesc: params.description || 'Rent Payment',
            tenantId: params.tenantId,
        };

        console.log('🚀 Initiating STK Push via ARMS API:', payload);

        const response = await fetch(`${ARMS_API_URL}/mpesa/stk-push`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log('STK Push response:', result);

        if (!response.ok) {
            // ── CRITICAL: Detect "till not configured" for this unit's location ──
            // This means the location has no M-Pesa till linked. We must BLOCK
            // and NEVER fall back to another location's till (different bank account!)
            if (result.tillNotConfigured) {
                return {
                    checkoutRequestId: null,
                    tillNotConfigured: true,
                    error: '⚠️ M-Pesa Till Not Configured\n\nYour unit\'s location does not have a payment till set up yet. Please contact your landlord to configure the till in Settings → Unit Tills.',
                };
            }
            return { checkoutRequestId: null, error: result.error || result.message || 'STK Push failed' };
        }

        // Safaricom returns ResponseCode "0" on success
        if (result.ResponseCode && result.ResponseCode !== '0') {
            return { checkoutRequestId: null, error: result.ResponseDescription || result.errorMessage || 'STK Push rejected' };
        }

        const checkoutRequestId =
            result.CheckoutRequestID ||
            result.checkoutRequestId ||
            result.checkout_request_id ||
            null;

        return { checkoutRequestId, error: null };
    } catch (err: any) {
        console.error('initiateSTKPush error:', err.message);
        return { checkoutRequestId: null, error: 'Network error — please try again' };
    }
}

// ============================================================
// POLL STK RESULT — Poll backend API + Realtime on arms_stk_requests
// The STK callback updates arms_stk_requests with receipt & status.
// We poll the backend API (which uses service role key) to bypass RLS.
// Also listen via Supabase Realtime on arms_stk_requests UPDATE events.
// ============================================================

export function pollSTKResult(params: {
    checkoutRequestId: string;
    timeoutMs: number;
    onConfirmed: (receipt: string, amount: number) => void;
    onFailed: (reason: string) => void;
    onTimeout: () => void;
}): () => void {
    let done = false;

    const markDone = () => {
        if (done) return false;
        done = true;
        return true;
    };

    // ── Final DB check before declaring timeout ──────────────────────────
    // Safaricom's callback can arrive AFTER the UI timeout. Payment is already
    // recorded in DB and web app. We do one last check so the app correctly
    // shows success instead of falsely showing "timeout/failed".
    const doFinalCheck = async (): Promise<boolean> => {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch(
                `${ARMS_API_URL}/mpesa/stk-status?checkoutRequestId=${encodeURIComponent(params.checkoutRequestId)}`,
                { method: 'GET', headers: { 'Accept': 'application/json' }, signal: ctrl.signal }
            );
            clearTimeout(t);
            if (!res.ok) return false;
            const data = await res.json();
            if (data?.status === 'Completed') {
                params.onConfirmed(data.mpesaReceipt || 'MPesa', data.amountPaid || 0);
                return true;
            }
        } catch (_) { /* ignore */ }
        return false;
    };

    // Timeout handler — always do a final check first
    const timer = setTimeout(async () => {
        clearInterval(pollInterval);
        channel.unsubscribe();
        if (done) return;
        // CRITICAL: check DB one last time — payment may have confirmed
        // after our polling window expired but before we declared timeout
        const confirmedLate = await doFinalCheck();
        if (!confirmedLate && markDone()) {
            params.onTimeout();
        }
    }, params.timeoutMs);

    // ── Supabase Realtime: listen for UPDATE on arms_stk_requests ──
    // When the STK callback updates the record status to 'Completed',
    // we detect it instantly via Realtime (faster than polling).
    const channel = supabase
        .channel(`stk-result-${params.checkoutRequestId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'arms_stk_requests',
                filter: `checkout_request_id=eq.${params.checkoutRequestId}`,
            },
            (payload: any) => {
                const row = payload.new;
                if (!row) return;

                if (row.status === 'Completed' && markDone()) {
                    clearTimeout(timer);
                    clearInterval(pollInterval);
                    channel.unsubscribe();
                    params.onConfirmed(
                        row.mpesa_receipt || 'MPesa',
                        row.amount_paid || 0
                    );
                } else if ((row.status === 'Failed' || row.status === 'Cancelled') && markDone()) {
                    clearTimeout(timer);
                    clearInterval(pollInterval);
                    channel.unsubscribe();
                    params.onFailed(row.result_desc || 'Payment was cancelled');
                }
            }
        )
        .subscribe();

    // ── Poll backend API every 2 seconds ──
    // Uses /api/mpesa/stk-status which reads DB with service role key
    let pollCount = 0;
    const pollInterval = setInterval(async () => {
        if (done) { clearInterval(pollInterval); return; }
        pollCount++;

        try {
            const res = await fetch(
                `${ARMS_API_URL}/mpesa/stk-status?checkoutRequestId=${encodeURIComponent(params.checkoutRequestId)}`,
                { method: 'GET', headers: { 'Accept': 'application/json' } }
            );

            if (!res.ok) return; // Server error, keep polling

            const data = await res.json();

            if (!data || data.status === 'Pending') {
                // Callback hasn't arrived yet, keep polling
                return;
            }

            if (data.status === 'Completed' && !done) {
                if (markDone()) {
                    clearInterval(pollInterval);
                    clearTimeout(timer);
                    channel.unsubscribe();
                    params.onConfirmed(
                        data.mpesaReceipt || 'MPesa',
                        data.amountPaid || 0
                    );
                }
            } else if ((data.status === 'Failed' || data.status === 'Cancelled') && !done) {
                if (markDone()) {
                    clearInterval(pollInterval);
                    clearTimeout(timer);
                    channel.unsubscribe();
                    params.onFailed(data.resultDesc || 'Payment was cancelled');
                }
            }
        } catch (_) { /* ignore polling errors, keep trying */ }

        if (pollCount >= 10) { // 20s max polling (2s × 10)
            clearInterval(pollInterval);
        }
    }, 2000);

    // Return cleanup function
    return () => {
        done = true;
        clearTimeout(timer);
        clearInterval(pollInterval);
        channel.unsubscribe();
    };
}

// ============================================================
// RECORD PAYMENT — After confirmed STK push
// CRITICAL: tenant_id is always the logged-in tenant, NOT payer
// ============================================================

export async function recordTenantPayment(params: {
    tenantId: number;
    locationId: number;
    amount: number;
    mpesaReceipt: string;
    payerPhone: string;       // may differ from tenant phone
    checkoutRequestId: string;
    billingMonth: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const paymentAmount = Math.round(params.amount * 100) / 100;

        // 1. Ensure all missing billing records exist (auto-generate)
        await ensureBillingRecords(params.tenantId);

        // 2. Fetch oldest unpaid bills (FIFO)
        const { data: bills, error: billsErr } = await supabase
            .from('arms_billing')
            .select('*')
            .eq('tenant_id', params.tenantId)
            .gt('balance', 0)
            .order('billing_date', { ascending: true });

        if (billsErr) throw billsErr;

        // 3. FIFO allocation
        let remaining = paymentAmount;
        const allocations: any[] = [];
        for (const bill of (bills || [])) {
            if (remaining <= 0) break;
            const billBalance = Math.round((bill.balance || 0) * 100) / 100;
            if (billBalance <= 0) continue;
            const allocAmount = Math.min(remaining, billBalance);
            const newPaid = Math.round(((bill.amount_paid || 0) + allocAmount) * 100) / 100;
            const newBal = Math.max(0, Math.round((bill.rent_amount - newPaid) * 100) / 100);
            const newStatus = newBal <= 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';
            allocations.push({
                billingId: bill.billing_id,
                billing_month: bill.billing_month,
                allocAmount, newPaid, newBal, newStatus,
            });
            remaining = Math.round((remaining - allocAmount) * 100) / 100;
        }

        // 4. Insert payment record — check for duplicate first (server callback may have already recorded it)
        const { data: existingPayment } = await supabase
            .from('arms_payments')
            .select('payment_id, amount')
            .eq('mpesa_receipt', params.mpesaReceipt)
            .maybeSingle();

        if (existingPayment) {
            // Server-side callback already recorded this payment — just refresh balance and return success
            console.log('✅ Payment already recorded by server callback (receipt:', params.mpesaReceipt, '). Skipping duplicate insert.');
            return { success: true };
        }

        const notes = `Mobile App Payment via M-Pesa. Payer: ${params.payerPhone}. Ref: ${params.checkoutRequestId}`;
        const { data: paymentRecord, error: payErr } = await supabase
            .from('arms_payments')
            .insert([{
                tenant_id: params.tenantId,
                billing_id: allocations.length > 0 ? allocations[0].billingId : null,
                location_id: params.locationId,
                amount: paymentAmount,
                payment_method: 'M-Pesa',
                mpesa_receipt: params.mpesaReceipt,
                mpesa_phone: params.payerPhone,
                reference_no: params.checkoutRequestId,
                recorded_by: 'Tenant Mobile App',
                notes,
                payment_date: new Date().toISOString(),
            }])
            .select()
            .single();

        if (payErr) throw payErr;

        // 5. Update billing records
        await Promise.all(
            allocations.map((alloc) =>
                supabase.from('arms_billing').update({
                    amount_paid: alloc.newPaid,
                    balance: alloc.newBal,
                    status: alloc.newStatus,
                    updated_at: new Date().toISOString(),
                }).eq('billing_id', alloc.billingId)
            )
        );

        // 6. Update tenant balance
        const { data: freshTenant } = await supabase
            .from('arms_tenants')
            .select('balance')
            .eq('tenant_id', params.tenantId)
            .single();
        const newBalance = Math.max(0, Math.round(((freshTenant?.balance || 0) - paymentAmount) * 100) / 100);
        await supabase
            .from('arms_tenants')
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq('tenant_id', params.tenantId);

        // 7. Mark mpesa_transaction as matched if found
        await supabase
            .from('arms_mpesa_transactions')
            .update({
                matched: true,
                tenant_id: params.tenantId,
                payment_id: paymentRecord.payment_id,
                matched_at: new Date().toISOString(),
            })
            .eq('trans_id', params.mpesaReceipt);

        console.log('✅ Payment recorded:', paymentRecord.payment_id, 'Balance now:', newBalance);
        return { success: true };
    } catch (err: any) {
        console.error('recordTenantPayment error:', err.message);
        return { success: false, error: err.message || 'Failed to record payment' };
    }
}


// ============================================================
// AUTO-GENERATE MISSING BILLING RECORDS
// ============================================================

async function ensureBillingRecords(tenantId: number): Promise<void> {
    try {
        const { data: tenant } = await supabase
            .from('arms_tenants')
            .select('monthly_rent, move_in_date, location_id, unit_id')
            .eq('tenant_id', tenantId)
            .single();
        if (!tenant || !tenant.monthly_rent) return;

        const currentMonth = new Date().toISOString().slice(0, 7);
        const moveIn = tenant.move_in_date;
        if (!moveIn) return;

        const earliestMonth = moveIn.slice(0, 7);
        const { data: existing } = await supabase
            .from('arms_billing')
            .select('billing_month')
            .eq('tenant_id', tenantId);
        const existingSet = new Set((existing || []).map((b: any) => b.billing_month));

        const toInsert: any[] = [];
        let cursor = new Date(earliestMonth + '-01');
        const end = new Date(currentMonth + '-01');
        while (cursor <= end) {
            const m = cursor.toISOString().slice(0, 7);
            if (!existingSet.has(m)) {
                toInsert.push({
                    tenant_id: tenantId,
                    location_id: tenant.location_id,
                    unit_id: tenant.unit_id,
                    billing_month: m,
                    billing_date: `${m}-01`,
                    due_date: `${m}-05`,
                    rent_amount: tenant.monthly_rent,
                    amount_paid: 0,
                    balance: tenant.monthly_rent,
                    status: 'Unpaid',
                });
            }
            cursor.setMonth(cursor.getMonth() + 1);
        }
        if (toInsert.length > 0) {
            await supabase.from('arms_billing').insert(toInsert);
        }
    } catch (err: any) {
        console.warn('ensureBillingRecords warning:', err.message);
    }
}

// ============================================================
// COMPANY INFO
// ============================================================

export async function getCompanyInfo(): Promise<{ name: string; phone: string }> {
    try {
        const { data } = await supabase
            .from('arms_settings')
            .select('setting_key, setting_value');
        const map: Record<string, string> = {};
        (data || []).forEach((s: any) => { map[s.setting_key] = s.setting_value; });
        return {
            name: map['company_name'] || 'Alpha Rental Management',
            phone: map['company_phone'] || '0720316175',
        };
    } catch {
        return { name: 'Alpha Rental Management', phone: '0720316175' };
    }
}

// ============================================================
// HELPERS
// ============================================================

export function normalizePhone(phone: string): string | null {
    const cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('254') && cleaned.length === 12) return cleaned;
    if (cleaned.startsWith('0') && cleaned.length === 10) return '254' + cleaned.slice(1);
    if (cleaned.startsWith('+254') && cleaned.length === 13) return cleaned.slice(1);
    return null;
}

export function maskPhone(phone: string): string {
    if (!phone || phone.length < 6) return phone;
    return phone.slice(0, 4) + '****' + phone.slice(-3);
}

export function formatKES(amount: number): string {
    return `KES ${(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatMonth(yearMonth: string): string {
    if (!yearMonth) return '';
    try {
        const d = new Date(yearMonth + '-01');
        return d.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
    } catch {
        return yearMonth;
    }
}

export function formatDateTime(iso: string): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('en-KE', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

// ============================================================
// TENANT LICENSE CHECK
// Called after successful PIN login to verify access is not revoked
// FAIL-OPEN: if API unreachable, allow login to proceed
// ============================================================

export interface LicenseCheckResult {
    licensed: boolean;
    reason?: string;
    autoLicensed?: boolean;
}

export async function checkTenantLicense(
    tenantId: number,
    phone: string
): Promise<LicenseCheckResult> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${ARMS_API_URL}/license/tenant-check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-App-Version': 'v2.2', // version gate — old APKs without this header are blocked
            },
            body: JSON.stringify({ tenantId, phone }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[License] HTTP ${res.status} — fail-open`);
            return { licensed: true };
        }

        const data = await res.json();
        return {
            licensed: data.licensed ?? true,
            reason: data.reason,
            autoLicensed: data.autoLicensed,
        };
    } catch (e) {
        console.warn('[License] Check failed (fail-open):', e);
        return { licensed: true };
    }
}

// ============================================================
// ─── NEW: STAFF TYPES & FUNCTIONS (Caretaker / Landlord) ────
// All existing tenant code above is 100% untouched
// ============================================================

export interface StaffSession {
    staff_id: number;
    staff_name: string;
    phone: string;
    role: 'caretaker' | 'landlord';
    location_id?: number | null;
    location_name?: string;
    loggedInAt: number;
}

export interface TenantSearchResult {
    tenant_id: number;
    tenant_name: string;
    phone: string;
    id_number: string;
    unit_name: string;
    location_name: string;
    location_id: number;
    monthly_rent: number;
    balance: number;
    deposit_paid: number;
    move_in_date: string;
}

export interface StatementEntry {
    type: 'billing' | 'payment';
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    status?: string;
    receipt?: string;
    month?: string;
    method?: string;
}

// ── UNIFIED STAFF LOGIN — queries arms_users.mobile_pin ────────
// Caretakers AND Landlords are BOTH in arms_users table
// user_role = 'caretaker' → caretaker session
// user_role = 'admin' | 'manager' | 'owner' | 'agent' → landlord session
// SQL to run ONCE in Supabase SQL Editor:
//   ALTER TABLE arms_users ADD COLUMN IF NOT EXISTS mobile_pin VARCHAR(10);

export async function loginStaffByPin(pin: string): Promise<StaffSession | null> {
    try {
        const { data, error } = await supabase
            .from('arms_users')
            .select('user_id, name, phone, user_role, active, mobile_pin, is_super_admin')
            .eq('active', true);

        if (error) { console.error('loginStaffByPin error:', error.message); return null; }
        if (!data || data.length === 0) return null;

        const pinStr = String(pin).trim();
        const matched = data.find((u: any) =>
            u.mobile_pin && String(u.mobile_pin).trim() === pinStr
        );
        if (!matched) return null;

        const isCaretaker = (matched.user_role || '').toLowerCase() === 'caretaker';

        return {
            staff_id: matched.user_id,
            staff_name: matched.name,
            phone: matched.phone || '',
            role: isCaretaker ? 'caretaker' : 'landlord',
            location_id: null,
            loggedInAt: Date.now(),
        };
    } catch (err: any) {
        console.error('loginStaffByPin exception:', err.message);
        return null;
    }
}

// Keep old names as aliases so existing imports don’t break
export const loginCaretakerByPin = loginStaffByPin;
export const loginLandlordByPin  = loginStaffByPin;

// ── Get All Locations (for search filter) ─────────────────────

export async function getAllLocations(): Promise<{ location_id: number; location_name: string }[]> {
    try {
        const { data, error } = await supabase
            .from('arms_locations')
            .select('location_id, location_name')
            .eq('active', true)
            .order('location_name');
        if (error || !data) return [];
        return data;
    } catch {
        return [];
    }
}

// ── Search Tenants (by name, phone, unit, location) ───────────

export async function searchTenants(
    query: string,
    locationId?: number | null
): Promise<TenantSearchResult[]> {
    try {
        let baseQuery = supabase
            .from('arms_tenants')
            .select(`
                tenant_id, tenant_name, phone, id_number, location_id,
                monthly_rent, balance, deposit_paid, move_in_date,
                arms_units(unit_name),
                arms_locations(location_name)
            `)
            .eq('status', 'Active')
            .order('tenant_name');

        const { data, error } = locationId
            ? await (baseQuery as any).eq('location_id', locationId)
            : await baseQuery;

        if (error || !data) return [];

        const searchLower = query.toLowerCase().trim();
        return (data as any[])
            .filter((t: any) => {
                if (!searchLower) return true;
                return (
                    (t.tenant_name || '').toLowerCase().includes(searchLower) ||
                    (t.phone || '').includes(searchLower) ||
                    (t.arms_units?.unit_name || '').toLowerCase().includes(searchLower) ||
                    (t.arms_locations?.location_name || '').toLowerCase().includes(searchLower) ||
                    (t.id_number || '').toLowerCase().includes(searchLower)
                );
            })
            .map((t: any) => ({
                tenant_id: t.tenant_id,
                tenant_name: t.tenant_name,
                phone: t.phone || '',
                id_number: t.id_number || '',
                unit_name: t.arms_units?.unit_name || 'N/A',
                location_name: t.arms_locations?.location_name || 'N/A',
                location_id: t.location_id,
                monthly_rent: t.monthly_rent || 0,
                balance: t.balance || 0,
                deposit_paid: t.deposit_paid || 0,
                move_in_date: t.move_in_date || '',
            }));
    } catch (err: any) {
        console.error('searchTenants error:', err.message);
        return [];
    }
}

// ── Full Tenant Statement (billing + payments timeline) ───────

export async function getTenantStatement(tenantId: number): Promise<{
    tenant: TenantSearchResult | null;
    entries: StatementEntry[];
}> {
    try {
        const [billingRes, paymentsRes, tenantRes] = await Promise.all([
            supabase
                .from('arms_billing')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('billing_date', { ascending: true }),
            supabase
                .from('arms_payments')
                .select('*, arms_billing(billing_month)')
                .eq('tenant_id', tenantId)
                .order('payment_date', { ascending: true }),
            supabase
                .from('arms_tenants')
                .select(`
                    tenant_id, tenant_name, phone, id_number, location_id,
                    monthly_rent, balance, deposit_paid, move_in_date,
                    arms_units(unit_name),
                    arms_locations(location_name)
                `)
                .eq('tenant_id', tenantId)
                .single(),
        ]);

        const entries: StatementEntry[] = [];

        // ── Real billing records (Partial / Unpaid / Paid) ───────────────
        for (const b of (billingRes.data || [])) {
            entries.push({
                type: 'billing',
                date: b.billing_date,
                description: `Rent — ${formatMonth(b.billing_month)}`,
                debit: b.rent_amount || 0,
                credit: 0,
                balance: 0,
                status: b.status,
                month: b.billing_month,
            });
        }

        // ── Virtual Unbilled months (months with no DB record yet) ────────
        // This makes Total Charged include ALL owed rent, same as tenant dashboard
        const billedMonths = new Set((billingRes.data || []).map((b: any) => b.billing_month));
        const unpaidAll = await getUnpaidBilling(tenantId);
        for (const vb of unpaidAll) {
            if ((vb as any)._virtual && !billedMonths.has(vb.billing_month)) {
                entries.push({
                    type: 'billing',
                    date: vb.billing_date,
                    description: `Rent — ${formatMonth(vb.billing_month)} (Unbilled)`,
                    debit: vb.rent_amount || 0,
                    credit: 0,
                    balance: 0,
                    status: 'Unbilled',
                    month: vb.billing_month,
                });
            }
        }

        // ── Payments ──────────────────────────────────────────────────────
        for (const p of (paymentsRes.data || [])) {
            const bMonth = (p as any).arms_billing?.billing_month || extractBillingMonth(p.notes);
            entries.push({
                type: 'payment',
                date: p.payment_date,
                description: `Payment via ${p.payment_method}`,
                debit: 0,
                credit: p.amount || 0,
                balance: 0,
                receipt: p.mpesa_receipt || p.reference_no || '',
                month: bMonth,
                method: p.payment_method,
            });
        }

        // Sort chronologically
        entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Compute running balance — every payment correctly deducted
        let running = 0;
        for (const e of entries) {
            running = running + e.debit - e.credit;
            e.balance = running;
        }


        const t = tenantRes.data as any;
        const tenant: TenantSearchResult | null = t ? {
            tenant_id: t.tenant_id,
            tenant_name: t.tenant_name,
            phone: t.phone || '',
            id_number: t.id_number || '',
            unit_name: t.arms_units?.unit_name || 'N/A',
            location_name: t.arms_locations?.location_name || 'N/A',
            location_id: t.location_id,
            monthly_rent: t.monthly_rent || 0,
            balance: t.balance || 0,
            deposit_paid: t.deposit_paid || 0,
            move_in_date: t.move_in_date || '',
        } : null;

        // Use TRUE total balance (includes virtual unbilled months) + effective rent (vacation-adjusted)
        // This matches what the tenant dashboard shows
        let trueBalance = tenant?.balance || 0;
        if (tenant) {
            try {
                const { total, effectiveRent } = await getTrueTotalBalance(tenantId);
                trueBalance = total;
                // Show effective rent (vacation-adjusted), not raw DB monthly_rent
                tenant.monthly_rent = effectiveRent || tenant.monthly_rent;
            } catch { /* keep DB values as fallback */ }
        }
        if (tenant) tenant.balance = trueBalance;

        return { tenant, entries };
    } catch (err: any) {
        console.error('getTenantStatement error:', err.message);
        return { tenant: null, entries: [] };
    }
}
