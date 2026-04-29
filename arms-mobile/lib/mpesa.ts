const API_BASE = 'https://arms-opal.vercel.app';

export interface StkPushRequest {
  phone: string;
  amount: number;
  accountReference?: string;
  transactionDesc?: string;
  tenantId?: number;
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
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function checkStkStatus(checkoutRequestId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/mpesa/stk-push?checkoutRequestId=${checkoutRequestId}`);
  return res.json();
}
