'use client';
import { useState, useEffect, useCallback } from 'react';
import { getBilling, generateMonthlyBills, getLocations, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiFileText, FiRefreshCw, FiDollarSign, FiCheckCircle, FiAlertTriangle, FiPhone, FiCalendar, FiZap, FiInfo } from 'react-icons/fi';

// ── WhatsApp reminder helper ──────────────────────────────────────────────────
function buildWhatsAppLink(phone: string, tenantName: string, amount: number, months: string[], locationName: string) {
    const fmt = (n: number) => `KES ${n.toLocaleString()}`;
    const monthLabels = months.map(m => { try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch { return m; } });
    const monthStr = monthLabels.length > 0 ? monthLabels.join(', ') : 'current period';
    const msg = [
        `🏠 *ARMS Rent Reminder*`,
        `━━━━━━━━━━━━━━━━`,
        `Dear *${tenantName}*,`,
        ``,
        `This is a friendly reminder that you have an outstanding rent balance:`,
        ``,
        `📍 Location: ${locationName}`,
        `💰 Amount Due: *${fmt(amount)}*`,
        `📅 Period: ${monthStr}`,
        ``,
        `Please make your payment at your earliest convenience.`,
        `Payment via M-Pesa or cash is accepted.`,
        ``,
        `Thank you! 🙏`,
        `━━━━━━━━━━━━━━━━`,
        `Alpha Rental Management System`,
        `📞 0720316175`,
    ].join('\n');
    const waPhone = phone.replace(/^0/, '254').replace(/[^0-9]/g, '');
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
}

