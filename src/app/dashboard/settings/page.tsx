'use client';
import { useState, useEffect } from 'react';
import { getSettings, supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    FiSave, FiSettings, FiPhone, FiSmartphone, FiMessageCircle,
    FiDollarSign, FiAlertTriangle, FiHome, FiEye, FiEyeOff,
    FiCheckCircle, FiCopy, FiRefreshCw, FiZap, FiShield, FiLink,
    FiGlobe
} from 'react-icons/fi';
import { topProgress } from '@/components/TopProgressBar';

/* ─── Section definitions ─── */
const settingGroups = [
    {
        key: 'company',
        title: 'Company Information',
        emoji: '🏢',
        color: '#6366f1',
        description: 'Your business identity displayed on receipts and statements',
        fields: [
            { key: 'company_name', label: 'Company Name', placeholder: 'Alpha Rental Management', type: 'text', emoji: '🏢', span: 2 },
            { key: 'company_phone', label: 'Company Phone', placeholder: '0720316175', type: 'text', emoji: '📞' },
            { key: 'company_email', label: 'Company Email', placeholder: 'info@arms.co.ke', type: 'email', emoji: '📧' },
            { key: 'company_address', label: 'Company Address', placeholder: 'P.O Box 123, Nairobi', type: 'text', emoji: '📍', span: 2 },
            { key: 'company_logo_url', label: 'Logo URL', placeholder: 'https://example.com/logo.png', type: 'text', emoji: '🖼️', span: 2 },
        ]
    },
    {
        key: 'mpesa_stk',
        title: 'M-Pesa STK Push (Lipa Na M-Pesa)',
        emoji: '📲',
        color: '#10b981',
        description: 'Daraja API credentials for sending payment prompts directly to tenants\' phones',
        helpLink: 'https://developer.safaricom.co.ke',
        fields: [
            { key: 'mpesa_environment', label: 'Environment', placeholder: 'sandbox or production', type: 'text', emoji: '🌍' },
            { key: 'mpesa_shortcode', label: 'Business Shortcode (Paybill)', placeholder: '174379', type: 'text', emoji: '📱' },
            { key: 'mpesa_consumer_key', label: 'Consumer Key', placeholder: 'Consumer Key from Daraja', type: 'password', emoji: '🔑' },
            { key: 'mpesa_consumer_secret', label: 'Consumer Secret', placeholder: 'Consumer Secret from Daraja', type: 'password', emoji: '🔐' },
            { key: 'mpesa_passkey', label: 'Lipa Na M-Pesa Passkey', placeholder: 'STK Push Passkey', type: 'password', emoji: '🗝️', span: 2 },
            { key: 'mpesa_stk_callback_url', label: 'STK Callback URL', placeholder: 'https://your-domain.com/api/mpesa/stk-callback', type: 'text', emoji: '🔗', span: 2 },
        ]
    },
    {
        key: 'mpesa_c2b',
        title: 'M-Pesa C2B (Customer to Business)',
        emoji: '🔄',
        color: '#3b82f6',
        description: 'C2B configuration for receiving M-Pesa payments automatically when tenants pay to your till/paybill',
        helpLink: 'https://developer.safaricom.co.ke/Documentation',
        fields: [
            { key: 'mpesa_c2b_shortcode', label: 'C2B Till / Paybill Number', placeholder: '9830453', type: 'text', emoji: '📱' },
            { key: 'mpesa_c2b_type', label: 'Register Type', placeholder: 'Paybill or Till', type: 'text', emoji: '🏷️' },
            { key: 'mpesa_c2b_consumer_key', label: 'C2B Consumer Key', placeholder: 'Daraja App Consumer Key', type: 'password', emoji: '🔑' },
            { key: 'mpesa_c2b_consumer_secret', label: 'C2B Consumer Secret', placeholder: 'Daraja App Consumer Secret', type: 'password', emoji: '🔐' },
            { key: 'mpesa_c2b_validation_url', label: 'Validation URL', placeholder: 'https://your-domain.com/api/mpesa/validate', type: 'text', emoji: '✅', span: 2 },
            { key: 'mpesa_c2b_confirmation_url', label: 'Confirmation URL (Callback)', placeholder: 'https://your-domain.com/api/mpesa/callback', type: 'text', emoji: '🔗', span: 2 },
        ]
    },
    {
        key: 'jenga',
        title: 'Jenga API (Equity Bank / JengaHQ)',
        emoji: '🏦',
        color: '#f59e0b',
        description: 'Jenga API credentials for Equity Bank — M-Pesa & Equitel STK Push, receive payments via Jenga',
        helpLink: 'https://developer.jengahq.io',
        fields: [
            { key: 'jenga_environment', label: 'Environment', placeholder: 'sandbox or production', type: 'text', emoji: '🌍' },
            { key: 'jenga_merchant_code', label: 'Merchant Code', placeholder: 'e.g. 2280641394', type: 'text', emoji: '🏪' },
            { key: 'jenga_consumer_secret', label: 'Consumer Secret', placeholder: 'Jenga Consumer Secret', type: 'password', emoji: '�' },
            { key: 'jenga_api_key', label: 'API Key', placeholder: 'Jenga API Key', type: 'password', emoji: '�' },
            { key: 'jenga_private_key', label: 'Private Key (RSA)', placeholder: '-----BEGIN RSA PRIVATE KEY-----\n...', type: 'textarea', emoji: '🗝️', span: 2 },
            { key: 'jenga_callback_url', label: 'Payment Callback URL', placeholder: 'https://your-domain.com/api/jenga/callback', type: 'text', emoji: '�', span: 2 },
        ]
    },
    {
        key: 'billing',
        title: 'Billing & Rent Settings',
        emoji: '💰',
        color: '#8b5cf6',
        description: 'Configure billing cycle, due dates, and late fee policies',
        fields: [
            { key: 'currency', label: 'Currency Code', placeholder: 'KES', type: 'text', emoji: '💰' },
            { key: 'billing_day', label: 'Billing Day of Month', placeholder: '1', type: 'number', emoji: '📅' },
            { key: 'due_day', label: 'Due Day of Month', placeholder: '5', type: 'number', emoji: '⏰' },
            { key: 'late_fee_enabled', label: 'Enable Late Fees', placeholder: 'true', type: 'text', emoji: '⚠️' },
            { key: 'late_fee_amount', label: 'Fixed Late Fee (KES)', placeholder: '500', type: 'number', emoji: '💸' },
            { key: 'late_fee_percent', label: 'Late Fee Percentage (%)', placeholder: '2', type: 'number', emoji: '📊' },
        ]
    },
    {
        key: 'sms',
        title: 'SMS & Notifications',
        emoji: '💬',
        color: '#f59e0b',
        description: 'Africa\'s Talking or Twilio SMS for sending reminders and receipts',
        fields: [
            { key: 'sms_enabled', label: 'Enable SMS', placeholder: 'true', type: 'text', emoji: '💬' },
            { key: 'sms_provider', label: 'Provider', placeholder: 'AfricasTalking', type: 'text', emoji: '🏷️' },
            { key: 'sms_api_key', label: 'SMS API Key', placeholder: 'API Key', type: 'password', emoji: '🔑' },
            { key: 'sms_username', label: 'SMS Username', placeholder: 'sandbox or your AT username', type: 'text', emoji: '👤' },
            { key: 'sms_sender_id', label: 'Sender ID', placeholder: 'ARMS', type: 'text', emoji: '📤' },
            { key: 'reminder_days_before', label: 'Reminder Days Before Due', placeholder: '3', type: 'number', emoji: '🔔' },
        ]
    },
    {
        key: 'whatsapp',
        title: 'WhatsApp Business API (Meta)',
        emoji: '🟢',
        color: '#22c55e',
        description: 'Meta WhatsApp Business Cloud API — send rent reminders, receipts & demand notices via WhatsApp',
        helpLink: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
        fields: [
            { key: 'whatsapp_enabled', label: 'Enable WhatsApp', placeholder: 'true', type: 'text', emoji: '🟢' },
            { key: 'whatsapp_phone_number_id', label: 'Phone Number ID', placeholder: '123456789012345 (from Meta Developer Console)', type: 'text', emoji: '📱' },
            { key: 'whatsapp_access_token', label: 'Permanent Access Token', placeholder: 'EAAxxxxxxxx...', type: 'password', emoji: '🔑', span: 2 },
            { key: 'whatsapp_business_account_id', label: 'Business Account ID (WABA ID)', placeholder: '123456789012345', type: 'text', emoji: '🏢' },
            { key: 'whatsapp_verify_token', label: 'Webhook Verify Token', placeholder: 'arms_webhook_secret_2024', type: 'text', emoji: '🔐' },
        ]
    },
    {
        key: 'unit_tills',
        title: 'Unit Tills',
        emoji: '📱',
        color: '#7c3aed',
        description: 'Configure M-Pesa till per unit. STK Push is blocked for unconfigured units.',
        fields: [], // Rendered by UnitTillsPanel — not the standard field grid
    },
];

