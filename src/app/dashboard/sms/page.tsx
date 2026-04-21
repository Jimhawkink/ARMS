'use client';
import { useState, useEffect } from 'react';
import { getSMSConfig, updateSMSConfig, getSMSLogs, logSMS, getReminderRules, addReminderRule, updateReminderRule, getOverdueTenants, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiSend, FiMessageSquare, FiSettings, FiClock, FiUsers, FiAlertTriangle, FiCheck, FiX, FiRefreshCw } from 'react-icons/fi';

export default function SMSPage() {
    const [tab, setTab] = useState<'send' | 'logs' | 'reminders' | 'config'>('send');
    const [smsConfig, setSmsConfig] = useState<any>(null);
    const [whatsappConfig, setWhatsappConfig] = useState<any>(null);
    const [smsLogs, setSmsLogs] = useState<any[]>([]);
    const [reminderRules, setReminderRules] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [overdue, setOverdue] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
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

    useEffect(() => {
        const handler = (e: any) => setGlobalLocationId(e.detail);
        const saved = localStorage.getItem('arms_location');
        if (saved) setGlobalLocationId(parseInt(saved));
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [config, logs, rules, tenantList, overdueList] = await Promise.all([
                getSMSConfig(),
                getSMSLogs({ limit: 100 }),
                getReminderRules(globalLocationId),
                getTenants(globalLocationId),
                getOverdueTenants(globalLocationId),
            ]);
            setSmsConfig(config);
            if (config) { setApiKey(config.api_key || ''); setUsername(config.username || ''); setSenderId(config.sender_id || ''); setIsSandbox(config.is_sandbox ?? true); }
            setSmsLogs(logs);
            setReminderRules(rules);
            setTenants(tenantList.filter((t: any) => t.status === 'Active'));
            setOverdue(overdueList);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [globalLocationId]);

    const handleSaveConfig = async () => {
        try {
            await updateSMSConfig({ api_key: apiKey, username, sender_id: senderId, is_sandbox: isSandbox });
            toast.success('SMS config saved');
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleSendSMS = async () => {
        if (!message.trim()) return toast.error('Enter a message');
        if (!smsConfig) return toast.error('Configure SMS settings first');

        const recipients = sendToOverdue
            ? overdue
            : sendToAll
                ? tenants
                : tenants.filter((t: any) => selectedTenants.includes(t.tenant_id));

        if (recipients.length === 0) return toast.error('Select recipients');

        setLoading(true);
        let sent = 0, failed = 0;
        for (const tenant of recipients) {
            const phone = tenant.phone?.replace(/^0/, '+254') || tenant.phone;
            if (!phone) { failed++; continue; }
            try {
                // Call AfricasTalking API via our API route
                const res = await fetch('/api/sms/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: phone,
                        message: message.replace('{name}', tenant.tenant_name).replace('{unit}', tenant.arms_units?.unit_name || '').replace('{balance}', String(tenant.balance || 0)),
                        username: smsConfig.username,
                        apiKey: smsConfig.api_key,
                        senderId: smsConfig.sender_id,
                        isSandbox: smsConfig.is_sandbox,
                    }),
                });
                const result = await res.json();
                if (result.success) {
                    await logSMS({
                        recipient_phone: phone,
                        recipient_name: tenant.tenant_name,
                        message: message.replace('{name}', tenant.tenant_name).replace('{unit}', tenant.arms_units?.unit_name || '').replace('{balance}', String(tenant.balance || 0)),
                        message_type: messageType,
                        tenant_id: tenant.tenant_id,
                        location_id: globalLocationId || undefined,
                        status: 'Sent',
                        cost: result.cost || 1.0,
                        sent_by: 'Admin',
                    });
                    sent++;
                } else {
                    await logSMS({ recipient_phone: phone, recipient_name: tenant.tenant_name, message, message_type: messageType, tenant_id: tenant.tenant_id, status: 'Failed', error_message: result.error, sent_by: 'Admin' });
                    failed++;
                }
            } catch { failed++; }
        }
        toast.success(`Sent: ${sent}${failed > 0 ? `, Failed: ${failed}` : ''}`);
        setMessage(''); setSelectedTenants([]); setSendToAll(false); setSendToOverdue(false);
        loadData();
    };

    const handleAddRule = async () => {
        if (!ruleName || !ruleTemplate) return toast.error('Fill all fields');
        try {
            await addReminderRule({ rule_name: ruleName, trigger_type: triggerType, days_offset: daysOffset, message_template: ruleTemplate, location_id: globalLocationId || undefined });
            toast.success('Rule added');
            setShowAddRule(false); setRuleName(''); setRuleTemplate('');
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const toggleTenant = (id: number) => {
        setSelectedTenants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const fmt = (n: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(n || 0);

    const tabs = [
        { key: 'send', label: 'Send SMS', icon: FiSend },
        { key: 'logs', label: 'SMS History', icon: FiClock },
        { key: 'reminders', label: 'Auto Reminders', icon: FiAlertTriangle },
        { key: 'config', label: 'Configuration', icon: FiSettings },
    ] as const;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>📱 SMS & Communication</h1>
                    <p className="text-sm text-gray-500 mt-1">AfricasTalking bulk SMS • Automated reminders • Tenant notifications</p>
                </div>
                <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-200 hover:border-indigo-300 transition">
                    <FiRefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Active Tenants', value: tenants.length, color: '#6366f1' },
                    { label: 'Overdue Tenants', value: overdue.length, color: '#ef4444' },
                    { label: 'SMS Sent (Total)', value: smsLogs.filter(l => l.status === 'Sent').length, color: '#059669' },
                    { label: 'SMS Failed', value: smsLogs.filter(l => l.status === 'Failed').length, color: '#f59e0b' },
                ].map(s => (
                    <div key={s.label} className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
                        <p className="text-2xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-gray-100 shadow-sm">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === t.key ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <t.icon size={14} /> {t.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {tab === 'send' && (
                <div className="grid grid-cols-3 gap-6">
                    {/* Compose */}
                    <div className="col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">✉️ Compose Message</h3>
                        <div className="flex gap-2">
                            {['Custom', 'Reminder', 'Demand'].map(t => (
                                <button key={t} onClick={() => setMessageType(t as any)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${messageType === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Message ({message.length}/160)</label>
                            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                                className="w-full mt-1 p-3 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
                                placeholder="Dear {name}, your rent for {unit} of KES {balance} is due. Please pay by 5th. - ARMS" />
                            <p className="text-xs text-gray-400 mt-1">Use {'{name}'}, {'{unit}'}, {'{balance}'} as placeholders</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setSendToAll(!sendToAll)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${sendToAll ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                <FiUsers size={12} /> All Tenants
                            </button>
                            <button onClick={() => setSendToOverdue(!sendToOverdue)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${sendToOverdue ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                <FiAlertTriangle size={12} /> Overdue Only ({overdue.length})
                            </button>
                        </div>
                        <button onClick={handleSendSMS} disabled={loading}
                            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                            <FiSend size={14} /> {loading ? 'Sending...' : `Send SMS to ${sendToOverdue ? overdue.length : sendToAll ? tenants.length : selectedTenants.length} recipients`}
                        </button>
                    </div>

                    {/* Recipient List */}
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm max-h-[500px] overflow-y-auto">
                        <h3 className="text-sm font-bold text-gray-800 mb-3">👤 Select Recipients</h3>
                        <div className="space-y-1">
                            {tenants.map((t: any) => (
                                <button key={t.tenant_id} onClick={() => toggleTenant(t.tenant_id)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition ${selectedTenants.includes(t.tenant_id) ? 'bg-indigo-50 border-indigo-200 border' : 'hover:bg-gray-50'}`}>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedTenants.includes(t.tenant_id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                                        {selectedTenants.includes(t.tenant_id) && <FiCheck size={10} className="text-white" />}
                                    </div>
                                    <span className="font-semibold text-gray-700">{t.tenant_name}</span>
                                    <span className="text-gray-400 ml-auto">{t.arms_units?.unit_name}</span>
                                    {(t.balance || 0) > 0 && <span className="text-red-500 font-bold">{fmt(t.balance)}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'logs' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800">📋 SMS History</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Recipient</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Phone</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Type</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Message</th>
                                    <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {smsLogs.map(s => (
                                    <tr key={s.sms_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString('en-KE')}</td>
                                        <td className="px-4 py-3 font-semibold text-gray-700">{s.recipient_name || '-'}</td>
                                        <td className="px-4 py-3 text-gray-600">{s.recipient_phone}</td>
                                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600">{s.message_type}</span></td>
                                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{s.message}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.status === 'Sent' ? 'bg-green-50 text-green-600' : s.status === 'Failed' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                                {s.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-700">{fmt(s.cost || 0)}</td>
                                    </tr>
                                ))}
                                {smsLogs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No SMS logs yet</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'reminders' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-800">⏰ Automated Reminder Rules</h3>
                        <button onClick={() => setShowAddRule(true)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition">+ Add Rule</button>
                    </div>

                    {reminderRules.map(r => (
                        <div key={r.rule_id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${r.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                <FiClock size={18} />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-gray-800">{r.rule_name}</p>
                                <p className="text-xs text-gray-500">{r.trigger_type} • {r.days_offset > 0 ? '+' : ''}{r.days_offset} days • {r.message_template?.slice(0, 60)}...</p>
                            </div>
                            <button onClick={async () => { await updateReminderRule(r.rule_id, { is_active: !r.is_active }); loadData(); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${r.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                {r.is_active ? 'Active' : 'Inactive'}
                            </button>
                        </div>
                    ))}

                    {showAddRule && (
                        <div className="bg-white rounded-2xl p-6 border border-indigo-200 shadow-sm space-y-4">
                            <h4 className="font-bold text-gray-800">New Reminder Rule</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Rule Name</label>
                                    <input value={ruleName} onChange={e => setRuleName(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="e.g. 3-Day Before Due" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Trigger</label>
                                    <select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                        <option value="before_due">Before Due Date</option>
                                        <option value="after_due">After Due Date</option>
                                        <option value="on_arrears">When Arrears Accumulate</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Days Offset</label>
                                    <input type="number" value={daysOffset} onChange={e => setDaysOffset(parseInt(e.target.value))} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Message Template</label>
                                <textarea value={ruleTemplate} onChange={e => setRuleTemplate(e.target.value)} rows={3}
                                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Dear {name}, your rent of KES {balance} for {unit} is due in {days} days. Please pay by 5th. - ARMS" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleAddRule} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">Save Rule</button>
                                <button onClick={() => setShowAddRule(false)} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {tab === 'config' && (
                <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">🇰🇪 AfricasTalking SMS</h3>
                        <p className="text-xs text-gray-500">Configure your AfricasTalking account for bulk SMS delivery in Kenya</p>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Username</label>
                            <input value={username} onChange={e => setUsername(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="sandbox" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">API Key</label>
                            <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="ATS..." />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Sender ID</label>
                            <input value={senderId} onChange={e => setSenderId(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="ARMS" />
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setIsSandbox(!isSandbox)}
                                className={`relative w-12 h-6 rounded-full transition ${isSandbox ? 'bg-yellow-400' : 'bg-green-500'}`}>
                                <div className={`absolute top-0.5 ${isSandbox ? 'left-0.5' : 'left-6'} w-5 h-5 rounded-full bg-white shadow transition-all`} />
                            </button>
                            <span className="text-sm font-semibold text-gray-700">{isSandbox ? 'Sandbox Mode' : 'Live Mode'}</span>
                        </div>
                        <button onClick={handleSaveConfig} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition">Save Configuration</button>
                    </div>

                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">💬 WhatsApp Business API</h3>
                        <p className="text-xs text-gray-500">Coming soon — send receipts, notices & demand letters via WhatsApp</p>
                        <div className="p-8 rounded-xl bg-gray-50 text-center">
                            <FiMessageSquare size={40} className="mx-auto text-green-500 mb-3" />
                            <p className="text-sm font-semibold text-gray-600">WhatsApp Business API</p>
                            <p className="text-xs text-gray-400 mt-1">Configure in Settings when ready</p>
                        </div>
                        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                            <p className="text-xs text-blue-700 font-semibold">💡 WhatsApp integration requires Meta Business verification. Contact support to enable.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
