import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS TENANT MOBILE APP — SUPABASE CONFIGURATION
// Same Supabase instance as the ARMS web app
// ============================================================

const SUPABASE_URL = 'https://enlqpifpxuecxxozyiak.supabase.co';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubHFwaWZweHVlY3h4b3p5aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjUzNjgsImV4cCI6MjA4MTYwMTM2OH0.-z3-2Mf3SkkZR3ZryOGyG-60jWERX9YLKIee048OziE';

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

    // Timeout handler
    const timer = setTimeout(() => {
        if (markDone()) {
            clearInterval(pollInterval);
            channel.unsubscribe();
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

        if (pollCount >= 35) { // 70s max polling (2s × 35)
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
            headers: { 'Content-Type': 'application/json' },
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
