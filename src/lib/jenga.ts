// ==================== JENGA API (Equity Bank) ====================
// Handles authentication, STK push (M-Pesa & Equitel), and callbacks
// Sandbox: https://sandbox.jengahq.io / https://uat.finserve.africa
// Production: https://api.jengahq.io / https://api.finserve.africa

import { createPrivateKey, createSign } from 'crypto';
import { supabase } from './supabase';

// ─── Settings helper ───
async function getSetting(key: string): Promise<string> {
    const { data } = await supabase.from('arms_settings').select('setting_value').eq('setting_key', key).single();
    return data?.setting_value || '';
}

async function getJengaConfig() {
    const [environment, merchantCode, consumerSecret, apiKey, privateKey] = await Promise.all([
        getSetting('jenga_environment'),
        getSetting('jenga_merchant_code'),
        getSetting('jenga_consumer_secret'),
        getSetting('jenga_api_key'),
        getSetting('jenga_private_key'),
    ]);
    return { environment: environment || 'sandbox', merchantCode, consumerSecret, apiKey, privateKey };
}

function getBaseUrl(env: string) {
    return env === 'production' ? 'https://api.finserve.africa' : 'https://uat.finserve.africa';
}

// ─── Authentication: Get Bearer Token ───
export async function getJengaToken(): Promise<{ accessToken: string; expiresIn: string }> {
    const config = await getJengaConfig();
    if (!config.merchantCode || !config.consumerSecret || !config.apiKey) {
        throw new Error('Jenga credentials not configured. Go to Settings → Jenga to set them up.');
    }

    const baseUrl = getBaseUrl(config.environment);
    const res = await fetch(`${baseUrl}/authentication/api/v3/authenticate/merchant`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Api-Key': config.apiKey,
        },
        body: JSON.stringify({
            merchantCode: config.merchantCode,
            consumerSecret: config.consumerSecret,
        }),
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Jenga auth failed: ${txt}`);
    }

    const data = await res.json();
    if (!data.accessToken) {
        throw new Error(`Jenga auth failed: No access token returned`);
    }

    return { accessToken: data.accessToken, expiresIn: data.expiresIn };
}

// ─── Signature Generation ───
// Jenga requires RSA SHA-256 signatures on certain API calls
export function generateSignature(plaintext: string, privateKeyPem: string): string {
    const privateKey = createPrivateKey({
        key: privateKeyPem,
        format: 'pem',
        type: 'pkcs1',
    });

    const sign = createSign('SHA256');
    sign.update(plaintext);
    sign.end();

    const signature = sign.sign(privateKey);
    return signature.toString('base64');
}

// ─── M-Pesa STK Push (via Jenga Wallet Settlement) ───
export async function initiateMpesaStkPush(params: {
    phone: string;
    amount: number;
    orderReference: string;
    paymentReference: string;
    callbackUrl: string;
    tenantName?: string;
    tenantEmail?: string;
    tenantPhone?: string;
    description?: string;
}) {
    const config = await getJengaConfig();
    const { accessToken } = await getJengaToken();
    const baseUrl = getBaseUrl(config.environment);

    // Format phone: 0712... → 0722000000 (sandbox) or real number (production)
    const msisdn = config.environment === 'sandbox' ? '0722000000' : params.phone.replace(/^\+/, '').replace(/^254/, '0');

    // Generate signature: orderReference+paymentCurrency+msisdn+paymentAmount
    const sigPlaintext = `${params.orderReference}KES${msisdn}${params.amount}`;
    const signature = config.privateKey
        ? generateSignature(sigPlaintext, config.privateKey)
        : '';

    const body = {
        order: {
            orderReference: params.orderReference,
            orderAmount: params.amount,
            orderCurrency: 'KES',
            source: 'APICHECKOUT',
            countryCode: 'KE',
            description: params.description || 'Rent Payment',
        },
        customer: {
            name: params.tenantName || 'Tenant',
            email: params.tenantEmail || '',
            phoneNumber: params.tenantPhone || msisdn,
            identityNumber: '0000000',
            firstAddress: '',
            secondAddress: '',
        },
        payment: {
            paymentReference: params.paymentReference,
            paymentCurrency: 'KES',
            channel: 'MOBILE',
            service: 'MPESA',
            provider: 'JENGA',
            callbackUrl: params.callbackUrl,
            details: {
                msisdn,
                paymentAmount: params.amount,
            },
        },
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
    };
    if (signature) {
        headers['Signature'] = signature;
    }

    const res = await fetch(`${baseUrl}/api-checkout/mpesa-stk-push/v3.0/init`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log('📱 Jenga M-Pesa STK Push response:', JSON.stringify(data));
    return data;
}

// ─── Equitel STK Push ───
export async function initiateEquitelStkPush(params: {
    phone: string;
    amount: number;
    paymentRef: string;
    callbackUrl: string;
    accountNumber?: string;
    merchantName?: string;
}) {
    const config = await getJengaConfig();
    const { accessToken } = await getJengaToken();
    const baseUrl = getBaseUrl(config.environment);

    const accountNumber = params.accountNumber || config.merchantCode;
    const mobileNumber = config.environment === 'sandbox' ? '254764555291' : params.phone.replace(/^0/, '254').replace(/^\+/, '');

    // Generate signature: accountNumber+paymentRef+mobileNumber+telco+amount+currency
    const sigPlaintext = `${accountNumber}${params.paymentRef}${mobileNumber}Equitel${params.amount}KES`;
    const signature = config.privateKey
        ? generateSignature(sigPlaintext, config.privateKey)
        : '';

    const body = {
        merchant: {
            accountNumber,
            countryCode: 'KE',
            name: params.merchantName || 'ARMS',
        },
        payment: {
            ref: params.paymentRef,
            amount: params.amount.toFixed(2),
            currency: 'KES',
            telco: 'Equitel',
            mobileNumber,
            date: new Date().toISOString().split('T')[0],
            callBackUrl: params.callbackUrl,
            pushType: 'STK',
        },
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
    };
    if (signature) {
        headers['Signature'] = signature;
    }

    const res = await fetch(`${baseUrl}/v3-apis/payment-api/v3.0/stkussdpush/initiate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log('📱 Jenga Equitel STK Push response:', JSON.stringify(data));
    return data;
}

// ─── Store Jenga Settings ───
export async function saveJengaSettings(settings: {
    environment?: string;
    merchantCode?: string;
    consumerSecret?: string;
    apiKey?: string;
    privateKey?: string;
    callbackUrl?: string;
}) {
    const upserts = Object.entries(settings)
        .filter(([, v]) => v !== undefined)
        .map(([key, value]) => ({
            setting_key: `jenga_${key}`,
            setting_value: value,
        }));

    for (const entry of upserts) {
        const { error } = await supabase
            .from('arms_settings')
            .upsert(entry, { onConflict: 'setting_key' });
        if (error) throw error;
    }
}

// ─── Get Jenga Settings (for UI) ───
export async function getJengaSettings() {
    const { data, error } = await supabase
        .from('arms_settings')
        .select('setting_key, setting_value')
        .like('setting_key', 'jenga_%');
    if (error) throw error;

    const settings: Record<string, string> = {};
    (data || []).forEach(s => {
        const key = s.setting_key.replace('jenga_', '');
        settings[key] = s.setting_value || '';
    });
    return settings;
}
