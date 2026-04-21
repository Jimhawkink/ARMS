'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSMSConfig, updateSMSConfig, getSMSLogs, logSMS, getReminderRules, addReminderRule, updateReminderRule, getOverdueTenants, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiSend, FiMessageSquare, FiSettings, FiClock, FiUsers, FiAlertTriangle, FiCheck, FiX, FiRefreshCw, FiPlus, FiSearch, FiChevronLeft, FiChevronRight, FiSave } from 'react-icons/fi';

// ── Color tokens per column ────────────────────────────────────────────────────
const C = {
    num:      { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date:     { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    name:     { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    phone:    { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    type:     { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    message:  { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    status:   { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    cost:     { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    actions:  { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
};

const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

// ── Avatar with gradient initials ─────────────────────────────────────────────
function TenantAvatar({ name, size = 34 }: { name: string; size?: number }) {
    const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
    const GRADIENTS = [
        'linear-gradient(135deg,#6366f1,#8b5cf6)', 'linear-gradient(135deg,#0891b2,#06b6d4)',
        'linear-gradient(135deg,#059669,#10b981)', 'linear-gradient(135deg,#d97706,#f59e0b)',
        'linear-gradient(135deg,#dc2626,#ef4444)', 'linear-gradient(135deg,#7c3aed,#a855f7)',
    ];
    const idx = (name || '').charCodeAt(0) % GRADIENTS.length;
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: GRADIENTS[idx], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: size * 0.35, letterSpacing: 0.5, flexShrink: 0, boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }}>
            {initials}
        </div>
    );
}

export default function SMSPage() {
    const [tab, setTab] = useState<'send' | 'logs' | 'reminders' | 'config'>('send');
    const [smsConfig, setSmsConfig] = useState<any>(null);
    const [smsLogs, setSmsLogs] = useState<any[]>([]);
    const [reminderRules, setReminderRules] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [overdue, setOverdue] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);

    // SMS form
    const [message, setMessage] = useState('');
    const [selectedTenants, setSelectedTenants] = useState<number[]>([]);
    const [sendToAll, setSendToAll] = useState(false);
    const [sendToOverdue, setSendToOverdue] = useState(false);
    const [messageType, setMessageType] = useState<'Custom' | 'Reminder' | 'Demand'>('Custom');

    // Config form
    const [apiKey, setApiKey] = useState('');
    const [username, setUsername] = useState('');
    const [senderId, setSenderId] = useState('');
    const [isSandbox, setIsSandbox] = useState(true);

    // Reminder form
    const [showAddRule, setShowAddRule] = useState(false);
    const [ruleName, setRuleName] = useState('');
    const [triggerType, setTriggerType] = useState('before_due');
    const [daysOffset, setDaysOffset] = useState(3);
    const [ruleTemplate, setRuleTemplate] = useState('');

    // Search & pagination for logs
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        const handler = (e: any) => setGlobalLocationId(e.detail);
        const saved = localStorage.getItem('arms_location');
        if (saved) setGlobalLocationId(parseInt(saved));
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, []);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [config, logs, rules, tenantList, overdueList] = await Promise.all([
                getSMSConfig(),
                getSMSLogs({ limit: 200 }),
                getReminderRules(locId ?? undefined),
                getTenants(locId ?? undefined),
                getOverdueTenants(locId ?? undefined as any),
            ]);
            setSmsConfig(config);
            if (config) { setApiKey(config.api_key || ''); setUsername(config.username || ''); setSenderId(config.sender_id || ''); setIsSandbox(config.is_sandbox ?? true); }
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

    const handleSaveConfig = async () => {
        try {
            await updateSMSConfig({ api_key: apiKey, username, sender_id: senderId, is_sandbox: isSandbox });
            toast.success('✅ SMS config saved');
            loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const handleSendSMS = async () => {
        if (!message.trim()) return toast.error('Enter a message');
        if (!smsConfig) return toast.error('Configure SMS settings first');
        const recipients = sendToOverdue ? overdue : sendToAll ? tenants : tenants.filter((t: any) => selectedTenants.includes(t.tenant_id));
        if (recipients.length === 0) return toast.error('Select recipients');
        setSending(true);
        let sent = 0, failed = 0;
        for (const tenant of recipients) {
            const phone = tenant.phone?.replace(/^0/, '+254') || tenant.phone;
            if (!phone) { failed++; continue; }
            try {
                const res = await fetch('/api/sms/send', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: phone, message: message.replace('{name}', tenant.tenant_name).replace('{unit}', tenant.arms_units?.unit_name || '').replace('{balance}', String(tenant.balance || 0)), username: smsConfig.username, apiKey: smsConfig.api_key, senderId: smsConfig.sender_id, isSandbox: smsConfig.is_sandbox }),
                });
                const result = await res.json();
                if (result.success) {
                    await logSMS({ recipient_phone: phone, recipient_name: tenant.tenant_name, message: message.replace('{name}', tenant.tenant_name).replace('{unit}', tenant.arms_units?.unit_name || '').replace('{balance}', String(tenant.balance || 0)), message_type: messageType, tenant_id: tenant.tenant_id, location_id: globalLocationId || undefined, status: 'Sent', cost: result.cost || 1.0, sent_by: 'Admin' });
                    sent++;
                } else {
                    await logSMS({ recipient_phone: phone, recipient_name: tenant.tenant_name, message, message_type: messageType, tenant_id: tenant.tenant_id, status: 'Failed', sent_by: 'Admin' });
                    failed++;
                }
            } catch { failed++; }
        }
        toast.success(`✅ Sent: ${sent}${failed > 0 ? `, Failed: ${failed}` : ''}`);
        setMessage(''); setSelectedTenants([]); setSendToAll(false); setSendToOverdue(false);
        loadData(globalLocationId);
        setSending(false);
    };

    const handleAddRule = async () => {
        if (!ruleName || !ruleTemplate) return toast.error('Fill all fields');
        try {
            await addReminderRule({ rule_name: ruleName, trigger_type: triggerType, days_offset: daysOffset, message_template: ruleTemplate, location_id: globalLocationId || undefined });
            toast.success('✅ Rule added');
            setShowAddRule(false); setRuleName(''); setRuleTemplate('');
            loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const toggleTenant = (id: number) => setSelectedTenants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    // ── Derived data ──────────────────────────────────────────────────────────
    const sentCount = smsLogs.filter(l => l.status === 'Sent').length;
    const failedCount = smsLogs.filter(l => l.status === 'Failed').length;
    const totalCost = smsLogs.reduce((s, l) => s + (l.cost || 0), 0);

    const filteredLogs = useMemo(() => {
        let items = [...smsLogs];
        if (search) { const s = search.toLowerCase(); items = items.filter(l => l.recipient_name?.toLowerCase().includes(s) || l.recipient_phone?.includes(s) || l.message?.toLowerCase().includes(s)); }
        return items;
    }, [smsLogs, search]);

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
    const paginatedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>📱</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading SMS…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            {/* ── Header ── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title">📱 SMS & Communication</h1>
                    <p className="text-sm text-gray-500 mt-1">AfricasTalking bulk SMS • Automated reminders • {overdue.length} overdue</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition"><FiRefreshCw size={15} /></button>
                </div>
            </div>

            {/* ── KPI Summary Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Active Tenants', value: tenants.length, emoji: '👤', color: '#6366f1', bg: '#eef2ff', sub: 'SMS eligible', pulse: false },
                    { label: 'Overdue', value: overdue.length, emoji: '⏰', color: '#ef4444', bg: '#fef2f2', sub: 'Need reminders', pulse: overdue.length > 0 },
                    { label: 'SMS Sent', value: sentCount, emoji: '✉️', color: '#059669', bg: '#f0fdf4', sub: 'Total delivered', pulse: false },
                    { label: 'Failed', value: failedCount, emoji: '❌', color: '#dc2626', bg: '#fef2f2', sub: 'Delivery failed', pulse: failedCount > 0 },
                    { label: 'Total Cost', value: fmt(totalCost), emoji: '💰', color: '#c2410c', bg: '#fff7ed', sub: 'SMS spend', pulse: false },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <span className="text-xl">{card.emoji}</span>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        {card.pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: card.color }} />}
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* ── Tab Navigation ── */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {[{ k: 'send', l: '✉️ Send SMS' }, { k: 'logs', l: '📋 History' }, { k: 'reminders', l: '⏰ Reminders' }, { k: 'config', l: '⚙️ Config' } as const].map(t => (
                    <button key={t.k} onClick={() => setTab(t.k as any)}
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === t.k ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t.l}
                    </button>
                ))}
            </div>

            {/* ══════════════════ TAB: SEND SMS ══════════════════ */}
            {tab === 'send' && (
                <div className="grid grid-cols-3 gap-5">
                    {/* Compose */}
                    <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <FiSend size={18} className="text-white" />
                            <div>
                                <h3 className="text-sm font-bold text-white">Compose Message</h3>
                                <p className="text-white/60 text-[10px]">Use {'{name}'}, {'{unit}'}, {'{balance}'} as placeholders</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex gap-2">
                                {['Custom', 'Reminder', 'Demand'].map(t => (
                                    <button key={t} onClick={() => setMessageType(t as any)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${messageType === t ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                        {t === 'Custom' ? '✉️' : t === 'Reminder' ? '⏰' : '📜'} {t}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Message ({message.length}/160)</label>
                                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} className="input-field mt-1" placeholder="Dear {name}, your rent for {unit} of KES {balance} is due. Please pay by 5th. - ARMS" />
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => { setSendToAll(!sendToAll); setSendToOverdue(false); }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${sendToAll ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                    <FiUsers size={12} /> All Tenants ({tenants.length})
                                </button>
                                <button onClick={() => { setSendToOverdue(!sendToOverdue); setSendToAll(false); }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${sendToOverdue ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                    <FiAlertTriangle size={12} /> Overdue ({overdue.length})
                                </button>
                            </div>
                            <button onClick={handleSendSMS} disabled={sending}
                                className="w-full py-3 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                {sending ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <FiSend size={14} />}
                                Send SMS to {sendToOverdue ? overdue.length : sendToAll ? tenants.length : selectedTenants.length} recipients
                            </button>
                        </div>
                    </div>

                    {/* Recipient List */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">👤 Select Recipients</p>
                            <span className="text-[10px] font-bold text-indigo-600">{selectedTenants.length} selected</span>
                        </div>
                        <div className="max-h-[420px] overflow-y-auto p-2 space-y-1">
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
                                            <p className="text-[10px] text-gray-400">{t.arms_units?.unit_name} · 📍 {t.arms_locations?.location_name}</p>
                                        </div>
                                        {hasArrears && <span className="text-[10px] font-bold text-red-500 flex-shrink-0">⚠️ {fmt(t.balance)}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB: SMS HISTORY ══════════════════ */}
            {tab === 'logs' && (
                <div className="space-y-4">
                    {/* Search */}
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[220px]">
                                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                                    placeholder="Search recipient, phone, message…"
                                    className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all" />
                                {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                            </div>
                            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            <p className="ml-auto text-xs font-bold text-gray-400">{filteredLogs.length} results</p>
                        </div>
                    </div>

                    {/* Ultra DataGrid */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr>
                                        {[
                                            { label: '#', col: C.num }, { label: '📅 Date', col: C.date }, { label: '👤 Recipient', col: C.name },
                                            { label: '📞 Phone', col: C.phone }, { label: '🏷️ Type', col: C.type }, { label: '💬 Message', col: C.message },
                                            { label: '✅ Status', col: C.status }, { label: '💰 Cost', col: C.cost },
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
                                        <tr><td colSpan={8} className="text-center py-16 text-gray-400">
                                            <div className="flex flex-col items-center gap-2"><span className="text-5xl">📱</span><p className="text-sm font-medium">No SMS logs found</p><p className="text-xs">Send your first SMS above</p></div>
                                        </td></tr>
                                    ) : paginatedLogs.map((s, idx) => (
                                        <tr key={s.sms_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                            <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{(page - 1) * pageSize + idx + 1}</td>
                                            <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{new Date(s.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                            <td className="px-3 py-3" style={{ background: C.name.bg + '60' }}>
                                                <div className="flex items-center gap-2"><TenantAvatar name={s.recipient_name || '?'} size={28} /><span className="font-bold text-gray-800">{s.recipient_name || '—'}</span></div>
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap font-medium" style={{ background: C.phone.bg + '60', color: C.phone.text }}>{s.recipient_phone}</td>
                                            <td className="px-3 py-3" style={{ background: C.type.bg + '60' }}>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: C.type.bg, color: C.type.text, borderColor: C.type.head }}>{s.message_type}</span>
                                            </td>
                                            <td className="px-3 py-3 max-w-[200px] truncate" style={{ background: C.message.bg + '60', color: C.message.text }}>{s.message}</td>
                                            <td className="px-3 py-3" style={{ background: C.status.bg + '60' }}>
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${s.status === 'Sent' ? 'bg-green-50 text-green-700 border-green-200' : s.status === 'Failed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                    {s.status === 'Sent' ? '✅' : s.status === 'Failed' ? '❌' : '⏳'} {s.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ background: C.cost.bg + '60', color: C.cost.text }}>{fmt(s.cost || 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        {filteredLogs.length > 0 && (
                            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                                <p className="text-xs text-gray-400">{Math.min((page - 1) * pageSize + 1, filteredLogs.length)}–{Math.min(page * pageSize, filteredLogs.length)} of {filteredLogs.length}</p>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronLeft size={14} /></button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map((p, i, arr) => (
                                        <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-indigo-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                                    ))}
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronRight size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB: REMINDERS ══════════════════ */}
            {tab === 'reminders' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-800">⏰ Automated Reminder Rules</h3>
                        <button onClick={() => setShowAddRule(true)} className="btn-primary flex items-center gap-2"><FiPlus size={14} /> Add Rule</button>
                    </div>
                    {reminderRules.map(r => (
                        <div key={r.rule_id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${r.is_active ? '' : 'bg-gray-100 text-gray-400'}`}
                                style={r.is_active ? { background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff' } : {}}>
                                <FiClock size={18} />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-gray-800">{r.rule_name}</p>
                                <p className="text-xs text-gray-500">{r.trigger_type?.replace(/_/g, ' ')} • {r.days_offset > 0 ? '+' : ''}{r.days_offset} days</p>
                            </div>
                            <button onClick={async () => { await updateReminderRule(r.rule_id, { is_active: !r.is_active }); loadData(globalLocationId); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${r.is_active ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                {r.is_active ? '✅ Active' : '⏸ Inactive'}
                            </button>
                        </div>
                    ))}
                    {reminderRules.length === 0 && (
                        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
                            <span className="text-5xl">⏰</span><p className="text-sm font-medium text-gray-500 mt-3">No reminder rules yet</p><p className="text-xs text-gray-400">Create automated SMS reminders</p>
                        </div>
                    )}
                    {showAddRule && (
                        <div className="modal-overlay" onClick={() => setShowAddRule(false)}>
                            <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                                <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                    <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                                    <div><h2 className="text-lg font-bold text-white">⏰ New Reminder Rule</h2><p className="text-white/70 text-xs mt-0.5">Automated SMS reminders</p></div>
                                    <button onClick={() => setShowAddRule(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Rule Name</label><input value={ruleName} onChange={e => setRuleName(e.target.value)} className="input-field" placeholder="e.g. 3-Day Before Due" /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Trigger</label><select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="select-field"><option value="before_due">Before Due Date</option><option value="after_due">After Due Date</option><option value="on_arrears">When Arrears Accumulate</option></select></div>
                                        <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Days Offset</label><input type="number" value={daysOffset} onChange={e => setDaysOffset(parseInt(e.target.value))} className="input-field" /></div>
                                    </div>
                                    <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Message Template</label><textarea value={ruleTemplate} onChange={e => setRuleTemplate(e.target.value)} rows={3} className="input-field" placeholder="Dear {name}, your rent of KES {balance} for {unit} is due in {days} days." /></div>
                                </div>
                                <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                                    <button onClick={() => setShowAddRule(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                                    <button onClick={handleAddRule} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}><FiSave size={14} /> Save Rule</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ TAB: CONFIG ══════════════════ */}
            {tab === 'config' && (
                <div className="grid grid-cols-2 gap-5">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <span className="text-xl">🇰🇪</span>
                            <div><h3 className="text-sm font-bold text-white">AfricasTalking SMS</h3><p className="text-white/60 text-[10px]">Kenya bulk SMS gateway</p></div>
                        </div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Username</label><input value={username} onChange={e => setUsername(e.target.value)} className="input-field" placeholder="sandbox" /></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">API Key</label><input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" className="input-field" placeholder="ATS..." /></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">Sender ID</label><input value={senderId} onChange={e => setSenderId(e.target.value)} className="input-field" placeholder="ARMS" /></div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setIsSandbox(!isSandbox)} className={`relative w-12 h-6 rounded-full transition ${isSandbox ? 'bg-yellow-400' : 'bg-green-500'}`}>
                                    <div className={`absolute top-0.5 ${isSandbox ? 'left-0.5' : 'left-6'} w-5 h-5 rounded-full bg-white shadow transition-all`} />
                                </button>
                                <span className="text-sm font-semibold text-gray-700">{isSandbox ? '🧪 Sandbox Mode' : '🟢 Live Mode'}</span>
                            </div>
                            <button onClick={handleSaveConfig} className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}>Save Configuration</button>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <FiMessageSquare size={18} className="text-white" />
                            <div><h3 className="text-sm font-bold text-white">WhatsApp Business API</h3><p className="text-white/60 text-[10px]">Coming soon</p></div>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="p-8 rounded-xl bg-gray-50 text-center"><FiMessageSquare size={40} className="mx-auto text-green-400 mb-3" /><p className="text-sm font-semibold text-gray-600">WhatsApp Business API</p><p className="text-xs text-gray-400 mt-1">Configure in Settings when ready</p></div>
                            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100"><p className="text-xs text-blue-700 font-semibold">💡 Requires Meta Business verification. Contact support to enable.</p></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