/* ─── Field Component ─── */
function SettingField({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
    const [show, setShow] = useState(false);
    const [copied, setCopied] = useState(false);
    const isSecret = field.type === 'password';
    const isTextarea = field.type === 'textarea';

    const copy = () => {
        if (value) { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    };

    return (
        <div className={field.span === 2 ? 'md:col-span-2' : ''}>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                <span>{field.emoji}</span> {field.label}
            </label>
            <div className="relative">
                {isTextarea ? (
                    <textarea
                        rows={4}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition font-mono resize-none"
                    />
                ) : (
                    <input
                        type={isSecret && !show ? 'password' : 'text'}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full pl-4 pr-20 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition"
                    />
                )}
                {!isTextarea && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {value && (
                            <button onClick={copy} title="Copy" className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition">
                                {copied ? <FiCheckCircle size={13} className="text-green-500" /> : <FiCopy size={13} />}
                            </button>
                        )}
                        {isSecret && (
                            <button onClick={() => setShow(!show)} title={show ? 'Hide' : 'Show'} className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition">
                                {show ? <FiEyeOff size={13} /> : <FiEye size={13} />}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── STK Push Test Panel ─── */
function StkTestPanel({ settings }: { settings: Record<string, string> }) {
    const [phone, setPhone] = useState('');
    const [amount, setAmount] = useState('');
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<any>(null);

    const testStk = async () => {
        if (!phone || !amount) { toast.error('Enter phone and amount'); return; }
        setTesting(true); setResult(null);
        try {
            const res = await fetch('/api/mpesa/stk-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, amount: parseFloat(amount), accountReference: 'ARMS-TEST', transactionDesc: 'Test STK Push' })
            });
            const data = await res.json();
            setResult(data);
            if (data.ResponseCode === '0') toast.success('STK Push sent! Check phone.');
            else toast.error(data.errorMessage || data.ResponseDescription || 'STK Push failed');
        } catch (e: any) { toast.error(e.message); setResult({ error: e.message }); }
        setTesting(false);
    };

    return (
        <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">🧪 Test STK Push</p>
            <div className="flex gap-2 flex-wrap">
                <input
                    value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="Phone (e.g. 0712345678)"
                    className="flex-1 min-w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 transition"
                />
                <input
                    value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="Amount (KES)"
                    type="number"
                    className="w-32 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 transition"
                />
                <button
                    onClick={testStk}
                    disabled={testing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition disabled:opacity-60"
                >
                    {testing ? <FiRefreshCw size={13} className="animate-spin" /> : <FiZap size={13} />}
                    Send Test
                </button>
            </div>
            {result && (
                <div className={`mt-2 px-3 py-2 rounded-xl text-xs font-mono ${result.ResponseCode === '0' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {JSON.stringify(result, null, 2)}
                </div>
            )}
        </div>
    );
}

/* ─── C2B Registration Panel ─── */
function C2bRegisterPanel() {
    const [registering, setRegistering] = useState(false);
    const [result, setResult] = useState<any>(null);

    const register = async () => {
        setRegistering(true); setResult(null);
        try {
            const res = await fetch('/api/mpesa/register-c2b', { method: 'POST' });
            const data = await res.json();
            setResult(data);
            if (data.ResponseDescription?.includes('Success') || data.success) toast.success('C2B URLs registered successfully!');
            else toast.error(data.errorMessage || 'Registration failed');
        } catch (e: any) { toast.error(e.message); }
        setRegistering(false);
    };

    return (
        <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">🔗 Register C2B URLs with Safaricom</p>
            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={register} disabled={registering}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition disabled:opacity-60">
                    {registering ? <FiRefreshCw size={13} className="animate-spin" /> : <FiLink size={13} />}
                    Register C2B URLs
                </button>
                <p className="text-xs text-gray-400">Must be done once after setting up your URLs</p>
            </div>
            {result && (
                <div className={`mt-2 px-3 py-2 rounded-xl text-xs font-mono ${result.success || result.ResponseDescription?.includes('Success') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {JSON.stringify(result, null, 2)}
                </div>
            )}
        </div>
    );
}

/* ─── Jenga Test Panel ─── */
function JengaTestPanel() {
    const [testing, setTesting] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [stkTesting, setStkTesting] = useState(false);
    const [cbTesting, setCbTesting] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [publicKey, setPublicKey] = useState('');
    const [stkPhone, setStkPhone] = useState('');
    const [stkAmount, setStkAmount] = useState('1');
    const [stkChannel, setStkChannel] = useState<'mpesa' | 'equitel'>('mpesa');
    const [cbPhone, setCbPhone] = useState('');
    const [cbAmount, setCbAmount] = useState('5000');

    const testAuth = async () => {
        setTesting(true); setResult(null);
        try {
            const res = await fetch('/api/jenga/auth');
            const data = await res.json();
            setResult(data);
            if (data.success) toast.success('✅ Jenga authentication successful!');
            else toast.error(data.error || 'Authentication failed');
        } catch (e: any) { toast.error(e.message); setResult({ error: e.message }); }
        setTesting(false);
    };

    const generateKeys = async () => {
        setGenerating(true); setResult(null);
        try {
            const res = await fetch('/api/jenga/generate-keys', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setPublicKey(data.publicKey);
                toast.success('✅ RSA key pair generated! Copy the public key and upload to Jenga HQ.');
            } else {
                toast.error(data.error || 'Key generation failed');
            }
            setResult(data);
        } catch (e: any) { toast.error(e.message); setResult({ error: e.message }); }
        setGenerating(false);
    };

    const testStkPush = async () => {
        if (!stkPhone || !stkAmount) { toast.error('Enter phone and amount'); return; }
        setStkTesting(true); setResult(null);
        try {
            const res = await fetch('/api/jenga/stk-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: stkPhone, amount: parseFloat(stkAmount), channel: stkChannel, description: 'Jenga Test Payment' })
            });
            const data = await res.json();
            setResult(data);
            if (data.success || data.status) toast.success('✅ STK Push sent! Check phone.');
            else toast.error(data.error || data.message || 'STK Push failed');
        } catch (e: any) { toast.error(e.message); setResult({ error: e.message }); }
        setStkTesting(false);
    };

    const testCallback = async () => {
        if (!cbPhone || !cbAmount) { toast.error('Enter phone and amount'); return; }
        setCbTesting(true); setResult(null);
        try {
            const res = await fetch('/api/jenga/callback', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: cbPhone, amount: parseFloat(cbAmount), customerName: 'Test Tenant' }),
            });
            const data = await res.json();
            setResult(data);
            if (data.success) toast.success(`✅ Callback test OK! ${data.matchedTenant ? `Linked to ${data.matchedTenant.name}` : 'No tenant matched'}`);
            else toast.error(data.error || 'Callback test failed');
        } catch (e: any) { toast.error(e.message); setResult({ error: e.message }); }
        setCbTesting(false);
    };

    return (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">🧪 Test & Setup</p>

            {/* Test Auth */}
            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={testAuth} disabled={testing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition disabled:opacity-60">
                    {testing ? <FiRefreshCw size={13} className="animate-spin" /> : <FiZap size={13} />}
                    Test Authentication
                </button>
                <p className="text-xs text-gray-400">Verifies your credentials work with Jenga API</p>
            </div>

            {/* Generate Keys */}
            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={generateKeys} disabled={generating}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition disabled:opacity-60">
                    {generating ? <FiRefreshCw size={13} className="animate-spin" /> : <FiShield size={13} />}
                    Generate RSA Keys
                </button>
                <p className="text-xs text-gray-400">Required for signing STK push requests</p>
            </div>

            {/* Show public key if generated */}
            {publicKey && (
                <div className="space-y-2">
                    <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">📋 Copy this public key → Upload to Jenga HQ → Settings → Keys</p>
                    <textarea readOnly value={publicKey}
                        className="w-full h-32 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[10px] font-mono text-amber-800 resize-none"
                        onClick={e => (e.target as HTMLTextAreaElement).select()}
                    />
                    <button onClick={() => { navigator.clipboard.writeText(publicKey); toast.success('Public key copied!'); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition">
                        <FiCopy size={12} /> Copy Public Key
                    </button>
                </div>
            )}

            {/* Test STK Push */}
            <div className="pt-3 border-t border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">📱 Test STK Push</p>
                <div className="flex gap-2 flex-wrap items-center">
                    <select value={stkChannel} onChange={e => setStkChannel(e.target.value as 'mpesa' | 'equitel')}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition">
                        <option value="mpesa">M-Pesa (via Jenga)</option>
                        <option value="equitel">Equitel</option>
                    </select>
                    <input value={stkPhone} onChange={e => setStkPhone(e.target.value)}
                        placeholder="Phone (e.g. 0722000000)"
                        className="flex-1 min-w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition"
                    />
                    <input value={stkAmount} onChange={e => setStkAmount(e.target.value)}
                        placeholder="Amount" type="number"
                        className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition"
                    />
                    <button onClick={testStkPush} disabled={stkTesting}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition disabled:opacity-60">
                        {stkTesting ? <FiRefreshCw size={13} className="animate-spin" /> : <FiSmartphone size={13} />}
                        Send Test
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">Sandbox: use phone 0722000000 for M-Pesa, 254764555291 for Equitel</p>
            </div>

            {/* Test Callback (IPN) */}
            <div className="pt-3 border-t border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">🔗 Test Callback (IPN)</p>
                <p className="text-[10px] text-gray-400 mb-2">Simulates a Jenga payment callback — auto-matches tenant by phone and records payment</p>
                <div className="flex gap-2 flex-wrap items-center">
                    <input value={cbPhone} onChange={e => setCbPhone(e.target.value)}
                        placeholder="Phone (e.g. 0119087458)"
                        className="flex-1 min-w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition"
                    />
                    <input value={cbAmount} onChange={e => setCbAmount(e.target.value)}
                        placeholder="Amount" type="number"
                        className="w-28 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition"
                    />
                    <button onClick={testCallback} disabled={cbTesting}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition disabled:opacity-60">
                        {cbTesting ? <FiRefreshCw size={13} className="animate-spin" /> : <FiLink size={13} />}
                        Test Callback
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">Uses a tenant's phone number — if matched, payment auto-links to their account</p>
            </div>

            {/* Result display */}
            {result && (
                <div className={`px-3 py-2 rounded-xl text-xs font-mono ${result.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {JSON.stringify(result, null, 2)}
                </div>
            )}
        </div>
    );
}

/* ─── Unit Tills Panel ─── */
function UnitTillsPanel() {
    const [configs, setConfigs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<Record<number, boolean>>({});
    const [forms, setForms] = useState<Record<number, any>>({});
    const [show, setShow] = useState<Record<string, boolean>>({});

    const loadConfigs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/mpesa/unit-config');
            const data = await res.json();
            setConfigs(data || []);
            // Init forms with till_number, shortcode, environment (never pre-fill masked secrets)
            const initForms: Record<number, any> = {};
            (data || []).forEach((c: any) => {
                initForms[c.unit_id] = {
                    till_number: c.till_number || '',
                    shortcode: c.shortcode?.includes('****') ? '' : (c.shortcode || ''),
                    consumer_key: '',
                    consumer_secret: '',
                    passkey: '',
                    environment: c.environment || 'production',
                };
            });
            setForms(initForms);
        } catch { toast.error('Failed to load unit till configs'); }
        setLoading(false);
    };

    useEffect(() => { loadConfigs(); }, []);

    const handleSave = async (unitId: number, unitName: string) => {
        const form = forms[unitId];
        if (!form?.till_number?.trim()) { toast.error('Till number is required'); return; }
        setSaving(prev => ({ ...prev, [unitId]: true }));
        try {
            const res = await fetch('/api/mpesa/unit-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unit_id: unitId, ...form }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`✅ Till saved for ${unitName}`);
                loadConfigs();
            } else {
                toast.error(data.error || 'Failed to save');
            }
        } catch (e: any) { toast.error(e.message); }
        setSaving(prev => ({ ...prev, [unitId]: false }));
    };

    const updateForm = (unitId: number, key: string, value: string) => {
        setForms(prev => ({ ...prev, [unitId]: { ...prev[unitId], [key]: value } }));
    };

    const toggleShow = (key: string) => setShow(prev => ({ ...prev, [key]: !prev[key] }));

    if (loading) return (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <FiRefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Loading unit till configs…</span>
        </div>
    );

    const configured = configs.filter(c => c.is_configured).length;
    const total = configs.length;

    // Group by location
    const byLocation: Record<string, any[]> = {};
    configs.forEach(c => {
        const loc = c.location_name || 'Unknown';
        if (!byLocation[loc]) byLocation[loc] = [];
        byLocation[loc].push(c);
    });

    return (
        <div className="space-y-5">
            {/* Summary banner */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${configured === total ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <span className="text-xl">{configured === total ? '✅' : '⚠️'}</span>
                <div>
                    <p className={`text-sm font-bold ${configured === total ? 'text-green-800' : 'text-amber-800'}`}>
                        {configured} of {total} units configured
                    </p>
                    <p className={`text-xs mt-0.5 ${configured === total ? 'text-green-600' : 'text-amber-600'}`}>
                        {total - configured > 0 ? `${total - configured} unit(s) will block STK Push until configured` : 'All units have a till configured'}
                    </p>
                </div>
                <button onClick={loadConfigs} className="ml-auto p-2 rounded-lg text-gray-400 hover:text-purple-600 transition">
                    <FiRefreshCw size={14} />
                </button>
            </div>

            {/* Location groups */}
            {Object.entries(byLocation).sort(([a], [b]) => a.localeCompare(b)).map(([locName, units]) => (
                <div key={locName}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">📍 {locName}</p>
                    <div className="space-y-3">
                        {units.map(cfg => {
                            const form = forms[cfg.unit_id] || {};
                            const isSaving = saving[cfg.unit_id];
                            return (
                                <div key={cfg.unit_id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    {/* Card header */}
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100"
                                        style={{ background: cfg.is_configured ? '#f0fdf4' : '#fef2f2' }}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-gray-800">🏠 {cfg.unit_name}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.is_configured ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {cfg.is_configured ? '✅ Configured' : '⚠️ Till Not Configured'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleSave(cfg.unit_id, cfg.unit_name)}
                                            disabled={isSaving}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition disabled:opacity-60"
                                            style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
                                        >
                                            {isSaving ? <FiRefreshCw size={11} className="animate-spin" /> : <FiSave size={11} />}
                                            {isSaving ? 'Saving…' : 'Save'}
                                        </button>
                                    </div>

                                    {/* Warning for unconfigured */}
                                    {!cfg.is_configured && (
                                        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                                            ⚠️ STK Push is blocked for this unit until a till is configured.
                                        </div>
                                    )}

                                    {/* Fields */}
                                    <div className="p-4 grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">📱 Till Number</label>
                                            <input
                                                value={form.till_number || ''}
                                                onChange={e => updateForm(cfg.unit_id, 'till_number', e.target.value)}
                                                placeholder="e.g. 9438697"
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:border-purple-400 transition"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">🏢 Shortcode</label>
                                            <input
                                                value={form.shortcode || ''}
                                                onChange={e => updateForm(cfg.unit_id, 'shortcode', e.target.value)}
                                                placeholder="e.g. 603123"
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:border-purple-400 transition"
                                            />
                                        </div>
                                        {/* Consumer Key */}
                                        <div className="relative">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">🔑 Consumer Key</label>
                                            <div className="relative">
                                                <input
                                                    type={show[`ck_${cfg.unit_id}`] ? 'text' : 'password'}
                                                    value={form.consumer_key || ''}
                                                    onChange={e => updateForm(cfg.unit_id, 'consumer_key', e.target.value)}
                                                    placeholder="Enter new value to update"
                                                    className="w-full pl-3 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 transition"
                                                />
                                                <button type="button" onClick={() => toggleShow(`ck_${cfg.unit_id}`)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-600">
                                                    {show[`ck_${cfg.unit_id}`] ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Consumer Secret */}
                                        <div className="relative">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">🔐 Consumer Secret</label>
                                            <div className="relative">
                                                <input
                                                    type={show[`cs_${cfg.unit_id}`] ? 'text' : 'password'}
                                                    value={form.consumer_secret || ''}
                                                    onChange={e => updateForm(cfg.unit_id, 'consumer_secret', e.target.value)}
                                                    placeholder="Enter new value to update"
                                                    className="w-full pl-3 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 transition"
                                                />
                                                <button type="button" onClick={() => toggleShow(`cs_${cfg.unit_id}`)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-600">
                                                    {show[`cs_${cfg.unit_id}`] ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Passkey */}
                                        <div className="relative">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">🗝️ Passkey</label>
                                            <div className="relative">
                                                <input
                                                    type={show[`pk_${cfg.unit_id}`] ? 'text' : 'password'}
                                                    value={form.passkey || ''}
                                                    onChange={e => updateForm(cfg.unit_id, 'passkey', e.target.value)}
                                                    placeholder="Enter new value to update"
                                                    className="w-full pl-3 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 transition"
                                                />
                                                <button type="button" onClick={() => toggleShow(`pk_${cfg.unit_id}`)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-600">
                                                    {show[`pk_${cfg.unit_id}`] ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Environment */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">🌍 Environment</label>
                                            <select
                                                value={form.environment || 'production'}
                                                onChange={e => updateForm(cfg.unit_id, 'environment', e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 transition"
                                            >
                                                <option value="production">Production</option>
                                                <option value="sandbox">Sandbox</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {configs.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <p className="text-4xl mb-3">📱</p>
                    <p className="text-sm font-medium">No units found</p>
                    <p className="text-xs mt-1">Run the migration SQL first, then add units in the Units page</p>
                </div>
            )}
        </div>
    );
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('company');

    useEffect(() => { loadSettings(); }, []);

    const loadSettings = async () => {
        setLoading(true);
        topProgress.start();
        try {
            const s = await getSettings();
            const map: Record<string, string> = {};
            s.forEach((item: any) => { map[item.setting_key] = item.setting_value || ''; });
            setSettings(map);
        } catch { toast.error('Failed to load settings'); } finally {
            topProgress.done();
        }
        setLoading(false);
    };

    const handleChange = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        topProgress.start();
        try {
            const entries = Object.entries(settings);
            for (const [key, value] of entries) {
                await supabase.from('arms_settings')
                    .upsert({ setting_key: key, setting_value: value }, { onConflict: 'setting_key' });
            }
            toast.success('✅ All settings saved successfully!');
        } catch (err: any) { toast.error(err.message || 'Failed to save'); } finally {
            topProgress.done();
        }
        setSaving(false);
    };

    const activeGroup = settingGroups.find(g => g.key === activeTab) || settingGroups[0];

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-sm font-bold text-gray-500">Loading settings…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn max-w-6xl mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                <div>
                    <h1 className="page-title flex items-center gap-2.5">⚙️ Settings</h1>
                    <p className="text-sm text-gray-400 mt-1">Manage credentials, integrations, billing rules and preferences</p>
                </div>
                <button
                    id="save-settings-btn"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200 transition disabled:opacity-70"
                >
                    {saving ? <FiRefreshCw size={14} className="animate-spin" /> : <FiSave size={14} />}
                    {saving ? 'Saving…' : 'Save All Settings'}
                </button>
            </div>

            <div className="flex gap-6">
                {/* ─ Sidebar Tabs ─ */}
                <div className="w-[200px] flex-shrink-0 space-y-1">
                    {settingGroups.map(group => (
                        <button key={group.key} onClick={() => setActiveTab(group.key)}
                            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${activeTab === group.key
                                ? 'text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                            style={activeTab === group.key ? { background: group.color } : {}}>
                            <span className="text-base">{group.emoji}</span>
                            <span className="leading-tight">{group.title.split(' ')[0]} {group.title.split(' ')[1] || ''}</span>
                        </button>
                    ))}
                </div>

                {/* ─ Panel ─ */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                        {/* Panel header */}
                        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between"
                            style={{ borderLeftWidth: 4, borderLeftColor: activeGroup.color }}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                                    style={{ background: `${activeGroup.color}15` }}>
                                    {activeGroup.emoji}
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">{activeGroup.title}</h2>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{activeGroup.description}</p>
                                </div>
                            </div>
                            {(activeGroup as any).helpLink && (
                                <a href={(activeGroup as any).helpLink} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition">
                                    <FiGlobe size={12} /> Docs
                                </a>
                            )}
                        </div>

                        <div className="p-6">
                            {/* Unit Tills — custom panel */}
                            {activeGroup.key === 'unit_tills' ? (
                                <UnitTillsPanel />
                            ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {activeGroup.fields.map(field => (
                                    <SettingField
                                        key={field.key}
                                        field={field}
                                        value={settings[field.key] || ''}
                                        onChange={v => handleChange(field.key, v)}
                                    />
                                ))}
                            </div>
                            )}

                            {/* STK Test Panel */}
                            {activeGroup.key === 'mpesa_stk' && <StkTestPanel settings={settings} />}

                            {/* C2B Registration Panel */}
                            {activeGroup.key === 'mpesa_c2b' && <C2bRegisterPanel />}

                            {/* Jenga Test Panel */}
                            {activeGroup.key === 'jenga' && <JengaTestPanel />}

                            {/* Jenga environment hint */}
                            {activeGroup.key === 'jenga' && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100">
                                        <FiShield size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold text-amber-700">Security Note</p>
                                            <p className="text-xs text-amber-600 mt-0.5">Your Jenga private key is stored securely in your Supabase database. Never expose it in client-side code. All Jenga API calls should be made from server-side API routes.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Security notice for credential groups */}
                    {['mpesa_stk', 'mpesa_c2b', 'jenga'].includes(activeGroup.key) && (
                        <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
                            <FiShield size={14} className="text-indigo-400 flex-shrink-0" />
                            <p className="text-xs text-indigo-600 font-medium">
                                Credentials are stored encrypted in your Supabase <code className="bg-indigo-100 px-1 rounded font-mono">arms_settings</code> table and fetched server-side only.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Developer card */}
            <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#6366f1' }}>
                <div className="px-6 py-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                        <span className="text-white font-bold">💎</span>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-900">Alpha Rental Management System (ARMS) v1.0</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Developed by <span className="text-indigo-600 font-semibold">Jimhawkins Korir</span> · Alpha Solutions · 📞 0720316175
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
