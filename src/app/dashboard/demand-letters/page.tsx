'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getDemandLetters, createDemandLetter, updateDemandLetter, getOverdueTenants, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiFileText, FiPlus, FiPrinter, FiSend, FiCheck, FiRefreshCw, FiSearch, FiChevronLeft, FiChevronRight, FiX, FiSave } from 'react-icons/fi';

const LETTER_TEMPLATES: Record<string, { subject: string; body: string }> = {
    Arrears: { subject: 'NOTICE OF RENT ARREARS', body: `Dear {name},\n\nRE: OUTSTANDING RENT ARREARS - {unit}\n\nOur records indicate that you have accumulated rent arrears amounting to KES {balance} for the unit {unit} at {location}.\n\nThis is a formal notice requiring you to settle the outstanding amount within 7 DAYS from the date of this notice.\n\nFailure to remit the full amount may result in further action including but not limited to:\n1. Late payment penalties as per the lease agreement\n2. Legal proceedings for recovery\n3. Termination of tenancy\n\nKindly make payment via M-Pesa to our paybill account or visit our offices.\n\nYours faithfully,\nARMS Management` },
    Eviction: { subject: 'NOTICE OF INTENTION TO EVICT', body: `Dear {name},\n\nRE: NOTICE OF INTENTION TO EVICT - {unit}\n\nTAKE NOTICE that owing to your failure to pay rent arrears of KES {balance} for unit {unit} at {location}, the landlord intends to terminate your tenancy and recover possession of the premises.\n\nYou are hereby required to VACATE the premises within 30 DAYS from the date of this notice, failing which eviction proceedings will be commenced against you without further notice.\n\nAll outstanding rent must be paid before vacating. Your deposit will be applied against any outstanding balance.\n\nThis notice is given pursuant to the Landlord and Tenant (Shops, Hotels and Catering Establishments) Act, Cap 301, Laws of Kenya.\n\nYours faithfully,\nARMS Management` },
    Final_Demand: { subject: 'FINAL DEMAND FOR PAYMENT', body: `Dear {name},\n\nRE: FINAL DEMAND - KES {balance} - {unit}\n\nThis is our FINAL DEMAND for payment of KES {balance} being rent arrears for unit {unit} at {location}.\n\nDespite previous notices, the amount remains unpaid. You are hereby given 48 HOURS to settle this debt in full.\n\nIf payment is not received within the stipulated time, we shall instruct our advocates to commence legal proceedings for recovery of the debt plus costs, without further reference to you.\n\nThis is our final notice.\n\nYours faithfully,\nARMS Management` },
    Notice: { subject: 'GENERAL NOTICE', body: `Dear {name},\n\nRE: NOTICE - {unit}\n\nThis is to notify you regarding matters pertaining to your tenancy at unit {unit}, {location}.\n\nOutstanding balance: KES {balance}\n\nPlease ensure compliance within the stipulated timeframe.\n\nYours faithfully,\nARMS Management` },
};

