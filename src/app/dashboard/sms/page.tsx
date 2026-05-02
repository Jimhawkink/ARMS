'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    getSMSConfig, updateSMSConfig, getSMSLogs, logSMS, logWhatsApp,
    getReminderRules, addReminderRule, updateReminderRule,
    getOverdueTenants, getTenants, getSettings, getMessagingConfig,
    fillTemplate, MESSAGE_TEMPLATES, normalizePhoneKE,
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    FiSend, FiMessageSquare, FiSettings, FiClock, FiUsers,
    FiAlertTriangle, FiCheck, FiX, FiRefreshCw, FiPlus,
    FiSearch, FiChevronLeft, FiChevronRight, FiSave, FiZap,
    FiPhone, FiMail, FiToggleLeft, FiToggleRight, FiInfo,
} from 'react-icons/fi';

// ── Color tokens ──────────────────────────────────────────────────────────────
const C = {
    num:     { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date:    { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    name:    { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    phone:   { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    channel: { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    type:    { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    message: { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    status:  { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    cost:    { bg: '#fff7ed', text: '#c2410c', head: '#fed7aa' },
};

const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

const QUICK_TEMPLATES = [
    { label: '⏰ Rent Reminder', key: 'rent_reminder', color: '#6366f1' },
    { label: '🚨 Overdue Notice', key: 'overdue_notice', color: '#ef4444' },
    { label: '✅ Payment Received', key: 'payment_received', color: '#10b981' },
    { label: '📜 Demand Notice', key: 'demand_notice', color: '#dc2626' },
    { label: '👋 Welcome', key: 'welcome', color: '#0891b2' },
    { label: '⚠️ Penalty Notice', key: 'penalty_notice', color: '#f59e0b' },
];

function TenantAvatar({ name, size = 34 }: { name: string; size?: number }) {
    const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
    const GRADIENTS = [
        'linear-gradient(135deg,#6366f1,#8b5cf6)', 'linear-gradient(135deg,#0891b2,#06b6d4)',
        'linear-gradient(135deg,#059669,#10b981)', 'linear-gradient(135deg,#d97706,#f59e0b)',
        'linear-gradient(135deg,#dc2626,#ef4444)', 'linear-gradient(135deg,#7c3aed,#a855f7)',
    ];
    const idx = (name || '').charCodeAt(0) % GRADIENTS.length;
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: GRADIENTS[idx], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: size * 0.35, flexShrink: 0, boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }}>
            {initials}
        </div>
    );
}

// ── Channel badge ─────────────────────────────────────────────────────────────
function ChannelBadge({ channel }: { channel: 'SMS' | 'WhatsApp' | 'Both' }) {
    const styles: Record<string, { bg: string; color: string; border: string; icon: string }> = {
        SMS:      { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', icon: '💬' },
        WhatsApp: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', icon: '🟢' },
        Both:     { bg: '#faf5ff', color: '#7c3aed', border: '#e9d5ff', icon: '📡' },
    };
    const s = styles[channel] || styles.SMS;
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap"
            style={{ background: s.bg, color: s.color, borderColor: s.border }}>
            {s.icon} {channel}
        </span>
    );
}

export default function MessagingHubPage() {
    const [tab, setTab] = useState<'compose' | 'blast' | 'logs' | 'reminders' | 'config'>('compose');
    const [smsConfig, setSmsConfig] = useState<any>(null);
    const [waConfig, setWaConfig] = useState<any>(null);
    const [smsLogs, setSmsLogs] = useState<any[]>([]);
    const [reminderRules, setReminderRules] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [overdue, setOverdue] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [blasting, setBlasting] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);

    // Compose form
    const [message, setMessage] = useState('');
    const [selectedTenants, setSelectedTenants] = useState<number[]>([]);
    const [sendToAll, setSendToAll] = useState(false);
    const [sendToOverdue, setSendToOverdue] = useState(false);
    const [channel, setChannel] = useState<'SMS' | 'WhatsApp' | 'Both'>('SMS');
    const [messageType, setMessageType] = useState<'Custom' | 'Reminder' | 'Demand' | 'Welcome' | 'Penalty'>('Custom');

    // Blast form
    const [blastTemplate, setBlastTemplate] = useState('rent_reminder');
    const [blastChannel, setBlastChannel] = useState<'SMS' | 'WhatsApp' | 'Both'>('SMS');
    const [blastTarget, setBlastTarget] = useState<'overdue' | 'all'>('overdue');
    const [blastProgress, setBlastProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);

    // Config form
    const [apiKey, setApiKey] = useState('');
    const [username, setUsername] = useState('');
    const [senderId, setSenderId] = useState('');
    const [isSandbox, setIsSandbox] = useState(true);
    const [waPhoneNumberId, setWaPhoneNumberId] = useState('');
    const [waAccessToken, setWaAccessToken] = useState('');
    const [waBusinessId, setWaBusinessId] = useState('');

    // Reminder form
    const [showAddRule, setShowAddRule] = useState(false);
    const [ruleName, setRuleName] = useState('');
    const [triggerType, setTriggerType] = useState('before_due');
    const [daysOffset, setDaysOffset] = useState(3);
    const [ruleTemplate, setRuleTemplate] = useState('');
    const [ruleChannel, setRuleChannel] = useState<'SMS' | 'WhatsApp' | 'Both'>('SMS');

    // Logs
    const [search, setSearch] = useState('');
    const [logFilter, setLogFilter] = useState<'all' | 'SMS' | 'WhatsApp'>('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [config, logs, rules, tenantList, overdueList, msgConfig] = await Promise.all([
                getSMSConfig(),
                getSMSLogs({ limit: 500 }),
                getReminderRules(locId ?? undefined),
                getTenants(locId ?? undefined),
                getOverdueTenants(locId ?? undefined as any),
                getMessagingConfig(),
            ]);
            setSmsConfig(config);
            if (config) {
                setApiKey(config.api_key || '');
                setUsername(config.username || '');
                setSenderId(config.sender_id || '');
                setIsSandbox(config.is_sandbox ?? true);
            }
            if (msgConfig.whatsapp) {
                setWaConfig(msgConfig.whatsapp);
                setWaPhoneNumberId(msgConfig.whatsapp.phoneNumberId || '');
                setWaAccessToken(msgConfig.whatsapp.accessToken || '');
                setWaBusinessId(msgConfig.whatsapp.businessAccountId || '');
            }
            setSmsLogs(logs);
            setReminderRules(rules);
            setTenants(tenantList.filter((t: any) => t.status === 'Active'));
            setOverdue(overdueList);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setGlobalLocationId(lid);
        loadData(lid);
        const handler = (e: any) => { setGlobalLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    // ── Send a single SMS via AfricasTalking ─────────────────────────────────
    const sendSMS = async (phone: string, msg: string): Promise<{ success: boolean; cost?: number }> => {
        if (!smsConfig) return { success: false };
        const normalized = normalizePhoneKE(phone);
        const to = normalized.startsWith('254') ? `+${normalized}` : phone;
        try {
            const res = await fetch('/api/sms/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to, message: msg,
                    username: smsConfig.username,
                    apiKey: smsConfig.api_key,
                    senderId: smsConfig.sender_id,
                    isSandbox: smsConfig.is_sandbox,
                }),
            });
            const result = await res.json();
            return { success: result.success, cost: result.cost || 1.0 };
        } catch { return { success: false }; }
    };

    // ── Send a single WhatsApp message via Meta Cloud API ────────────────────
    const sendWhatsApp = async (phone: string, msg: string): Promise<{ success: boolean; messageId?: string }> => {
        if (!waConfig?.phoneNumberId || !waConfig?.accessToken) return { success: false };
        try {
            const res = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: phone,
                    message: msg,
                    phoneNumberId: waConfig.phoneNumberId,
                    accessToken: waConfig.accessToken,
                }),
            });
            const result = await res.json();
            return { success: result.success, messageId: result.messageId };
        } catch { return { success: false }; }
    };

    // ── Compose & Send ────────────────────────────────────────────────────────
    const handleSend = async () => {
        if (!message.trim()) return toast.error('Enter a message');
        const recipients = sendToOverdue ? overdue
            : sendToAll ? tenants
            : tenants.filter((t: any) => selectedTenants.includes(t.tenant_id));
        if (recipients.length === 0) return toast.error('Select at least one recipient');
        if (channel !== 'WhatsApp' && !smsConfig) return toast.error('Configure SMS settings first (Settings page)');
        if (channel !== 'SMS' && !waConfig?.phoneNumberId) return toast.error('Configure WhatsApp settings first (Settings page)');

        setSending(true);
        let sent = 0, failed = 0;

        for (const tenant of recipients) {
            if (!tenant.phone) { failed++; continue; }
            const vars = {
                name: tenant.tenant_name,
                unit: tenant.arms_units?.unit_name || '',
                balance: String(tenant.balance || 0),
                location: tenant.arms_locations?.location_name || '',
                due_date: '5th',
                phone: tenant.phone,
            };
            const personalizedMsg = fillTemplate(message, vars);

            // SMS
            if (channel === 'SMS' || channel === 'Both') {
                const result = await sendSMS(tenant.phone, personalizedMsg);
                await logSMS({
                    recipient_phone: tenant.phone,
                    recipient_name: tenant.tenant_name,
                    message: personalizedMsg,
                    message_type: messageType,
                    tenant_id: tenant.tenant_id,
                    location_id: globalLocationId || undefined,
                    status: result.success ? 'Sent' : 'Failed',
                    cost: result.cost || 0,
                    sent_by: 'Admin',
                });
                result.success ? sent++ : failed++;
            }

            // WhatsApp
            if (channel === 'WhatsApp' || channel === 'Both') {
                const result = await sendWhatsApp(tenant.phone, personalizedMsg);
                await logWhatsApp({
                    recipient_phone: tenant.phone,
                    recipient_name: tenant.tenant_name,
                    message: personalizedMsg,
                    message_type: messageType,
                    tenant_id: tenant.tenant_id,
                    location_id: globalLocationId || undefined,
                    status: result.success ? 'Sent' : 'Failed',
                    provider_message_id: result.messageId,
                    sent_by: 'Admin',
                });
                if (channel === 'WhatsApp') result.success ? sent++ : failed++;
            }
        }

        toast.success(`✅ ${channel}: Sent ${sent}${failed > 0 ? `, Failed ${failed}` : ''}`);
        setMessage(''); setSelectedTenants([]); setSendToAll(false); setSendToOverdue(false);
        loadData(globalLocationId);
        setSending(false);
    };

    // ── Bulk Blast ────────────────────────────────────────────────────────────
    const handleBlast = async () => {
        const recipients = blastTarget === 'overdue' ? overdue : tenants;
        if (recipients.length === 0) return toast.error('No recipients found');
        if (blastChannel !== 'WhatsApp' && !smsConfig) return toast.error('Configure SMS settings first');
        if (blastChannel !== 'SMS' && !waConfig?.phoneNumberId) return toast.error('Configure WhatsApp settings first');

        const templateText = MESSAGE_TEMPLATES[blastTemplate as keyof typeof MESSAGE_TEMPLATES] || '';
        if (!templateText) return toast.error('Select a template');

        setBlasting(true);
        setBlastProgress({ sent: 0, failed: 0, total: recipients.length });
        let sent = 0, failed = 0;

        for (const tenant of recipients) {
            if (!tenant.phone) { failed++; setBlastProgress({ sent, failed, total: recipients.length }); continue; }
            const vars = {
                name: tenant.tenant_name,
                unit: tenant.arms_units?.unit_name || '',
                balance: String(tenant.balance || 0),
                location: tenant.arms_locations?.location_name || '',
                due_date: '5th',
                phone: tenant.phone,
            };
            const msg = fillTemplate(templateText, vars);

            if (blastChannel === 'SMS' || blastChannel === 'Both') {
                const r = await sendSMS(tenant.phone, msg);
                await logSMS({ recipient_phone: tenant.phone, recipient_name: tenant.tenant_name, message: msg, message_type: 'Reminder', tenant_id: tenant.tenant_id, location_id: globalLocationId || undefined, status: r.success ? 'Sent' : 'Failed', cost: r.cost || 0, sent_by: 'Admin Blast' });
                r.success ? sent++ : failed++;
            }
            if (blastChannel === 'WhatsApp' || blastChannel === 'Both') {
                const r = await sendWhatsApp(tenant.phone, msg);
                await logWhatsApp({ recipient_phone: tenant.phone, recipient_name: tenant.tenant_name, message: msg, message_type: 'Reminder', tenant_id: tenant.tenant_id, location_id: globalLocationId || undefined, status: r.success ? 'Sent' : 'Failed', provider_message_id: r.messageId, sent_by: 'Admin Blast' });
                if (blastChannel === 'WhatsApp') r.success ? sent++ : failed++;
            }
            setBlastProgress({ sent, failed, total: recipients.length });
        }

        toast.success(`🚀 Blast complete! Sent: ${sent}, Failed: ${failed}`);
        setBlasting(false);
        loadData(globalLocationId);
    };

    // ── Save SMS Config ───────────────────────────────────────────────────────
    const handleSaveSMSConfig = async () => {
        try {
            await updateSMSConfig({ api_key: apiKey, username, sender_id: senderId, is_sandbox: isSandbox });
            toast.success('✅ SMS config saved');
            loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    // ── Save WhatsApp Config ──────────────────────────────────────────────────
    const handleSaveWAConfig = async () => {
        if (!waPhoneNumberId || !waAccessToken) return toast.error('Phone Number ID and Access Token are required');
        try {
            const { supabase } = await import('@/lib/supabase');
            // Save to arms_settings
            const fields = [
                { key: 'whatsapp_enabled', value: 'true' },
                { key: 'whatsapp_phone_number_id', value: waPhoneNumberId },
                { key: 'whatsapp_access_token', value: waAccessToken },
                { key: 'whatsapp_business_account_id', value: waBusinessId },
            ];
            for (const f of fields) {
                const { data: existing } = await supabase.from('arms_settings').select('setting_id').eq('setting_key', f.key).limit(1);
                if (existing && existing.length > 0) {
                    await supabase.from('arms_settings').update({ setting_value: f.value }).eq('setting_key', f.key);
                } else {
                    await supabase.from('arms_settings').insert({ setting_key: f.key, setting_value: f.value });
                }
            }
            toast.success('✅ WhatsApp config saved');
            loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    // ── Test WhatsApp ─────────────────────────────────────────────────────────
    const handleTestWhatsApp = async () => {
        if (!waPhoneNumberId || !waAccessToken) return toast.error('Save WhatsApp config first');
        const testPhone = prompt('Enter a phone number to test (e.g. 0720316175):');
        if (!testPhone) return;
        const res = await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: testPhone, message: '✅ ARMS WhatsApp test message. Your system is connected!', phoneNumberId: waPhoneNumberId, accessToken: waAccessToken }),
        });
        const result = await res.json();
        if (result.success) toast.success(`✅ WhatsApp test sent! Message ID: ${result.messageId}`);
        else toast.error(`❌ WhatsApp test failed: ${result.error}`);
    };

    // ── Test SMS ──────────────────────────────────────────────────────────────
    const handleTestSMS = async () => {
        if (!smsConfig) return toast.error('Save SMS config first');
        const testPhone = prompt('Enter a phone number to test (e.g. 0720316175):');
        if (!testPhone) return;
        const result = await sendSMS(testPhone, '✅ ARMS SMS test message. Your system is connected!');
        if (result.success) toast.success('✅ SMS test sent!');
        else toast.error('❌ SMS test failed. Check your API key and username.');
    };

    // ── Add Reminder Rule ─────────────────────────────────────────────────────
    const handleAddRule = async () => {
        if (!ruleName || !ruleTemplate) return toast.error('Fill all fields');
        try {
            await addReminderRule({ rule_name: ruleName, trigger_type: triggerType, days_offset: daysOffset, message_template: ruleTemplate, location_id: globalLocationId || undefined });
            toast.success('✅ Reminder rule added');
            setShowAddRule(false); setRuleName(''); setRuleTemplate('');
            loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const toggleTenant = (id: number) => setSelectedTenants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    // ── Derived stats ─────────────────────────────────────────────────────────
    const smsSent = smsLogs.filter(l => l.provider !== 'WhatsApp' && l.status === 'Sent').length;
    const waSent = smsLogs.filter(l => l.provider === 'WhatsApp' && l.status === 'Sent').length;
    const totalFailed = smsLogs.filter(l => l.status === 'Failed').length;
    const totalCost = smsLogs.filter(l => l.provider !== 'WhatsApp').reduce((s, l) => s + (l.cost || 0), 0);

    const filteredLogs = useMemo(() => {
        let items = [...smsLogs];
        if (logFilter === 'SMS') items = items.filter(l => l.provider !== 'WhatsApp');
        if (logFilter === 'WhatsApp') items = items.filter(l => l.provider === 'WhatsApp');
        if (search) {
            const s = search.toLowerCase();
            items = items.filter(l => l.recipient_name?.toLowerCase().includes(s) || l.recipient_phone?.includes(s) || l.message?.toLowerCase().includes(s));
        }
        return items;
    }, [smsLogs, search, logFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
    const paginatedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);

    const smsConfigured = !!(smsConfig?.api_key && smsConfig?.username);
    const waConfigured = !!(waConfig?.phoneNumberId && waConfig?.accessToken);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>📡</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading Messaging Hub…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            {/* ── Header ── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title">📡 Messaging Hub</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        SMS via AfricasTalking · WhatsApp via Meta Business API · {overdue.length} overdue tenants
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Channel status badges */}
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${smsConfigured ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                        💬 SMS {smsConfigured ? '✅' : '⚠️ Not configured'}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${waConfigured ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                        🟢 WhatsApp {waConfigured ? '✅' : '⚠️ Not configured'}
                    </span>
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition">
                        <FiRefreshCw size={15} />
                    </button>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Active Tenants', value: tenants.length, emoji: '👤', color: '#6366f1', bg: '#eef2ff', sub: 'Can receive messages' },
                    { label: 'Overdue', value: overdue.length, emoji: '⏰', color: '#ef4444', bg: '#fef2f2', sub: 'Need reminders', pulse: overdue.length > 0 },
                    { label: 'SMS Sent', value: smsSent, emoji: '💬', color: '#4338ca', bg: '#eef2ff', sub: 'Via AfricasTalking' },
                    { label: 'WhatsApp Sent', value: waSent, emoji: '🟢', color: '#15803d', bg: '#f0fdf4', sub: 'Via Meta API' },
                    { label: 'SMS Cost', value: fmt(totalCost), emoji: '💰', color: '#c2410c', bg: '#fff7ed', sub: 'Total spend' },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <span className="text-xl">{card.emoji}</span>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        {(card as any).pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: card.color }} />}
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* ── Tab Navigation ── */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl flex-wrap">
                {[
                    { k: 'compose', l: '✉️ Compose' },
                    { k: 'blast', l: '🚀 Bulk Blast' },
                    { k: 'logs', l: '📋 History' },
                    { k: 'reminders', l: '⏰ Auto-Reminders' },
                    { k: 'config', l: '⚙️ Config' },
                ].map(t => (
                    <button key={t.k} onClick={() => setTab(t.k as any)}
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === t.k ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t.l}
                    </button>
                ))}
            </div>

            {/* ══════════════════ TAB: COMPOSE ══════════════════ */}
            {tab === 'compose' && (
                <div className="grid grid-cols-3 gap-5">
                    {/* Compose Panel */}
                    <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <FiSend size={18} className="text-white" />
                            <div>
                                <h3 className="text-sm font-bold text-white">Compose Message</h3>
                                <p className="text-white/60 text-[10px]">Use {'{name}'}, {'{unit}'}, {'{balance}'}, {'{location}'}, {'{due_date}'} as placeholders</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Channel selector */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">📡 Send Via</label>
                                <div className="flex gap-2">
                                    {(['SMS', 'WhatsApp', 'Both'] as const).map(ch => (
                                        <button key={ch} onClick={() => setChannel(ch)}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border ${channel === ch ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-200'}`}>
                                            {ch === 'SMS' ? '💬' : ch === 'WhatsApp' ? '🟢' : '📡'} {ch}
                                            {ch === 'SMS' && !smsConfigured && <span className="text-[9px] opacity-70">⚠️</span>}
                                            {ch !== 'SMS' && !waConfigured && <span className="text-[9px] opacity-70">⚠️</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quick templates */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">⚡ Quick Templates</label>
                                <div className="flex flex-wrap gap-2">
                                    {QUICK_TEMPLATES.map(t => (
                                        <button key={t.key} onClick={() => {
                                            const tmpl = MESSAGE_TEMPLATES[t.key as keyof typeof MESSAGE_TEMPLATES] || '';
                                            setMessage(tmpl);
                                            setMessageType(t.key.includes('demand') ? 'Demand' : t.key.includes('welcome') ? 'Welcome' : t.key.includes('penalty') ? 'Penalty' : 'Reminder');
                                        }}
                                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition hover:opacity-80 text-white"
                                            style={{ background: t.color }}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Message type */}
                            <div className="flex gap-2">
                                {(['Custom', 'Reminder', 'Demand', 'Welcome', 'Penalty'] as const).map(t => (
                                    <button key={t} onClick={() => setMessageType(t)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${messageType === t ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                        {t}
                                    </button>
                                ))}
                            </div>

                            {/* Message textarea */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Message ({message.length}/1000)</label>
                                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} className="input-field mt-1"
                                    placeholder="Dear {name}, your rent for {unit} of KES {balance} is due by the {due_date}. Please pay promptly. - ARMS" />
                            </div>

                            {/* Recipient quick-select */}
                            <div className="flex gap-3 flex-wrap">
                                <button onClick={() => { setSendToAll(!sendToAll); setSendToOverdue(false); }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition border ${sendToAll ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                    <FiUsers size={12} /> All Tenants ({tenants.length})
                                </button>
                                <button onClick={() => { setSendToOverdue(!sendToOverdue); setSendToAll(false); }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition border ${sendToOverdue ? 'bg-red-600 text-white border-red-600' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                    <FiAlertTriangle size={12} /> Overdue Only ({overdue.length})
                                </button>
                                {selectedTenants.length > 0 && (
                                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                        ✓ {selectedTenants.length} selected
                                    </span>
                                )}
                            </div>

                            <button onClick={handleSend} disabled={sending}
                                className="w-full py-3 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                {sending ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <FiSend size={14} />}
                                {sending ? 'Sending…' : `Send ${channel} to ${sendToOverdue ? overdue.length : sendToAll ? tenants.length : selectedTenants.length} recipients`}
                            </button>
                        </div>
                    </div>

                    {/* Recipient Picker */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">👤 Pick Recipients</p>
                            <span className="text-[10px] font-bold text-indigo-600">{selectedTenants.length} selected</span>
                        </div>
                        <div className="max-h-[480px] overflow-y-auto p-2 space-y-1">
                            {tenants.map((t: any) => {
                                const isSelected = selectedTenants.includes(t.tenant_id);
                                const hasArrears = (t.balance || 0) > 0;
                                return (
                                    <button key={t.tenant_id} onClick={() => toggleTenant(t.tenant_id)}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs transition-all ${isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                                            {isSelected && <FiCheck size={10} className="text-white" />}
                                        </div>
                                        <TenantAvatar name={t.tenant_name} size={28} />
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="font-bold text-gray-800 truncate">{t.tenant_name}</p>
                                            <p className="text-[10px] text-gray-400 truncate">{t.arms_units?.unit_name} · {t.phone}</p>
                                        </div>
                                        {hasArrears && <span className="text-[10px] font-bold text-red-500 flex-shrink-0">⚠️ {fmt(t.balance)}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB: BULK BLAST ══════════════════ */}
            {tab === 'blast' && (
                <div className="grid grid-cols-2 gap-5">
                    {/* Blast Config */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <FiZap size={18} className="text-white" />
                            <div>
                                <h3 className="text-sm font-bold text-white">🚀 Bulk Blast</h3>
                                <p className="text-white/60 text-[10px]">Send templated messages to all overdue or all tenants at once</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Target */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">🎯 Target Audience</label>
                                <div className="flex gap-2">
                                    <button onClick={() => setBlastTarget('overdue')}
                                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition border ${blastTarget === 'overdue' ? 'bg-red-600 text-white border-red-600' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                        ⏰ Overdue ({overdue.length})
                                    </button>
                                    <button onClick={() => setBlastTarget('all')}
                                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition border ${blastTarget === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                        👥 All Active ({tenants.length})
                                    </button>
                                </div>
                            </div>

                            {/* Channel */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">📡 Channel</label>
                                <div className="flex gap-2">
                                    {(['SMS', 'WhatsApp', 'Both'] as const).map(ch => (
                                        <button key={ch} onClick={() => setBlastChannel(ch)}
                                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition border ${blastChannel === ch ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                            {ch === 'SMS' ? '💬' : ch === 'WhatsApp' ? '🟢' : '📡'} {ch}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Template */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">📝 Message Template</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {QUICK_TEMPLATES.map(t => (
                                        <button key={t.key} onClick={() => setBlastTemplate(t.key)}
                                            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition border text-left ${blastTemplate === t.key ? 'text-white border-transparent shadow' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-200'}`}
                                            style={blastTemplate === t.key ? { background: t.color } : {}}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Preview */}
                            {blastTemplate && (
                                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Preview</p>
                                    <p className="text-xs text-gray-700 leading-relaxed">
                                        {MESSAGE_TEMPLATES[blastTemplate as keyof typeof MESSAGE_TEMPLATES] || ''}
                                    </p>
                                </div>
                            )}

                            {/* Progress */}
                            {blastProgress && (
                                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-bold text-indigo-700">Sending… {blastProgress.sent + blastProgress.failed}/{blastProgress.total}</p>
                                        <p className="text-xs text-indigo-600">✅ {blastProgress.sent} · ❌ {blastProgress.failed}</p>
                                    </div>
                                    <div className="w-full bg-indigo-200 rounded-full h-2">
                                        <div className="bg-indigo-600 h-2 rounded-full transition-all"
                                            style={{ width: `${Math.round(((blastProgress.sent + blastProgress.failed) / blastProgress.total) * 100)}%` }} />
                                    </div>
                                </div>
                            )}

                            <button onClick={handleBlast} disabled={blasting}
                                className="w-full py-3 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                                {blasting ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <FiZap size={14} />}
                                {blasting ? 'Blasting…' : `🚀 Blast to ${blastTarget === 'overdue' ? overdue.length : tenants.length} tenants`}
                            </button>
                        </div>
                    </div>

                    {/* Overdue Tenants Preview */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">⏰ Overdue Tenants</p>
                            <span className="text-[10px] font-bold text-red-600">{overdue.length} tenants</span>
                        </div>
                        <div className="max-h-[520px] overflow-y-auto p-2 space-y-1">
                            {overdue.length === 0 ? (
                                <div className="py-12 text-center text-gray-400">
                                    <span className="text-4xl block mb-2">🎉</span>
                                    <p className="text-sm font-medium">No overdue tenants!</p>
                                    <p className="text-xs">All tenants are up to date</p>
                                </div>
                            ) : overdue.map((t: any) => (
                                <div key={t.tenant_id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
                                    <TenantAvatar name={t.tenant_name} size={32} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-800 text-xs truncate">{t.tenant_name}</p>
                                        <p className="text-[10px] text-gray-500 truncate">{t.arms_units?.unit_name} · {t.phone}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-xs font-black text-red-600">{fmt(t.balance)}</p>
                                        <p className="text-[10px] text-red-400">overdue</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB: HISTORY ══════════════════ */}
            {tab === 'logs' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[220px]">
                                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                                    placeholder="Search recipient, phone, message…"
                                    className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all" />
                                {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                            </div>
                            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                                {[{ k: 'all', l: 'All' }, { k: 'SMS', l: '💬 SMS' }, { k: 'WhatsApp', l: '🟢 WhatsApp' }].map(f => (
                                    <button key={f.k} onClick={() => { setLogFilter(f.k as any); setPage(1); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${logFilter === f.k ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                                        {f.l}
                                    </button>
                                ))}
                            </div>
                            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            <p className="ml-auto text-xs font-bold text-gray-400">{filteredLogs.length} messages</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr>
                                        {[
                                            { label: '#', col: C.num }, { label: '📅 Date', col: C.date },
                                            { label: '👤 Recipient', col: C.name }, { label: '📞 Phone', col: C.phone },
                                            { label: '📡 Channel', col: C.channel }, { label: '🏷️ Type', col: C.type },
                                            { label: '💬 Message', col: C.message }, { label: '✅ Status', col: C.status },
                                            { label: '💰 Cost', col: C.cost },
                                        ].map((h, i) => (
                                            <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                                style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>
                                                {h.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedLogs.length === 0 ? (
                                        <tr><td colSpan={9} className="text-center py-16 text-gray-400">
                                            <div className="flex flex-col items-center gap-2"><span className="text-5xl">📡</span><p className="text-sm font-medium">No messages yet</p><p className="text-xs">Send your first message above</p></div>
                                        </td></tr>
                                    ) : paginatedLogs.map((s, idx) => (
                                        <tr key={s.sms_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                            <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{(page - 1) * pageSize + idx + 1}</td>
                                            <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>
                                                {new Date(s.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                <p className="text-[10px] text-gray-400">{new Date(s.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p>
                                            </td>
                                            <td className="px-3 py-3" style={{ background: C.name.bg + '60' }}>
                                                <div className="flex items-center gap-2"><TenantAvatar name={s.recipient_name || '?'} size={28} /><span className="font-bold text-gray-800">{s.recipient_name || '—'}</span></div>
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap font-medium" style={{ background: C.phone.bg + '60', color: C.phone.text }}>{s.recipient_phone}</td>
                                            <td className="px-3 py-3" style={{ background: C.channel.bg + '60' }}>
                                                <ChannelBadge channel={(s.provider === 'WhatsApp' ? 'WhatsApp' : 'SMS') as any} />
                                            </td>
                                            <td className="px-3 py-3" style={{ background: C.type.bg + '60' }}>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">{s.message_type || 'Custom'}</span>
                                            </td>
                                            <td className="px-3 py-3 max-w-[200px]" style={{ background: C.message.bg + '60', color: C.message.text }}>
                                                <p className="truncate text-xs">{s.message}</p>
                                            </td>
                                            <td className="px-3 py-3" style={{ background: C.status.bg + '60' }}>
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${s.status === 'Sent' ? 'bg-green-50 text-green-700 border-green-200' : s.status === 'Failed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                    {s.status === 'Sent' ? '✅' : s.status === 'Failed' ? '❌' : '⏳'} {s.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ background: C.cost.bg + '60', color: C.cost.text }}>
                                                {s.provider === 'WhatsApp' ? '—' : fmt(s.cost || 0)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {filteredLogs.length > 0 && (
                            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                                <p className="text-xs text-gray-400">{Math.min((page - 1) * pageSize + 1, filteredLogs.length)}–{Math.min(page * pageSize, filteredLogs.length)} of {filteredLogs.length}</p>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronLeft size={14} /></button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map((p) => (
                                        <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-indigo-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                                    ))}
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronRight size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB: AUTO-REMINDERS ══════════════════ */}
            {tab === 'reminders' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">⏰ Automated Reminder Rules</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Rules define when and what to send. Click "Run Reminders Now" to trigger them manually.</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowAddRule(true)} className="btn-primary flex items-center gap-2"><FiPlus size={14} /> Add Rule</button>
                        </div>
                    </div>

                    {/* Info banner */}
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-3">
                        <FiInfo size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-blue-800">How Automated Reminders Work</p>
                            <p className="text-xs text-blue-700 mt-1">
                                Rules are stored here. Since this app runs on Vercel, reminders are triggered manually by clicking "Run Reminders Now" below,
                                or you can set up a Vercel Cron Job at <code className="bg-blue-100 px-1 rounded">/api/reminders/run</code> to run daily at 8am.
                            </p>
                        </div>
                    </div>

                    {/* Reminder rules list */}
                    <div className="space-y-3">
                        {reminderRules.length === 0 ? (
                            <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center text-gray-400">
                                <span className="text-5xl block mb-3">⏰</span>
                                <p className="text-sm font-medium">No reminder rules yet</p>
                                <p className="text-xs mt-1">Add rules to automate rent reminders</p>
                            </div>
                        ) : reminderRules.map(r => (
                            <div key={r.rule_id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`}
                                    style={r.is_active ? { background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff' } : { background: '#f1f5f9', color: '#94a3b8' }}>
                                    <FiClock size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-800 text-sm">{r.rule_name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {r.trigger_type === 'before_due' ? `${r.days_offset} days before due date` :
                                         r.trigger_type === 'after_due' ? `${r.days_offset} days after due date` :
                                         r.trigger_type === 'on_due' ? 'On due date' : r.trigger_type}
                                    </p>
                                    <p className="text-[11px] text-gray-400 mt-1 truncate">{r.message_template}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${r.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                        {r.is_active ? '✅ Active' : '⏸️ Paused'}
                                    </span>
                                    <button onClick={() => updateReminderRule(r.rule_id, { is_active: !r.is_active }).then(() => loadData(globalLocationId))}
                                        className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition">
                                        {r.is_active ? <FiToggleRight size={16} className="text-green-600" /> : <FiToggleLeft size={16} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add Rule Modal */}
                    {showAddRule && (
                        <div className="modal-overlay" onClick={() => setShowAddRule(false)}>
                            <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                                <div className="px-6 py-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}>
                                    <h2 className="text-lg font-bold text-white">⏰ Add Reminder Rule</h2>
                                    <button onClick={() => setShowAddRule(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Rule Name</label>
                                        <input value={ruleName} onChange={e => setRuleName(e.target.value)} className="input-field" placeholder="e.g. 3-Day Before Due Reminder" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Trigger</label>
                                            <select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="select-field">
                                                <option value="before_due">Before Due Date</option>
                                                <option value="on_due">On Due Date</option>
                                                <option value="after_due">After Due Date</option>
                                                <option value="monthly">Monthly (1st)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Days Offset</label>
                                            <input type="number" value={daysOffset} onChange={e => setDaysOffset(parseInt(e.target.value))} className="input-field" min={0} max={30} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Message Template</label>
                                        <textarea value={ruleTemplate} onChange={e => setRuleTemplate(e.target.value)} className="input-field" rows={3}
                                            placeholder="Dear {name}, your rent for {unit} of KES {balance} is due by the {due_date}. - ARMS" />
                                        <p className="text-[10px] text-gray-400 mt-1">Placeholders: {'{name}'}, {'{unit}'}, {'{balance}'}, {'{due_date}'}, {'{location}'}</p>
                                    </div>
                                    <div className="flex gap-3 justify-end pt-2">
                                        <button onClick={() => setShowAddRule(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                                        <button onClick={handleAddRule} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}>
                                            <FiSave size={14} /> Save Rule
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ TAB: CONFIG ══════════════════ */}
            {tab === 'config' && (
                <div className="grid grid-cols-2 gap-5">
                    {/* SMS Config */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <FiMessageSquare size={18} className="text-white" />
                            <div>
                                <h3 className="text-sm font-bold text-white">💬 AfricasTalking SMS</h3>
                                <p className="text-white/60 text-[10px]">Bulk SMS for Kenya, Uganda, Tanzania & more</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                                <p className="text-xs text-indigo-700 font-semibold">
                                    💡 Get your API key at <a href="https://africastalking.com" target="_blank" rel="noopener noreferrer" className="underline">africastalking.com</a>.
                                    Use <strong>sandbox</strong> for testing (free), switch to <strong>live</strong> for production.
                                </p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔑 API Key</label>
                                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="input-field" placeholder="Your AfricasTalking API Key" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">👤 Username</label>
                                <input value={username} onChange={e => setUsername(e.target.value)} className="input-field" placeholder="sandbox (for testing) or your AT username" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📤 Sender ID</label>
                                <input value={senderId} onChange={e => setSenderId(e.target.value)} className="input-field" placeholder="ARMS (must be registered with AT)" />
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
                                <button onClick={() => setIsSandbox(!isSandbox)}
                                    className={`relative w-10 h-5 rounded-full transition-colors ${isSandbox ? 'bg-amber-400' : 'bg-green-500'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isSandbox ? 'left-0.5' : 'left-5'}`} />
                                </button>
                                <div>
                                    <p className="text-xs font-bold text-gray-700">{isSandbox ? '🧪 Sandbox Mode' : '🚀 Live Mode'}</p>
                                    <p className="text-[10px] text-gray-400">{isSandbox ? 'Messages go to AT simulator, not real phones' : 'Real SMS sent to actual phone numbers'}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSaveSMSConfig}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                                    style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
                                    <FiSave size={14} /> Save SMS Config
                                </button>
                                <button onClick={handleTestSMS}
                                    className="px-4 py-2.5 rounded-xl text-sm font-bold border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition flex items-center gap-2">
                                    <FiZap size={14} /> Test
                                </button>
                            </div>
                            {smsConfigured && (
                                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 border border-green-200">
                                    <FiCheck size={14} className="text-green-600" />
                                    <p className="text-xs font-bold text-green-700">SMS configured · {isSandbox ? 'Sandbox' : 'Live'} mode</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* WhatsApp Config */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#15803d,#22c55e)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <FiMessageSquare size={18} className="text-white" />
                            <div>
                                <h3 className="text-sm font-bold text-white">🟢 WhatsApp Business API</h3>
                                <p className="text-white/60 text-[10px]">Meta Cloud API — send messages directly to tenants</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="p-3 rounded-xl bg-green-50 border border-green-100">
                                <p className="text-xs text-green-800 font-semibold mb-1">📋 Setup Steps:</p>
                                <ol className="text-xs text-green-700 space-y-0.5 list-decimal list-inside">
                                    <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">developers.facebook.com</a></li>
                                    <li>Create a Meta App → Add WhatsApp product</li>
                                    <li>Get your Phone Number ID from the dashboard</li>
                                    <li>Generate a Permanent Access Token</li>
                                    <li>Add your business phone number</li>
                                </ol>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📱 Phone Number ID</label>
                                <input value={waPhoneNumberId} onChange={e => setWaPhoneNumberId(e.target.value)} className="input-field" placeholder="123456789012345 (from Meta Developer Console)" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔑 Permanent Access Token</label>
                                <input type="password" value={waAccessToken} onChange={e => setWaAccessToken(e.target.value)} className="input-field" placeholder="EAAxxxxxxxx... (generate in Meta App settings)" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏢 Business Account ID (WABA ID)</label>
                                <input value={waBusinessId} onChange={e => setWaBusinessId(e.target.value)} className="input-field" placeholder="123456789012345 (optional)" />
                            </div>
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                                <p className="text-xs text-amber-800 font-semibold">⚠️ Important Note</p>
                                <p className="text-xs text-amber-700 mt-1">
                                    Free-form messages only work within 24 hours of a tenant messaging you first.
                                    For proactive reminders, you need approved <strong>Message Templates</strong> in Meta Business Manager.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSaveWAConfig}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                                    style={{ background: 'linear-gradient(135deg,#15803d,#22c55e)' }}>
                                    <FiSave size={14} /> Save WhatsApp Config
                                </button>
                                <button onClick={handleTestWhatsApp}
                                    className="px-4 py-2.5 rounded-xl text-sm font-bold border border-green-200 text-green-700 hover:bg-green-50 transition flex items-center gap-2">
                                    <FiZap size={14} /> Test
                                </button>
                            </div>
                            {waConfigured && (
                                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 border border-green-200">
                                    <FiCheck size={14} className="text-green-600" />
                                    <p className="text-xs font-bold text-green-700">WhatsApp configured · Phone ID: {waPhoneNumberId.slice(0, 8)}…</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
