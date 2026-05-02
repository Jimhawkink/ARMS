'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { parseStoredUser } from '@/lib/rbac';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { FiKey, FiPlus, FiRefreshCw, FiCopy, FiCheck, FiX, FiShield, FiAlertTriangle, FiCalendar, FiUser } from 'react-icons/fi';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FEATURE_OPTIONS = [
    'full_access', 'tenants', 'billing', 'payments', 'reports',
    'sms_whatsapp', 'utilities', 'caretakers', 'demand_letters',
    'expenses', 'checklists',
];

export default function LicensingPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [licenses, setLicenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Form state
    const [clientName, setClientName] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['full_access']);
    const [notes, setNotes] = useState('');
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);

    // ── Super Admin guard ─────────────────────────────────────
    useEffect(() => {
        const raw = localStorage.getItem('arms_user');
        const u = raw ? JSON.parse(raw) : null;
        if (!u || !u.isSuperAdmin) {
            toast.error('🔒 Super Admin access required');
            router.push('/dashboard');
            return;
        }
        setUser(u);
        loadLicenses();
    }, [router]);

    const loadLicenses = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('arms_licenses')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setLicenses(data || []);
        } catch (e: any) {
            toast.error(e.message);
        }
        setLoading(false);
    }, []);

    const handleGenerate = async () => {
        if (!clientName.trim()) return toast.error('Client name is required');
        if (!expiryDate) return toast.error('Expiry date is required');
        if (new Date(expiryDate) <= new Date()) return toast.error('Expiry date must be in the future');

        setGenerating(true);
        setGeneratedKey(null);
        try {
            const res = await fetch('/api/license/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientName: clientName.trim(),
                    expiryDate,
                    features: selectedFeatures,
                    notes: notes.trim() || null,
                    isSuperAdmin: true,
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || 'Generation failed');

            setGeneratedKey(result.licenseKey);
            toast.success(`✅ License generated for ${clientName}`);
            setClientName(''); setExpiryDate(''); setNotes('');
            setSelectedFeatures(['full_access']);
            loadLicenses();
        } catch (e: any) {
            toast.error(e.message);
        }
        setGenerating(false);
    };

    const handleRevoke = async (licenseId: string, clientName: string) => {
        if (!confirm(`Revoke license for "${clientName}"?\n\nThis will immediately block access on their machine. This action cannot be undone.`)) return;
        setRevoking(licenseId);
        try {
            const res = await fetch('/api/license/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseId, isSuperAdmin: true }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            toast.success(`License revoked for ${clientName}`);
            loadLicenses();
        } catch (e: any) {
            toast.error(e.message);
        }
        setRevoking(null);
    };

    const copyKey = (key: string) => {
        navigator.clipboard.writeText(key);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
        toast.success('License key copied!');
    };

    const maskKey = (key: string) => {
        const parts = key.split('-');
        if (parts.length < 3) return key;
        return `${parts[0]}-${parts[1]}-****-****-****-${parts[parts.length - 1]}`;
    };

    const getDaysUntilExpiry = (expiryDate: string) => {
        const expiry = new Date(expiryDate);
        expiry.setHours(23, 59, 59, 999);
        return Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    };

    const activeCount = licenses.filter(l => l.is_active && !l.revoked_at).length;
    const expiredCount = licenses.filter(l => getDaysUntilExpiry(l.expiry_date) <= 0).length;
    const pendingCount = licenses.filter(l => !l.is_active && !l.revoked_at).length;

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>🔑</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-amber-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading Licensing…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title">🔑 License Management</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Super Admin only · Generate & manage machine-locked licenses · {licenses.length} total
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={loadLicenses} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-amber-600 hover:border-amber-200 transition">
                        <FiRefreshCw size={15} />
                    </button>
                    <button onClick={() => { setShowForm(!showForm); setGeneratedKey(null); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md"
                        style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                        <FiPlus size={15} /> Generate License
                    </button>
                </div>
            </div>

            {/* Super Admin badge */}
            <div className="flex items-center gap-3 p-4 rounded-2xl border-2 border-amber-200 bg-amber-50">
                <span className="text-2xl">👑</span>
                <div>
                    <p className="text-sm font-black text-amber-800">Super Admin — Licensing Control Center</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                        You are the only person who can generate, view, and revoke licenses.
                        Each license is permanently machine-locked using SHA-256 fingerprinting.
                    </p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total Licenses', value: licenses.length, emoji: '🔑', color: '#f59e0b', bg: '#fffbeb' },
                    { label: 'Active', value: activeCount, emoji: '✅', color: '#10b981', bg: '#f0fdf4', pulse: activeCount > 0 },
                    { label: 'Pending Activation', value: pendingCount, emoji: '⏳', color: '#6366f1', bg: '#eef2ff' },
                    { label: 'Expired', value: expiredCount, emoji: '❌', color: '#ef4444', bg: '#fef2f2', pulse: expiredCount > 0 },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <span className="text-xl">{card.emoji}</span>
                        </div>
                        <p className="text-2xl font-extrabold text-gray-900">{card.value}</p>
                        {(card as any).pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: card.color }} />}
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* Generate Form */}
            {showForm && (
                <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                        <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                        <FiKey size={18} className="text-white" />
                        <div>
                            <h3 className="text-sm font-bold text-white">Generate New License</h3>
                            <p className="text-white/70 text-[10px]">256-bit entropy · HMAC-SHA256 signed · Machine-locked on first activation</p>
                        </div>
                        <button onClick={() => setShowForm(false)} className="ml-auto p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition">
                            <FiX size={16} />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏢 Client / Company Name *</label>
                                <input value={clientName} onChange={e => setClientName(e.target.value)} className="input-field"
                                    placeholder="e.g. Rental Care Solutions" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📅 Expiry Date *</label>
                                <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="input-field"
                                    min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-2 block uppercase tracking-wider">⚡ Features</label>
                            <div className="flex flex-wrap gap-2">
                                {FEATURE_OPTIONS.map(f => (
                                    <button key={f} onClick={() => setSelectedFeatures(prev =>
                                        prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
                                    )}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${selectedFeatures.includes(f) ? 'bg-amber-500 text-white border-amber-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-amber-300'}`}>
                                        {f.replace(/_/g, ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📋 Notes (optional)</label>
                            <input value={notes} onChange={e => setNotes(e.target.value)} className="input-field" placeholder="e.g. Annual license for Nairobi branch" />
                        </div>
                        <button onClick={handleGenerate} disabled={generating}
                            className="w-full py-3 rounded-xl text-sm font-bold text-white transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                            {generating ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : <>🔑 Generate License Key</>}
                        </button>

                        {/* Generated key display */}
                        {generatedKey && (
                            <div className="p-4 rounded-xl bg-green-50 border-2 border-green-300">
                                <p className="text-xs font-bold text-green-700 mb-2">✅ License Generated! Copy and share securely:</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-sm font-mono font-black text-green-900 bg-green-100 px-3 py-2 rounded-lg break-all">
                                        {generatedKey}
                                    </code>
                                    <button onClick={() => copyKey(generatedKey)}
                                        className="p-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 transition flex-shrink-0">
                                        {copiedKey === generatedKey ? <FiCheck size={16} /> : <FiCopy size={16} />}
                                    </button>
                                </div>
                                <p className="text-[10px] text-green-600 mt-2 font-semibold">
                                    ⚠️ Save this key now — it will not be shown again in full. Share it securely with the client.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* License List */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-700">📋 All Licenses</h3>
                    <span className="text-xs text-gray-400">{licenses.length} records</span>
                </div>
                <div className="divide-y divide-gray-50">
                    {licenses.length === 0 ? (
                        <div className="py-16 text-center text-gray-400">
                            <span className="text-5xl block mb-3">🔑</span>
                            <p className="text-sm font-medium">No licenses generated yet</p>
                            <p className="text-xs mt-1">Click "Generate License" to create your first license</p>
                        </div>
                    ) : licenses.map(lic => {
                        const daysLeft = getDaysUntilExpiry(lic.expiry_date);
                        const isExpired = daysLeft <= 0;
                        const isRevoked = !!lic.revoked_at;
                        const isActive = lic.is_active && !isRevoked && !isExpired;
                        const isPending = !lic.is_active && !isRevoked;

                        return (
                            <div key={lic.license_id} className="p-5 hover:bg-gray-50/50 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg`}
                                        style={{ background: isActive ? 'linear-gradient(135deg,#10b981,#059669)' : isRevoked ? 'linear-gradient(135deg,#ef4444,#dc2626)' : isExpired ? 'linear-gradient(135deg,#6b7280,#4b5563)' : 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
                                        {isActive ? '✅' : isRevoked ? '🚫' : isExpired ? '⏰' : '⏳'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-black text-gray-900 text-sm">{lic.client_name}</p>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isActive ? 'bg-green-50 text-green-700 border-green-200' : isRevoked ? 'bg-red-50 text-red-700 border-red-200' : isExpired ? 'bg-gray-50 text-gray-500 border-gray-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                                {isActive ? '✅ Active' : isRevoked ? '🚫 Revoked' : isExpired ? '⏰ Expired' : '⏳ Pending'}
                                            </span>
                                            {!isExpired && !isRevoked && daysLeft <= 30 && daysLeft > 0 && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                    ⚠️ {daysLeft}d left
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                                            <span className="text-[11px] text-gray-500 font-mono">{maskKey(lic.license_key)}</span>
                                            <button onClick={() => copyKey(lic.license_key)}
                                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1">
                                                {copiedKey === lic.license_key ? <FiCheck size={10} /> : <FiCopy size={10} />}
                                                {copiedKey === lic.license_key ? 'Copied!' : 'Copy Key'}
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-4 mt-1 flex-wrap text-[10px] text-gray-400">
                                            <span>📅 Expires: {new Date(lic.expiry_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            <span>🖥️ Machine: {lic.machine_id ? lic.machine_id.slice(0, 12) + '…' : 'Not activated'}</span>
                                            <span>📆 Created: {new Date(lic.created_at).toLocaleDateString('en-KE')}</span>
                                            {lic.activated_at && <span>⚡ Activated: {new Date(lic.activated_at).toLocaleDateString('en-KE')}</span>}
                                        </div>
                                        {lic.notes && <p className="text-[10px] text-gray-400 mt-1 italic">{lic.notes}</p>}
                                    </div>
                                    {!isRevoked && (
                                        <button onClick={() => handleRevoke(lic.license_id, lic.client_name)}
                                            disabled={revoking === lic.license_id}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition disabled:opacity-50 flex-shrink-0">
                                            {revoking === lic.license_id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <FiX size={12} />}
                                            Revoke
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Security info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">🔒 Security Architecture</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { icon: '🎲', title: '256-bit Entropy', desc: 'Keys generated from 32 cryptographically random bytes' },
                        { icon: '🔏', title: 'HMAC-SHA256', desc: 'Every key is signed — forgery is computationally infeasible' },
                        { icon: '🖥️', title: 'Machine-Locked', desc: 'SHA-256 browser fingerprint permanently binds each license' },
                        { icon: '🚫', title: 'No Transfer', desc: 'Once activated, a license can NEVER be moved to another machine' },
                    ].map((item, i) => (
                        <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <span className="text-2xl block mb-1">{item.icon}</span>
                            <p className="text-xs font-bold text-gray-700">{item.title}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
