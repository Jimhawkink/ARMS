import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS TENANT MOBILE APP — SUPABASE CONFIGURATION
// Same Supabase instance as the ARMS web app
// ============================================================

const SUPABASE_URL = 'https://gcebwzpcyeltzhyqefxo.supabase.co';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjZWJ3enBjeWVsdHpoeXFlZnhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMzgwMzEsImV4cCI6MjEwOTgxNDAzMX0.P00UQaQW9KvKKQ5dlG1O8Ciqg4M2E8_SbQOGe9tqP6Q';

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
    isAdvance?: boolean;
    creditAmount?: number;
    advanceMonthLabel?: string;
}

export interface PrepaymentMonthBreakdown {
    billing_id: number | null;
    billing_month: string;
    monthName: string;
    rent_amount: number;
    amount_paid: number;
    balance: number;
    isFull: boolean;
}

export interface PrepaymentSummary {
    hasPrepayment: boolean;
    totalAdvance: number;
    coveredMonths: PrepaymentMonthBreakdown[];
    excessCredit: number;
    monthsCount: number;
}

export interface STKResult {
    success: boolean;
    checkoutRequestId?: string;
    mpesaReceipt?: string;
    error?: string;
}

// ============================================================
// AUTH — PIN LOGIN
// Ultra Secure: Verifies PIN server-side via API or SECURITY DEFINER RPC
// Never downloads all tenants or exposes PINs to the client device
// ============================================================