const C = {
    num: { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    name: { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    type: { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    subject: { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    amount: { bg: '#fef2f2', text: '#dc2626', head: '#fecaca' },
    status: { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    actions: { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
};
const GRADIENTS = ['linear-gradient(135deg,#6366f1,#8b5cf6)', 'linear-gradient(135deg,#0891b2,#06b6d4)', 'linear-gradient(135deg,#059669,#10b981)', 'linear-gradient(135deg,#d97706,#f59e0b)', 'linear-gradient(135deg,#dc2626,#ef4444)'];
const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

export default function DemandLettersPage() {
    const [letters, setLetters] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [overdue, setOverdue] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [selectedTenant, setSelectedTenant] = useState('');
    const [letterType, setLetterType] = useState<string>('Arrears');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [deadline, setDeadline] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('Print');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [l, t, o] = await Promise.all([getDemandLetters(locId ? { locationId: locId } : undefined), getTenants(locId ?? undefined), getOverdueTenants(locId ?? undefined as any)]);
            setLetters(l); setTenants(t.filter((x: any) => x.status === 'Active')); setOverdue(o);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setGlobalLocationId(lid); loadData(lid);
        const handler = (e: any) => { setGlobalLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const handleTemplateSelect = (type: string) => { setLetterType(type); const tmpl = LETTER_TEMPLATES[type]; if (tmpl) { setSubject(tmpl.subject); setBody(tmpl.body); } };
    const handleTenantSelect = (tenantId: string) => {
        setSelectedTenant(tenantId);
        const tenant = tenants.find((t: any) => t.tenant_id === parseInt(tenantId));
        if (tenant) { const name = tenant.tenant_name; const unit = tenant.arms_units?.unit_name || ''; const balance = String(tenant.balance || 0); const location = tenant.arms_locations?.location_name || ''; setSubject(prev => prev.replace('{name}', name).replace('{unit}', unit).replace('{balance}', balance).replace('{location}', location)); setBody(prev => prev.replace('{name}', name).replace('{unit}', unit).replace('{balance}', balance).replace('{location}', location)); }
    };

    const handleCreate = async () => {
        if (!selectedTenant || !subject || !body) return toast.error('Fill all required fields');
        const tenant = tenants.find((t: any) => t.tenant_id === parseInt(selectedTenant));
        try {
            await createDemandLetter({ tenant_id: parseInt(selectedTenant), location_id: tenant?.location_id || undefined, unit_id: tenant?.unit_id || undefined, letter_type: letterType, subject, body, amount_owed: tenant?.balance || 0, deadline_date: deadline || undefined, delivery_method: deliveryMethod, issued_by: 'Admin' });
            toast.success('✅ Demand letter issued'); setShowCreate(false); setSelectedTenant(''); setSubject(''); setBody(''); loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const handlePrint = (letter: any) => {
        const printContent = `<html><head><title>${letter.subject}</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#000}h1{font-size:18px;border-bottom:2px solid #000;padding-bottom:10px}.meta{font-size:12px;color:#333;margin:20px 0}p{font-size:14px;line-height:1.8;white-space:pre-line}.footer{margin-top:40px;border-top:1px solid #ccc;padding-top:10px;font-size:11px;color:#666}</style></head><body><h1>${letter.subject}</h1><div class="meta">Date: ${new Date(letter.issued_date).toLocaleDateString('en-KE')} | Ref: DL-${String(letter.letter_id).padStart(4, '0')} | Type: ${letter.letter_type}</div><p>${letter.body}</p><div class="footer">Alpha Rental Management System (ARMS) | This is a computer-generated document</div></body></html>`;
        const w = window.open('', '_blank'); if (w) { w.document.write(printContent); w.document.close(); w.print(); }
    };

    const acknowledged = letters.filter(l => l.tenant_acknowledged).length;
    const pending = letters.filter(l => l.status === 'Issued' && !l.tenant_acknowledged).length;
    const totalOwed = overdue.reduce((s, t) => s + (t.balance || 0), 0);

    const filteredLetters = useMemo(() => {
        let items = [...letters];
        if (search) { const s = search.toLowerCase(); items = items.filter(l => l.arms_tenants?.tenant_name?.toLowerCase().includes(s) || l.letter_type?.toLowerCase().includes(s) || l.subject?.toLowerCase().includes(s)); }
        return items;
    }, [letters, search]);

    const totalPages = Math.max(1, Math.ceil(filteredLetters.length / pageSize));
    const paginatedLetters = filteredLetters.slice((page - 1) * pageSize, page * pageSize);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}>📜</div><div className="absolute -inset-2 rounded-3xl border-2 border-red-200 animate-ping opacity-30" /></div>
            <p className="text-sm font-bold text-gray-500">Loading Demand Letters…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h1 className="page-title">📜 Demand Letters</h1><p className="text-sm text-gray-500 mt-1">Arrears notices • Eviction warnings • KRA-compliant</p></div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 transition"><FiRefreshCw size={15} /></button>
                    <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><FiPlus size={14} /> New Letter</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Overdue Tenants', value: overdue.length, emoji: '⚠️', color: '#ef4444', sub: fmt(totalOwed), pulse: overdue.length > 0 },
                    { label: 'Letters Issued', value: letters.length, emoji: '📜', color: '#6366f1', sub: 'Total generated', pulse: false },
                    { label: 'Acknowledged', value: acknowledged, emoji: '✅', color: '#059669', sub: 'Tenant confirmed', pulse: false },
                    { label: 'Pending Response', value: pending, emoji: '⏳', color: '#f59e0b', sub: 'Awaiting ack', pulse: pending > 0 },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p><span className="text-xl">{card.emoji}</span></div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p><p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        {card.pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: card.color }} />}
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* Search & Table */}
            <div className="space-y-4">
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[220px]">
                            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search tenant, type, subject…" className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-red-300 focus:ring-4 focus:ring-red-50 transition-all" />
                            {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                        </div>
                        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                        </select>
                        <p className="ml-auto text-xs font-bold text-gray-400">{filteredLetters.length} results</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                            <thead><tr>
                                {[
                                    { label: '#', col: C.num }, { label: '📅 Date', col: C.date }, { label: '👤 Tenant', col: C.name }, { label: '🏷️ Type', col: C.type },
                                    { label: '📋 Subject', col: C.subject }, { label: '💰 Amount', col: C.amount }, { label: '✅ Status', col: C.status }, { label: '⚡ Actions', col: C.actions },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>{h.label}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {paginatedLetters.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-16 text-gray-400"><div className="flex flex-col items-center gap-2"><span className="text-5xl">📜</span><p className="text-sm font-medium">No demand letters yet</p><p className="text-xs">Create your first letter above</p></div></td></tr>
                                ) : paginatedLetters.map((l, idx) => (
                                    <tr key={l.letter_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{(page - 1) * pageSize + idx + 1}</td>
                                        <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{new Date(l.issued_date).toLocaleDateString('en-KE')}</td>
                                        <td className="px-3 py-3 font-bold" style={{ background: C.name.bg + '60', color: C.name.text }}>{l.arms_tenants?.tenant_name}</td>
                                        <td className="px-3 py-3" style={{ background: C.type.bg + '60' }}>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${l.letter_type === 'Eviction' ? 'bg-red-50 text-red-700 border-red-200' : l.letter_type === 'Final_Demand' ? 'bg-orange-50 text-orange-700 border-orange-200' : l.letter_type === 'Notice' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                {l.letter_type === 'Final_Demand' ? '🚨 Final Demand' : l.letter_type === 'Eviction' ? '🏚️ Eviction' : l.letter_type === 'Notice' ? '📢 Notice' : '⚠️ Arrears'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 max-w-[200px] truncate" style={{ background: C.subject.bg + '60', color: C.subject.text }}>{l.subject}</td>
                                        <td className="px-3 py-3 text-right font-extrabold" style={{ background: C.amount.bg + '60', color: C.amount.text }}>{fmt(l.amount_owed)}</td>
                                        <td className="px-3 py-3" style={{ background: C.status.bg + '60' }}>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${l.status === 'Draft' ? 'bg-gray-50 text-gray-600 border-gray-200' : l.tenant_acknowledged ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                {l.tenant_acknowledged ? '✅ Acknowledged' : l.status === 'Draft' ? '📝 Draft' : '⏳ Issued'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3" style={{ background: C.actions.bg + '60' }}>
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => handlePrint(l)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition" title="Print"><FiPrinter size={13} /></button>
                                                {!l.tenant_acknowledged && (
                                                    <button onClick={async () => { await updateDemandLetter(l.letter_id, { tenant_acknowledged: true, acknowledged_at: new Date().toISOString() }); loadData(globalLocationId); toast.success('✅ Marked as acknowledged'); }}
                                                        className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition" title="Mark Acknowledged"><FiCheck size={13} /></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredLetters.length > 0 && (
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                            <p className="text-xs text-gray-400">{Math.min((page - 1) * pageSize + 1, filteredLetters.length)}–{Math.min(page * pageSize, filteredLetters.length)} of {filteredLetters.length}</p>
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronLeft size={14} /></button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map(p => (
                                    <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-red-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                                ))}
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronRight size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Letter Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal-content" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">📜 Create Demand Letter</h2><p className="text-white/70 text-xs mt-0.5">Legal notice generation</p></div>
                            <button onClick={() => setShowCreate(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">👤 Tenant *</label><select value={selectedTenant} onChange={e => handleTenantSelect(e.target.value)} className="select-field"><option value="">Select tenant</option>{overdue.map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} - {t.arms_units?.unit_name} (Bal: {fmt(t.balance)})</option>)}{tenants.filter((t: any) => !overdue.find((o: any) => o.tenant_id === t.tenant_id)).map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} - {t.arms_units?.unit_name}</option>)}</select></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏷️ Letter Type</label><select value={letterType} onChange={e => handleTemplateSelect(e.target.value)} className="select-field"><option value="Arrears">⚠️ Arrears Notice</option><option value="Eviction">🏚️ Eviction Notice</option><option value="Final_Demand">🚨 Final Demand</option><option value="Notice">📢 General Notice</option></select></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📋 Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} className="input-field" /></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📝 Letter Body</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="input-field font-mono text-xs" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📅 Deadline</label><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="input-field" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📨 Delivery</label><select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)} className="select-field"><option>Print</option><option>SMS</option><option>WhatsApp</option><option>Email</option></select></div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowCreate(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}><FiSend size={14} /> Issue Letter</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