export default function BillingPage() {
    const [bills, setBills] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
    const [statusFilter, setStatusFilter] = useState('');
    const [genResult, setGenResult] = useState<{ generated: number; skipped: number; catchUpMonths: number; errors: string[] } | null>(null);
    const [showCatchupInfo, setShowCatchupInfo] = useState(false);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [b, l, t] = await Promise.all([
                getBilling({ locationId: locId ?? undefined, month: monthFilter || undefined, status: statusFilter || undefined }),
                getLocations(),
                getTenants(locId ?? undefined)
            ]);
            setBills(b); setLocations(l); setTenants(t);
        } catch { toast.error('Failed to load billing data'); }
        setLoading(false);
    }, [monthFilter, statusFilter]);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setLocationId(lid); loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const handleGenerate = async () => {
        if (!monthFilter) { toast.error('Select a month first'); return; }
        setGenerating(true);
        setGenResult(null);
        try {
            const result = await generateMonthlyBills(monthFilter, locationId ?? undefined);
            setGenResult({ generated: result.generated, skipped: result.skipped, catchUpMonths: result.catchUpMonths, errors: result.errors });
            if (result.generated > 0) {
                toast.success(`✅ ${result.generated} bill${result.generated !== 1 ? 's' : ''} generated${result.catchUpMonths > 0 ? ` (incl. ${result.catchUpMonths} catch-up months)` : ''}!`);
            } else {
                toast(`ℹ️ No new bills — all tenants already billed`, { icon: 'ℹ️' });
            }
            if (result.errors.length > 0) result.errors.forEach(e => toast.error(e));
            loadData(locationId);
        } catch (err: any) { toast.error(err.message || 'Failed to generate bills'); }
        setGenerating(false);
    };

    const totalBilled = bills.reduce((s, b) => s + (b.rent_amount || 0), 0);
    const totalPaid = bills.reduce((s, b) => s + (b.amount_paid || 0), 0);
    const totalBalance = bills.reduce((s, b) => s + (b.balance || 0), 0);
    const paidCount = bills.filter(b => b.status === 'Paid').length;
    const unpaidCount = bills.filter(b => b.status === 'Unpaid').length;
    const partialCount = bills.filter(b => b.status === 'Partial').length;
    const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

    // Group bills by tenant to identify cross-month arrears
    const tenantGrouped = bills.reduce((acc: any, b: any) => {
        const id = b.tenant_id;
        if (!acc[id]) acc[id] = [];
        acc[id].push(b);
        return acc;
    }, {});

    // Tenants with bills from multiple months (arrears present)
    const tenantsWithArrears = Object.values(tenantGrouped).filter((arr: any) => arr.length > 1 || (arr.length === 1 && arr[0].status !== 'Paid'));

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>📄</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading billing data…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="page-title">📄 Billing</h1>
                    <p className="text-sm text-gray-500 mt-1">Monthly rent bills, catch-up arrears &amp; WhatsApp reminders</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(locationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition">
                        <FiRefreshCw size={16} />
                    </button>
                    <button onClick={handleGenerate} disabled={generating}
                        className="btn-success flex items-center gap-2 shadow-md">
                        {generating ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <FiZap size={16} />}
                        Generate Bills for {monthFilter}
                    </button>
                </div>
            </div>

            {/* Generate Result Banner */}
            {genResult && (
                <div className="rounded-2xl p-4 border flex items-start gap-4 animate-fadeIn"
                    style={{ background: genResult.generated > 0 ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fffbeb,#fef3c7)', borderColor: genResult.generated > 0 ? '#86efac' : '#fde68a' }}>
                    <span className="text-2xl">{genResult.generated > 0 ? '✅' : 'ℹ️'}</span>
                    <div className="flex-1">
                        <p className="font-bold text-sm" style={{ color: genResult.generated > 0 ? '#15803d' : '#92400e' }}>
                            {genResult.generated > 0 ? `${genResult.generated} bills generated successfully!` : 'No new bills — all tenants already billed for this period'}
                        </p>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                            <span className="text-xs font-semibold text-green-700">✅ New: {genResult.generated}</span>
                            <span className="text-xs font-semibold text-gray-500">⏭ Skipped: {genResult.skipped}</span>
                            {genResult.catchUpMonths > 0 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-orange-100 text-orange-700">
                                    🔄 Catch-up: {genResult.catchUpMonths} prior months auto-generated
                                </span>
                            )}
                        </div>
                        {genResult.errors.length > 0 && (
                            <p className="text-xs text-red-600 mt-1">⚠️ {genResult.errors.length} error(s): {genResult.errors.join(' | ')}</p>
                        )}
                    </div>
                    <button onClick={() => setGenResult(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>
            )}

            {/* Catch-up info banner */}
            <div className="rounded-xl p-3.5 flex items-center gap-3 border cursor-pointer"
                style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}
                onClick={() => setShowCatchupInfo(!showCatchupInfo)}>
                <FiInfo size={16} className="text-blue-500 flex-shrink-0" />
                <p className="text-xs text-blue-700 font-medium flex-1">
                    <strong>Catch-up billing:</strong> When you generate bills, the system auto-creates ALL missing months from each tenant&apos;s move-in date (e.g. a Feb tenant will get Feb, Mar, Apr bills if none existed).
                </p>
                <span className="text-xs text-blue-500 font-bold">{showCatchupInfo ? '▲' : '▼'}</span>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-center gap-3">
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Month</label>
                    <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="input-field" style={{ width: 'auto' }} />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Status</label>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-field" style={{ width: 'auto' }}>
                        <option value="">All Statuses</option>
                        <option value="Paid">✅ Paid</option>
                        <option value="Partial">⏳ Partial</option>
                        <option value="Unpaid">❌ Unpaid</option>
                    </select>
                </div>
                <div className="self-end">
                    <button onClick={() => loadData(locationId)} className="btn-outline flex items-center gap-2">
                        <FiRefreshCw size={14} /> Apply
                    </button>
                </div>
                <div className="ml-auto text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Showing</p>
                    <p className="text-sm font-bold text-gray-800">{bills.length} records</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { label: 'Total Billed', value: fmt(totalBilled), icon: FiDollarSign, color: '#6366f1', bg: '#eef2ff', sub: `${bills.length} bills` },
                    { label: 'Collected', value: fmt(totalPaid), icon: FiCheckCircle, color: '#10b981', bg: '#f0fdf4', sub: `${paidCount} fully paid` },
                    { label: 'Outstanding', value: fmt(totalBalance), icon: FiAlertTriangle, color: '#ef4444', bg: '#fef2f2', sub: `${unpaidCount} unpaid, ${partialCount} partial` },
                    { label: 'Collection Rate', value: `${collectionRate}%`, icon: FiZap, color: collectionRate >= 80 ? '#10b981' : collectionRate >= 50 ? '#f59e0b' : '#ef4444', bg: collectionRate >= 80 ? '#f0fdf4' : collectionRate >= 50 ? '#fffbeb' : '#fef2f2', sub: collectionRate >= 80 ? '🌟 Excellent' : collectionRate >= 50 ? '⚠️ Needs work' : '🚨 Critical' },
                    { label: 'Tenants w/ Arrears', value: tenantsWithArrears.length, icon: FiCalendar, color: '#c2410c', bg: '#fff7ed', sub: 'Need WhatsApp reminder' },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <div className="p-2.5 rounded-xl" style={{ background: card.bg }}>
                                <card.icon size={16} style={{ color: card.color }} />
                            </div>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.05]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* Bills Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-bold text-gray-900">📋 Bill Records — {monthFilter ? new Date(monthFilter + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'All Months'}</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">📱 WhatsApp reminder buttons available for each unpaid tenant</p>
                    </div>
                    {bills.filter(b => b.status !== 'Paid' && b.arms_tenants?.phone).length > 0 && (
                        <button
                            onClick={() => {
                                const unpaid = bills.filter(b => b.status !== 'Paid' && b.arms_tenants?.phone);
                                unpaid.forEach(b => {
                                    const link = buildWhatsAppLink(b.arms_tenants.phone, b.arms_tenants.tenant_name, b.balance, [b.billing_month], b.arms_locations?.location_name || '');
                                    window.open(link, '_blank');
                                });
                                toast.success(`Opened ${unpaid.length} WhatsApp reminders`);
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-md"
                            style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)' }}>
                            📱 Bulk Remind ({bills.filter(b => b.status !== 'Paid').length})
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Tenant</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Unit</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Location</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-indigo-600">📅 Month</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Rent</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-green-700">Paid</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-red-700">Balance</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Status</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-green-700">Remind</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bills.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-4xl">📭</span>
                                        <p className="text-sm font-medium">No bills for this period</p>
                                        <p className="text-xs">Click &quot;Generate Bills&quot; to create rent bills for {monthFilter}</p>
                                    </div>
                                </td></tr>
                            ) : bills.map(b => {
                                const isOverdue = b.status !== 'Paid' && new Date(b.due_date) < new Date();
                                const hasPhone = !!b.arms_tenants?.phone;
                                const unpaidMonths = [b.billing_month].filter(Boolean);
                                return (
                                    <tr key={b.billing_id}
                                        className="transition-colors cursor-default"
                                        style={{ borderBottom: '1px solid #f1f5f9' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                                    style={{ background: b.status === 'Paid' ? 'linear-gradient(135deg,#10b981,#059669)' : isOverdue ? 'linear-gradient(135deg,#f87171,#ef4444)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                                    {b.arms_tenants?.tenant_name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                                <span className="font-semibold text-gray-900 text-xs">{b.arms_tenants?.tenant_name || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{b.arms_units?.unit_name || '-'}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{b.arms_locations?.location_name || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-bold text-indigo-700 px-2 py-0.5 rounded-lg bg-indigo-50">
                                                {b.billing_month ? new Date(b.billing_month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
                                            </span>
                                            {isOverdue && b.status !== 'Paid' && (
                                                <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">OVERDUE</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-bold text-gray-900">{fmt(b.rent_amount)}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-green-600">{fmt(b.amount_paid)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-extrabold ${b.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(b.balance)}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${b.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : b.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {b.status === 'Paid' ? '✅' : b.status === 'Partial' ? '⏳' : '❌'} {b.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {b.status !== 'Paid' && hasPhone ? (
                                                <a href={buildWhatsAppLink(b.arms_tenants.phone, b.arms_tenants.tenant_name, b.balance, unpaidMonths, b.arms_locations?.location_name || '')}
                                                    target="_blank" rel="noopener noreferrer"
                                                    title={`Send WhatsApp reminder to ${b.arms_tenants.tenant_name}`}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-white transition hover:opacity-90 shadow-sm"
                                                    style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)' }}>
                                                    📱 WhatsApp
                                                </a>
                                            ) : b.status !== 'Paid' ? (
                                                <span className="text-[10px] text-gray-300 flex items-center gap-1"><FiPhone size={10} /> No phone</span>
                                            ) : (
                                                <span className="text-[10px] text-green-500 font-bold">✓ Paid</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {bills.length > 0 && (
                            <tfoot>
                                <tr className="bg-gray-50 border-t-2 border-gray-200">
                                    <td colSpan={4} className="px-4 py-3 text-xs font-bold text-gray-600">TOTALS ({bills.length} records)</td>
                                    <td className="px-4 py-3 text-xs font-extrabold text-gray-900">{fmt(totalBilled)}</td>
                                    <td className="px-4 py-3 text-xs font-extrabold text-green-700">{fmt(totalPaid)}</td>
                                    <td className="px-4 py-3 text-xs font-extrabold text-red-600">{fmt(totalBalance)}</td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Tenants with no bills (need to generate) */}
            {tenants.length > 0 && (() => {
                const billedIds = new Set(bills.map(b => b.tenant_id));
                const unbilled = tenants.filter((t: any) => t.status === 'Active' && !billedIds.has(t.tenant_id));
                if (unbilled.length === 0) return null;
                return (
                    <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200">
                        <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-3">
                            <FiAlertTriangle size={16} /> {unbilled.length} Active Tenant{unbilled.length !== 1 ? 's' : ''} Not Yet Billed for {monthFilter}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {unbilled.slice(0, 10).map((t: any) => (
                                <span key={t.tenant_id} className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 border border-amber-200">
                                    {t.tenant_name} — {t.arms_units?.unit_name || '?'} ({t.arms_locations?.location_name || t.location_id})
                                </span>
                            ))}
                            {unbilled.length > 10 && <span className="text-xs text-amber-600">+{unbilled.length - 10} more</span>}
                        </div>
                        <button onClick={handleGenerate} disabled={generating}
                            className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm"
                            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                            <FiZap size={13} /> Generate Now →
                        </button>
                    </div>
                );
            })()}
        </div>
    );
}