export async function loginTenantByPin(pin: string): Promise<TenantSession | null> {
    try {
        const pinStr = String(pin).trim();
        if (!pinStr) return null;

        // 1. Primary: Verify via ARMS secure server API (shielded by service_role)
        try {
            const apiRes = await fetch(`${ARMS_API_URL}/auth/tenant-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ pin: pinStr }),
            });
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                if (apiData?.success && apiData?.tenant) {
                    return apiData.tenant as TenantSession;
                }
            } else if (apiRes.status === 401) {
                return null; // Invalid PIN
            }
        } catch (apiErr: any) {
            console.warn('Tenant login API unreachable, falling back to secure RPC:', apiErr?.message);
        }

        // 2. Fallback: Verify via Supabase SECURITY DEFINER RPC
        const { data: rpcData, error: rpcErr } = await supabase.rpc('tenant_login_secure', { p_pin: pinStr });
        if (!rpcErr && rpcData?.success && rpcData?.tenant) {
            return rpcData.tenant as TenantSession;
        }

        return null;
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

        // Use LOCAL date arithmetic — avoids UTC timezone shift bug (EAT = UTC+3)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonthNum = now.getMonth() + 1;
        const currentMonth = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;
        const earliestMonth = moveIn ? moveIn.slice(0, 7) : currentMonth;

        // Generate virtual "Unbilled" entries for months missing in DB
        const virtualBills: BillingRecord[] = [];
        let [sy, sm] = earliestMonth.split('-').map(Number);

        // Integer arithmetic — no Date timezone issues
        while (sy < currentYear || (sy === currentYear && sm <= currentMonthNum)) {
            const m = `${sy}-${String(sm).padStart(2, '0')}`;
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
            sm++;
            if (sm > 12) { sm = 1; sy++; }
        }

        // Filter existing to only unpaid/partial, then combine with virtual
        const unpaidExisting = (allBills || []).filter((b: any) => b.status !== 'Paid' && (b.balance || 0) > 0);
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
        // Use local date — avoids UTC timezone shift (EAT = UTC+3)
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
// PENALTIES — Fetch & update late penalties
// ============================================================

export interface TenantPenaltyInfo {
    totalPenalty: number;
    penaltyDays: number;
    penaltyDates: string[];
    dailyRate?: number;
    rateLabel?: string;
}

export async function getTenantActivePenalties(tenantId: number): Promise<TenantPenaltyInfo> {
    try {
        // Query Supabase directly first (authoritative, real-time)
        const { data: pens, error } = await supabase
            .from('arms_penalties')
            .select('amount, penalty_date')
            .eq('tenant_id', tenantId)
            .eq('status', 'Active');
        
        if (!error && pens && pens.length > 0) {
            const total = pens.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
            return {
                totalPenalty: total,
                penaltyDays: pens.length,
                penaltyDates: pens.map((p: any) => p.penalty_date),
                rateLabel: '10% Flat',
            };
        }
    } catch (dbErr: any) {
        console.log('[ARMS APK] getTenantActivePenalties direct DB error:', dbErr.message);
    }

    try {
        const res = await fetch(`https://arms-opal.vercel.app/api/penalties?tenantId=${tenantId}`);
        if (res.ok) {
            const data = await res.json();
            return {
                totalPenalty: Number(data.total_penalty) || 0,
                penaltyDays: Number(data.penalty_days) || 0,
                penaltyDates: Array.isArray(data.penalty_dates) ? data.penalty_dates : [],
                rateLabel: '10% Flat',
            };
        }
    } catch (e: any) {
        console.log('[ARMS APK] getTenantActivePenalties API error:', e.message);
    }

    return { totalPenalty: 0, penaltyDays: 0, penaltyDates: [], rateLabel: '10% Flat' };
}

export async function markTenantPenaltiesPaid(tenantId: number, month?: string): Promise<boolean> {
    try {
        const res = await fetch(`https://arms-opal.vercel.app/api/penalties`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mark_paid', tenantId, month }),
        });
        const data = await res.json();
        return !!data?.ok;
    } catch (e: any) {
        console.log('[ARMS APK] markTenantPenaltiesPaid error:', e.message);
        return false;
    }
}

export async function getTenantTotalDebt(tenantId: number): Promise<{
    rentBalance: number;
    penaltyTotal: number;
    totalDue: number;
    penaltyDays: number;
    effectiveRent: number;
}> {
    const [{ total, effectiveRent }, penInfo] = await Promise.all([
        getTrueTotalBalance(tenantId),
        getTenantActivePenalties(tenantId),
    ]);
    return {
        rentBalance: total,
        penaltyTotal: penInfo.totalPenalty,
        totalDue: total + penInfo.totalPenalty,
        penaltyDays: penInfo.penaltyDays,
        effectiveRent,
    };
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

        const currentMonth = new Date().toISOString().slice(0, 7);

        return (data || []).map((p: any) => {
            // Priority: [Month: YYYY-MM] tag in notes (set by recordPayment & KCB callback)
            // This is the actual month the payment was recorded FOR, not just the first allocated bill
            const notesMonth = extractBillingMonth(p.notes);
            const billingJoinMonth = p.arms_billing?.billing_month || '';
            const resolvedMonth = notesMonth || billingJoinMonth;

            // Detect advance/overpayment credit
            const creditMatch = p.notes ? p.notes.match(/\[Credit:\s*(\d+(?:\.\d+)?)\]/) : null;
            const creditAmt = creditMatch ? parseFloat(creditMatch[1]) : 0;
            const isFutureMonth = resolvedMonth && resolvedMonth > currentMonth;
            const hasAdvanceWord = p.notes ? /advance|prepay/i.test(p.notes) : false;
            const isAdvance = isFutureMonth || creditAmt > 0 || hasAdvanceWord;

            let advanceMonthLabel = '';
            if (isFutureMonth) {
                advanceMonthLabel = `${formatMonth(resolvedMonth)} Advance`;
            } else if (creditAmt > 0) {
                advanceMonthLabel = `Overpayment Credit`;
            } else if (hasAdvanceWord) {
                advanceMonthLabel = 'Advance Payment';
            }

            return {
                ...p,
                billing_month: resolvedMonth,
                isAdvance,
                creditAmount: creditAmt,
                advanceMonthLabel,
            };
        });
    } catch (err: any) {
        console.error('getTenantPayments error:', err.message);
        return [];
    }
}

// ============================================================
// PREPAYMENTS & OVERPAYMENT BREAKDOWN
// Computes all future months covered and unallocated credit
// ============================================================

