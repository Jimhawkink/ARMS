// ============================================
// ARMS TENANT APP - M-PESA STK PUSH
// Supports: Own phone payment + Pay-for-Me
// Pay-for-Me: STK goes to alternate phone,
// but tenant's primary phone is used for account credit
// ============================================

const API_BASE = 'https://arms-opal.vercel.app';

export interface StkPushRequest {
    phone: string;
    amount: number;
    accountReference?: string;
    transactionDesc?: string;
    tenantId?: number;
    tenantPrimaryPhone?: string;
    isPayForMe?: boolean;
}

export interface StkPushResponse {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    errorCode?: string;
    errorMessage?: string;
    error?: string;
    missingConfig?: boolean;
}

export async function initiateStkPush(req: StkPushRequest): Promise<StkPushResponse> {
    const res = await fetch(`${API_BASE}/api/mpesa/stk-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phone: req.phone,
            amount: req.amount,
            accountReference: req.accountReference,
            transactionDesc: req.transactionDesc,
            tenantId: req.tenantId,
            // For Pay-for-Me: pass the tenant's primary phone so the
            // callback can match the payment to the correct tenant account
            tenantPrimaryPhone: req.isPayForMe ? req.tenantPrimaryPhone : undefined,
            isPayForMe: req.isPayForMe || false,
        }),
    });
    return res.json();
}

export async function checkStkStatus(checkoutRequestId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/mpesa/stk-push?checkoutRequestId=${checkoutRequestId}`);
    return res.json();
}

// Format phone for M-Pesa API (requires 254XXXXXXXXX)
export function formatMpesaPhone(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) return '254' + p.slice(1);
    if (p.startsWith('254')) return p;
    if (p.length === 9) return '254' + p;
    return p;
}

// Validate Kenyan phone number
export function isValidKenyanPhone(phone: string): boolean {
    const p = phone.replace(/\D/g, '');
    // Accept 07XX, 01XX, 254XX formats
    if (/^(07|01)\d{8}$/.test(p)) return true;
    if (/^254\d{9}$/.test(p)) return true;
    if (/^[17]\d{8}$/.test(p)) return true;
    return false;
}
