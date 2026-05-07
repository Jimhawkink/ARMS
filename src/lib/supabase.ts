import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS TENANT MOBILE APP — SUPABASE CONFIGURATION
// Same Supabase instance as the ARMS web app
// ============================================================

const SUPABASE_URL = 'https://enlqpifpxuecxxozyiak.supabase.co';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubHFwaWZweHVlY3h4b3p5aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjUzNjgsImV4cCI6MjA4MTYwMTM2OH0.-z3-2Mf3SkkZR3ZryOGyG-60jWERX9YLKIee048OziE';

// ARMS Web App API — Real M-Pesa STK Push (same credentials as web dashboard)
const ARMS_API_BASE = 'https://arms-opal.vercel.app';

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
    is_on_vacation: boolean;
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
                move_in_date, balance, mobile_pin, is_on_vacation,
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
            is_on_vacation: matched.is_on_vacation || false,
            loggedInAt: Date.now(),
        };
    } catch (err: any) {
        console.error('loginTenantByPin exception:', err);
        return null;
    }
}

// ============================================================
// BILLING — Get tenant's billing records (unpaid + all)
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

export async function getUnpaidBilling(tenantId: number): Promise<BillingRecord[]> {
    try {
        const { data, error } = await supabase
            .from('arms_billing')
            .select('*')
            .eq('tenant_id', tenantId)
            .neq('status', 'Paid')
            .order('billing_date', { ascending: true }); // oldest first

        if (error) throw error;
        return data || [];
    } catch (err: any) {
        console.error('getUnpaidBilling error:', err.message);
        return [];
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
// TENANT BALANCE — Refresh balance from DB
// ============================================================

export async function refreshTenantBalance(tenantId: number): Promise<number> {
    try {
        const { data, error } = await supabase
            .from('arms_tenants')
            .select('balance')
            .eq('tenant_id', tenantId)
            .single();
        if (error || !data) return 0;
        return data.balance || 0;
    } catch {
        return 0;
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
}): Promise<{ checkoutRequestId: string | null; error: string | null }> {
    try {
        // Normalize phone to 254XXXXXXXXX
        const normalized = normalizePhone(params.payerPhone);
        if (!normalized) {
            return { checkoutRequestId: null, error: 'Invalid phone number format' };
        }

        const payload = {
            phone: normalized,
            amount: Math.round(params.amount),
            accountReference: `ARMS-${params.tenantId}`,
            transactionDesc: params.description || 'Rent Payment',
            tenantId: params.tenantId,
        };

        console.log('🚀 Initiating STK Push via ARMS API:', payload);

        const response = await fetch(`${ARMS_API_BASE}/api/mpesa/stk-push`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log('STK Push response:', result);

        // Check for errors from the ARMS API
        if (result.error || result.missingConfig) {
            return { checkoutRequestId: null, error: result.error || 'M-Pesa not configured. Contact admin.' };
        }

        if (!response.ok) {
            return { checkoutRequestId: null, error: result.error || result.message || 'STK Push failed' };
        }

        const checkoutRequestId =
            result.CheckoutRequestID ||
            result.checkoutRequestId ||
            result.checkout_request_id ||
            null;

        if (!checkoutRequestId) {
            return { checkoutRequestId: null, error: result.errorMessage || result.CustomerMessage || 'STK Push failed — no checkout ID' };
        }

        return { checkoutRequestId, error: null };
    } catch (err: any) {
        console.error('initiateSTKPush error:', err.message);
        return { checkoutRequestId: null, error: 'Network error — please try again' };
    }
}

// ============================================================
// POLL STK RESULT — Subscribe to arms_mpesa_transactions
// Returns true if payment confirmed within timeout
// ============================================================

export function pollSTKResult(params: {
    checkoutRequestId: string;
    timeoutMs: number;
    onConfirmed: (receipt: string, amount: number) => void;
    onFailed: (reason: string) => void;
    onTimeout: () => void;
}): () => void {
    let done = false;

    // Timeout handler
    const timer = setTimeout(() => {
        if (!done) {
            done = true;
            params.onTimeout();
        }
    }, params.timeoutMs);

    // Supabase Realtime subscription on arms_stk_requests (callback updates this table)
    const channel = supabase
        .channel(`stk-result-${params.checkoutRequestId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'arms_stk_requests',
            },
            (payload: any) => {
                const row = payload.new;
                // Match by checkout_request_id
                if (row.checkout_request_id === params.checkoutRequestId && !done) {
                    if (row.status === 'Completed') {
                        done = true;
                        clearTimeout(timer);
                        channel.unsubscribe();
                        params.onConfirmed(row.mpesa_receipt || 'MPesa', row.amount_paid || 0);
                    } else if (row.status === 'Failed' || row.status === 'Cancelled') {
                        done = true;
                        clearTimeout(timer);
                        channel.unsubscribe();
                        params.onFailed(row.result_desc || 'Payment was cancelled');
                    }
                }
            }
        )
        .subscribe();

    // Also poll: check arms_stk_requests table directly + ARMS API STK query
    let pollCount = 0;
    const pollInterval = setInterval(async () => {
        if (done) { clearInterval(pollInterval); return; }
        pollCount++;

        try {
            // Method 1: Check arms_stk_requests table via Supabase
            const { data: stkRow } = await supabase
                .from('arms_stk_requests')
                .select('*')
                .eq('checkout_request_id', params.checkoutRequestId)
                .single();

            if (stkRow && !done) {
                if (stkRow.status === 'Completed') {
                    done = true;
                    clearInterval(pollInterval);
                    clearTimeout(timer);
                    channel.unsubscribe();
                    params.onConfirmed(stkRow.mpesa_receipt || 'MPesa', stkRow.amount_paid || 0);
                    return;
                } else if (stkRow.status === 'Failed' || stkRow.status === 'Cancelled') {
                    done = true;
                    clearInterval(pollInterval);
                    clearTimeout(timer);
                    channel.unsubscribe();
                    params.onFailed(stkRow.result_desc || 'Payment was cancelled');
                    return;
                }
            }
        } catch (_) { /* ignore Supabase polling errors */ }

        try {
            // Method 2: Query ARMS API STK status (Daraja STK query)
            const response = await fetch(
                `${ARMS_API_BASE}/api/mpesa/stk-push?checkoutRequestId=${encodeURIComponent(params.checkoutRequestId)}`,
                { method: 'GET' }
            );

            if (response.ok) {
                const data = await response.json();
                if (!done && data.ResultCode === '0') {
                    done = true;
                    clearInterval(pollInterval);
                    clearTimeout(timer);
                    channel.unsubscribe();
                    params.onConfirmed(data.MpesaReceiptNumber || 'MPesa', data.Amount || 0);
                } else if (!done && data.ResultCode && data.ResultCode !== '0' && data.ResultCode !== 'pending' && data.ResultCode !== '1') {
                    // ResultCode 1 = still processing, don't fail yet
                    done = true;
                    clearInterval(pollInterval);
                    clearTimeout(timer);
                    channel.unsubscribe();
                    params.onFailed(data.ResultDesc || 'Payment was cancelled');
                }
            }
        } catch (_) { /* ignore API polling errors */ }

        if (pollCount >= 15) { // 75s max polling
            clearInterval(pollInterval);
        }
    }, 5000);

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
    payerName: string;        // tenant name who the payment is for
    checkoutRequestId: string;
    billingMonth: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const currentMonth = getCurrentMonth();
        const paymentAmount = Math.round(params.amount * 100) / 100;

        // 0. Duplicate guard — check if callback already recorded this payment
        const { data: existingPayment } = await supabase
            .from('arms_payments')
            .select('payment_id')
            .eq('reference_no', params.checkoutRequestId)
            .limit(1);
        if (existingPayment && existingPayment.length > 0) {
            console.log('✅ Payment already recorded by callback, skipping duplicate:', params.checkoutRequestId);
            // Still update tenant balance in case callback didn't
            const { data: freshTenant } = await supabase
                .from('arms_tenants')
                .select('balance')
                .eq('tenant_id', params.tenantId)
                .single();
            return { success: true };
        }

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

        // 4. Insert payment record — tenant_id is ALWAYS the renter, not the payer
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
                mpesa_phone: params.payerPhone,          // who physically paid
                mpesa_name: params.payerName,             // tenant name for payer identification
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
// VACATION MONTHS (Kenyan University: May-August)
// ============================================================

const VACATION_MONTHS = [5, 6, 7, 8]; // May, Jun, Jul, Aug (1-indexed)

// Use local month — never toISOString() which shifts to UTC
export function isVacationMonth(date?: Date): boolean {
    const d = date || new Date();
    const month = d.getMonth() + 1; // 1-indexed local month
    return VACATION_MONTHS.includes(month);
}

export function isVacationMonthStr(yearMonth: string): boolean {
    // yearMonth = "YYYY-MM"
    const mm = parseInt(yearMonth.slice(5, 7), 10);
    return VACATION_MONTHS.includes(mm);
}

export function getVacationRent(monthlyRent: number): number {
    return Math.round(monthlyRent * 0.5);
}

export function getEffectiveRent(session: TenantSession, date?: Date): number {
    if (session.is_on_vacation && isVacationMonth(date)) {
        return getVacationRent(session.monthly_rent);
    }
    return session.monthly_rent;
}

export function getEffectiveRentForMonth(monthlyRent: number, yearMonth: string, isOnVacation: boolean): number {
    if (isOnVacation && isVacationMonthStr(yearMonth)) {
        return Math.round(monthlyRent * 0.5);
    }
    return monthlyRent;
}

// Safe local current month — avoids UTC timezone shift
export function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Safe month label from "YYYY-MM" — use day 2 to avoid UTC midnight shift
export function formatMonth(yearMonth: string): string {
    if (!yearMonth) return '';
    try {
        const d = new Date(yearMonth + '-02'); // day 2 avoids UTC midnight → prev month
        return d.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
    } catch {
        return yearMonth;
    }
}

// ============================================================
// AUTO-GENERATE MISSING BILLING RECORDS
// ============================================================

async function ensureBillingRecords(tenantId: number): Promise<void> {
    try {
        const { data: tenant } = await supabase
            .from('arms_tenants')
            .select('monthly_rent, move_in_date, location_id, unit_id, is_on_vacation')
            .eq('tenant_id', tenantId)
            .single();
        if (!tenant || !tenant.monthly_rent) return;

        const currentMonth = getCurrentMonth();
        const moveIn = tenant.move_in_date;
        if (!moveIn) return;

        const earliestMonth = moveIn.slice(0, 7);
        const { data: existing } = await supabase
            .from('arms_billing')
            .select('billing_month')
            .eq('tenant_id', tenantId);
        const existingSet = new Set((existing || []).map((b: any) => b.billing_month));

        const toInsert: any[] = [];

        // Integer month arithmetic — avoids UTC timezone shift from new Date('YYYY-MM-DD')
        let [sy, sm] = earliestMonth.split('-').map(Number);
        const [ey, em] = currentMonth.split('-').map(Number);

        while (sy < ey || (sy === ey && sm <= em)) {
            const m = `${sy}-${String(sm).padStart(2, '0')}`;
            if (!existingSet.has(m)) {
                const rentForMonth = getEffectiveRentForMonth(tenant.monthly_rent, m, tenant.is_on_vacation || false);
                const isVac = (tenant.is_on_vacation || false) && isVacationMonthStr(m);
                toInsert.push({
                    tenant_id: tenantId,
                    location_id: tenant.location_id,
                    unit_id: tenant.unit_id,
                    billing_month: m,
                    billing_date: `${m}-01`,
                    due_date: `${m}-05`,
                    rent_amount: rentForMonth,
                    amount_paid: 0,
                    balance: rentForMonth,
                    status: 'Unpaid',
                    notes: isVac ? 'Vacation half-rent (50%)' : null,
                });
            }
            sm++;
            if (sm > 12) { sm = 1; sy++; }
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