export async function getTenantPrepaymentSummary(
    tenantId: number,
    monthlyRent: number
): Promise<PrepaymentSummary> {
    try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // Future cutoff: strictly greater than currentMonth or '2026-11'
        const cutoff = currentMonth >= '2026-11' ? '2026-11' : currentMonth;

        // 1. Fetch advance bills in arms_billing
        const { data: advanceBills } = await supabase
            .from('arms_billing')
            .select('*')
            .eq('tenant_id', tenantId)
            .gt('billing_month', cutoff)
            .gt('amount_paid', 0)
            .order('billing_month', { ascending: true });

        // 2. Fetch payments to check for credit notes
        const { data: payments } = await supabase
            .from('arms_payments')
            .select('notes, amount, payment_date')
            .eq('tenant_id', tenantId)
            .order('payment_date', { ascending: false })
            .limit(10);

        let excessCredit = 0;
        (payments || []).forEach(p => {
            if (p.notes && p.notes.includes('[Credit:')) {
                const m = p.notes.match(/\[Credit:\s*(\d+(?:\.\d+)?)\]/);
                if (m) excessCredit += parseFloat(m[1]) || 0;
            }
        });

        // 3. Check tenant balance (if negative, that represents credit)
        const { data: tenant } = await supabase
            .from('arms_tenants')
            .select('balance')
            .eq('tenant_id', tenantId)
            .single();

        if (tenant && tenant.balance < 0) {
            const negCredit = Math.abs(tenant.balance);
            if (negCredit > excessCredit) excessCredit = negCredit;
        }

        const coveredMonths: PrepaymentMonthBreakdown[] = (advanceBills || []).map((b: any) => ({
            billing_id: b.billing_id,
            billing_month: b.billing_month,
            monthName: formatMonth(b.billing_month),
            rent_amount: b.rent_amount,
            amount_paid: b.amount_paid,
            balance: b.balance,
            isFull: b.status === 'Paid' || b.balance <= 0,
        }));

        const totalAdvanceBillsPaid = coveredMonths.reduce((s, m) => s + m.amount_paid, 0);
        const totalAdvance = totalAdvanceBillsPaid + excessCredit;
        const hasPrepayment = totalAdvance > 0 || coveredMonths.length > 0;

        let monthsCount = coveredMonths.length;
        if (excessCredit > 0 && monthlyRent > 0) {
            const extraMonths = Math.floor(excessCredit / monthlyRent);
            monthsCount += extraMonths;
        }

        return {
            hasPrepayment,
            totalAdvance,
            coveredMonths,
            excessCredit,
            monthsCount: Math.max(monthsCount, coveredMonths.length > 0 ? coveredMonths.length : (hasPrepayment ? 1 : 0)),
        };
    } catch (err: any) {
        console.error('getTenantPrepaymentSummary error:', err.message);
        return {
            hasPrepayment: false,
            totalAdvance: 0,
            coveredMonths: [],
            excessCredit: 0,
            monthsCount: 0,
        };
    }
}

// ============================================================
// TENANT PIN CHANGE — Ultra-Secure & Hacker-Proof
// Executes strictly server-side through ARMS API via service_role
// ============================================================

export async function changeTenantPin(
    tenantId: number,
    oldPin: string,
    newPin: string,
    confirmPin: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const res = await fetch(`${ARMS_API_URL}/tenants/change-pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                tenantId,
                oldPin: String(oldPin).trim(),
                newPin: String(newPin).trim(),
                confirmPin: String(confirmPin).trim(),
                source: 'mobile_apk',
            }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            return { success: false, error: data.error || 'Failed to change PIN' };
        }
        return { success: true, message: data.message || 'PIN changed successfully!' };
    } catch (err: any) {
        return { success: false, error: err.message || 'Network error updating PIN' };
    }
}

// Helper — extract payment month from notes.
// Priority: [Month: YYYY-MM] tag (set by recordPayment and KCB callback)
// Fallback: first YYYY-MM pattern found (legacy)
function extractBillingMonth(notes: string | null): string {
    if (!notes) return '';
    // Look for explicit [Month: YYYY-MM] tag first (most accurate)
    const tagged = notes.match(/\[Month:\s*(\d{4}-\d{2})\]/);
    if (tagged) return tagged[1];
    // Fallback: first date-like pattern
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
// RECORD PAYMENT — Handled 100% Server-Side
// Client-side direct payment insertion is strictly disabled for security.
// All payments are recorded automatically by the bank callback on Vercel.
// ============================================================

export async function recordTenantPayment(params: {
    tenantId: number;
    locationId: number;
    amount: number;
    mpesaReceipt: string;
    payerPhone: string;
    checkoutRequestId: string;
    billingMonth: string;
}): Promise<{ success: boolean; error?: string }> {
    console.log('🔒 recordTenantPayment: All payments are processed server-side via bank webhook.');
    return { success: true };
}

// ============================================================
// AUTO-GENERATE MISSING BILLING RECORDS
// ============================================================

async function ensureBillingRecords(_tenantId: number): Promise<void> {
    // Billing records are generated and managed server-side.
    return;
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
        const pinStr = String(pin).trim();
        if (!pinStr) return null;

        // 1. Primary: Verify via ARMS secure server API (shielded by service_role)
        try {
            const apiRes = await fetch(`${ARMS_API_URL}/auth/staff-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ pin: pinStr }),
            });
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                if (apiData?.success && apiData?.staff) {
                    return apiData.staff as StaffSession;
                }
            } else if (apiRes.status === 401) {
                return null;
            }
        } catch (apiErr: any) {
            console.warn('Staff login API unreachable, falling back to direct query:', apiErr?.message);
        }

        // 2. Fallback: Direct query to arms_users (if permission granted in Postgres)
        const { data, error } = await supabase
            .from('arms_users')
            .select('user_id, name, phone, user_role, active, mobile_pin, is_super_admin')
            .eq('active', true);

        if (error) { console.error('loginStaffByPin error:', error.message); return null; }
        if (!data || data.length === 0) return null;

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

// ============================================================
// KCB BUNI STK PUSH — Initiate KCB payment
// Added alongside M-Pesa — does NOT replace or affect it.
// Routes through ARMS web app API (Vercel) which holds credentials.
// ============================================================

export async function initiateKCBPush(params: {
    payerPhone:  string;
    amount:      number;
    tenantId:    number;
    description: string;
}): Promise<{ checkoutRequestId: string | null; error: string | null }> {
    try {
        const normalized = normalizePhone(params.payerPhone);
        if (!normalized) {
            return { checkoutRequestId: null, error: 'Invalid phone number. Use format: 0712345678' };
        }

        const response = await fetch(`${ARMS_API_URL}/kcb/stk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone:       normalized,
                amount:      Math.round(params.amount),
                tenantId:    params.tenantId,
                description: params.description || 'Rent Payment',
            }),
        });

        const result = await response.json();
        console.log('[KCB ARMS Mobile] STK response:', result);

        if (!response.ok || result.error) {
            return { checkoutRequestId: null, error: result.error || 'KCB STK Push failed' };
        }

        return { checkoutRequestId: result.checkoutRequestId || null, error: null };
    } catch (err: any) {
        console.error('initiateKCBPush error:', err.message);
        return { checkoutRequestId: null, error: 'Network error — please check your connection' };
    }
}

// ============================================================
// KCB BUNI — Poll payment status every 5 seconds
// Multi-fallback: checkoutRequestId → invoiceNumber → tenantId (most recent within 10min)
// ============================================================

export function pollKCBResult(params: {
    checkoutRequestId: string;
    tenantId?:         number;
    invoiceNumber?:    string;
    timeoutMs:         number;
    onConfirmed:  (receipt: string, amount: number) => void;
    onFailed:     (reason: string, resultCode?: string) => void;
    onTimeout:    () => void;
}): () => void {
    let done = false;
    const finish = () => { if (done) return false; done = true; return true; };

    // Build URL with all available IDs — server does multi-fallback lookup
    const buildUrl = () => {
        let url = `${ARMS_API_URL}/kcb/status?checkoutRequestId=${encodeURIComponent(params.checkoutRequestId)}`;
        if (params.tenantId)      url += `&tenantId=${params.tenantId}`;
        if (params.invoiceNumber) url += `&invoiceNumber=${encodeURIComponent(params.invoiceNumber)}`;
        return url;
    };

    const handleData = (data: any): boolean => {
        const status = (data?.status || '').toLowerCase();
        if (status === 'completed') {
            clearInterval(pollInterval);
            clearTimeout(timer);
            if (finish()) params.onConfirmed(data.receipt || '', data.amount || 0);
            return true;
        } else if (status === 'failed' || status === 'cancelled') {
            clearInterval(pollInterval);
            clearTimeout(timer);
            if (finish()) {
                const code = String(data.resultCode || '');
                let msg = 'KCB payment failed. Money was NOT deducted.';
                if (code === '1032')      msg = 'Payment cancelled. Money was NOT deducted.';
                else if (code === '1')    msg = 'Insufficient M-Pesa balance. Please top up and try again.';
                else if (code === '2001') msg = 'Wrong M-Pesa PIN entered. Money was NOT deducted.';
                else if (data.resultDesc) msg = data.resultDesc;
                params.onFailed(msg, code);
            }
            return true;
        }
        return false;
    };

    const pollInterval = setInterval(async () => {
        if (done) { clearInterval(pollInterval); return; }
        try {
            const res = await fetch(buildUrl(), { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return;
            const data = await res.json();
            handleData(data);
        } catch { /* keep polling on network error */ }
    }, 5000);

    const timer = setTimeout(async () => {
        clearInterval(pollInterval);
        if (done) return;
        try {
            const res = await fetch(buildUrl(), { headers: { 'Accept': 'application/json' } });
            if (res.ok) {
                const data = await res.json();
                if (handleData(data)) return;
            }
        } catch { /* ignore */ }
        if (finish()) params.onTimeout();
    }, params.timeoutMs);

    return () => { done = true; clearInterval(pollInterval); clearTimeout(timer); };
}


// ============================================================
// CHAT FUNCTIONS — Tenant <-> Admin Real-time Messaging
// ============================================================
export interface ChatMessage {
    chat_id: number;
    tenant_id: number;
    sender: 'tenant' | 'admin';
    message: string;
    is_read: boolean;
    created_at: string;
}
export async function sendChatMessage(tenantId: number, message: string): Promise<ChatMessage> {
    const { data, error } = await supabase.from('arms_chats').insert([{
        tenant_id: tenantId, sender: 'tenant', message: message.trim(),
        is_read: false, created_at: new Date().toISOString(),
    }]).select().single();
    if (error) throw new Error(error.message);
    return data as ChatMessage;
}
export async function getTenantChats(tenantId: number): Promise<ChatMessage[]> {
    const { data, error } = await supabase.from('arms_chats').select('*')
        .eq('tenant_id', tenantId).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as ChatMessage[];
}
export function subscribeToChats(tenantId: number, onNewMessage: (msg: ChatMessage) => void) {
    const channel = supabase.channel(`tenant_chat_${tenantId}`)
        .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'arms_chats', filter: `tenant_id=eq.${tenantId}` },
            (payload: any) => { onNewMessage(payload.new as ChatMessage); })
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}
export async function markAdminChatsRead(tenantId: number): Promise<void> {
    await supabase.from('arms_chats').update({ is_read: true, read_at: new Date().toISOString() })
        .eq('tenant_id', tenantId).eq('sender', 'admin').eq('is_read', false);
}
export async function getUnreadAdminMessages(tenantId: number): Promise<number> {
    const { count } = await supabase.from('arms_chats').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('sender', 'admin').eq('is_read', false);
    return count || 0;
}

// ============================================================
// AGREEMENT FUNCTIONS — Digital Lease Signing
// ============================================================
export interface TenantAgreement {
    agreement_id: number; tenant_id: number; template_id: number | null;
    lease_start_date: string | null; lease_end_date: string | null;
    monthly_rent: number; deposit_amount: number; unit_name: string;
    issued_by: string; issued_at: string; accepted: boolean;
    signed_at: string | null; signature_text: string | null; agreement_snapshot: string | null;
}
export interface AgreementTemplate {
    template_id: number; title: string; content: string;
    admin_signature_url: string | null; admin_name: string; admin_title: string; version: string;
}
export async function getPendingAgreement(tenantId: number): Promise<TenantAgreement | null> {
    const { data } = await supabase.from('arms_tenant_agreements').select('*')
        .eq('tenant_id', tenantId).eq('accepted', false)
        .order('created_at', { ascending: false }).limit(1);
    return (data && data.length > 0) ? data[0] as TenantAgreement : null;
}

export async function getAgreementTemplate(locationId?: number): Promise<AgreementTemplate | null> {
    // FIXED: Don't filter by location_id — just get the first active template
    // (locationId filter caused "no content" when template had no location set)
    const { data } = await supabase
        .from('arms_agreement_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
    return (data && data.length > 0) ? data[0] as AgreementTemplate : null;
}

export async function signAgreement(
    agreementId: number,
    signatureText: string,
    deviceInfo: string,
    snapshot: string,
    signatureImageBase64?: string,
): Promise<void> {
    const { error } = await supabase.from('arms_tenant_agreements').update({
        accepted: true,
        signed_at: new Date().toISOString(),
        signature_text: signatureText,
        device_info: deviceInfo,
        agreement_snapshot: snapshot,
        // Store base64 signature image in the snapshot if provided
        ...(signatureImageBase64 ? { signature_text: signatureImageBase64 } : {}),
    }).eq('agreement_id', agreementId);
    if (error) throw new Error(error.message);
}

export interface BusinessInfo {
    companyName: string;
    phone: string;
    email: string;
}

export async function getBusinessInfo(): Promise<BusinessInfo> {
    try {
        const { data, error } = await supabase
            .from('arms_settings')
            .select('setting_key, setting_value');
        if (error) throw error;
        const map = new Map((data || []).map((s: any) => [s.setting_key, s.setting_value]));
        return {
            companyName: map.get('company_name') || 'Alpha Rental Management',
            phone: map.get('company_phone') || '0720316175',
            email: map.get('company_email') || 'info@arms.com',
        };
    } catch {
        return {
            companyName: 'Alpha Rental Management',
            phone: '0720316175',
            email: 'info@arms.com',
        };
    }
}





