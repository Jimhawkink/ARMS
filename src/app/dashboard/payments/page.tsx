'use client';
import { useState, useEffect, useCallback } from 'react';
import { getPayments, recordPayment, deletePayment, updatePaymentNotes, getTenants, getLocations, getMpesaTransactions, autoMatchMpesa, autoMatchAllUnmatched, c2bSupabase, getAccumulatedArrearsForTenant } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiPlus, FiRefreshCw, FiCheck, FiLink, FiDollarSign, FiCreditCard, FiSmartphone, FiClock, FiFileText, FiPrinter, FiEdit2, FiTrash2, FiX, FiAlertTriangle, FiSave } from 'react-icons/fi';
import RentReceipt from '@/components/RentReceipt';

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseNoteTag = (notes: string, tag: string): number => {
    if (!notes) return 0;
    const m = notes.match(new RegExp(`\\[${tag}:(\\d+(?:\\.\\d+)?)\\]`));
    return m ? parseFloat(m[1]) : 0;
};
const cleanNoteDisplay = (notes: string) =>
    (notes || '').replace(/\[Month:[^\]]+\]/g,'').replace(/\[Time:[^\]]+\]/g,'').replace(/\[ArrearsPaid:[^\]]+\]/g,'').replace(/\[CurrentRentPaid:[^\]]+\]/g,'').replace(/\[BillsCleared:[^\]]+\]/g,'').replace(/\[ArrearMonths:[^\]]+\]/g,'').replace(/\[Credit:[^\]]+\]/g,'').trim();

const buildWhatsAppLink = (phone: string, name: string, amount: number, months: string[]) => {
    const fmt = (n: number) => `KES ${n.toLocaleString()}`;
    const monthLabels = months.map(m => { try { return new Date(m+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'}); } catch { return m; } });
    const msg = [`🏠 *ARMS Rent Reminder*`,`━━━━━━━━━━━━━━━━`,`Dear *${name}*,`,``,`Outstanding rent balance:`,`💰 *${fmt(amount)}*`,`📅 Period: ${monthLabels.join(', ') || 'current period'}`,``,`Please pay via M-Pesa or cash. Thank you! 🙏`,`━━━━━━━━━━━━━━━━`,`📞 Alpha Rental Management`].join('\n');
    const wap = phone.replace(/^0/,'254').replace(/[^0-9]/g,'');
    return `https://wa.me/${wap}?text=${encodeURIComponent(msg)}`;
};

const COL = {
    date:{bg:'#eef2ff',text:'#4338ca',head:'#c7d2fe'}, tenant:{bg:'#f8fafc',text:'#1e293b',head:'#e2e8f0'},
    location:{bg:'#f1f5f9',text:'#475569',head:'#e2e8f0'}, month:{bg:'#faf5ff',text:'#7c3aed',head:'#e9d5ff'},
    totalPaid:{bg:'#f0fdf4',text:'#15803d',head:'#bbf7d0'}, arrearsPaid:{bg:'#fff7ed',text:'#c2410c',head:'#fed7aa'},
    currentRent:{bg:'#eff6ff',text:'#1d4ed8',head:'#bfdbfe'}, arrearsRem:{bg:'#fef9c3',text:'#92400e',head:'#fde68a'},
    method:{bg:'#f0fdfa',text:'#0f766e',head:'#99f6e4'}, receipt:{bg:'#fafafa',text:'#6b7280',head:'#f3f4f6'},
    by:{bg:'#fafafa',text:'#9ca3af',head:'#f3f4f6'}, actions:{bg:'#f5f3ff',text:'#6d28d9',head:'#ddd6fe'},
};

const fmt = (n: number) => `KES ${(n||0).toLocaleString()}`;

export default function PaymentsPage() {
    const [payments, setPayments] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [mpesaTxns, setMpesaTxns] = useState<any[]>([]);
    const [c2bPayments, setC2bPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPayModal, setShowPayModal] = useState(false);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [showReceipt, setShowReceipt] = useState<any>(null);
    const [editingPayment, setEditingPayment] = useState<any>(null);
    const [editForm, setEditForm] = useState({ reference_no: '', notes_display: '' });
    const [deletingPayment, setDeletingPayment] = useState<any>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // ── Callback linking inside pay modal ─────────────────────────────────────
    const [paymentSource, setPaymentSource] = useState<'manual' | 'mpesa' | 'jenga'>('manual');
    const [selectedCallback, setSelectedCallback] = useState<any>(null);
    const [loadingCallbacks, setLoadingCallbacks] = useState(false);

    // ── Real bill arrears for selected tenant ─────────────────────────────────
    const [tenantArrearData, setTenantArrearData] = useState<any>(null);
    const [loadingArrears, setLoadingArrears] = useState(false);

    const [payForm, setPayForm] = useState({
        tenant_id: 0, amount: '', payment_method: 'Cash',
        mpesa_receipt: '', mpesa_phone: '', reference_no: '', notes: '',
        payment_month: new Date().toISOString().slice(0, 7)
    });

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [p, t, l, m] = await Promise.all([
                getPayments({ locationId: locId ?? undefined }),
                getTenants(locId ?? undefined),
                getLocations(),
                getMpesaTransactions(false)
            ]);
            setPayments(p); setTenants(t.filter((te: any) => te.status === 'Active'));
            setLocations(l); setMpesaTxns(m);
        } catch { toast.error('Failed to load payments'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setLocationId(lid); loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    // ── Real arrears when tenant changes ─────────────────────────────────────
    useEffect(() => {
        if (!payForm.tenant_id) { setTenantArrearData(null); return; }
        setLoadingArrears(true);
        getAccumulatedArrearsForTenant(payForm.tenant_id)
            .then(d => setTenantArrearData(d)).catch(() => setTenantArrearData(null))
            .finally(() => setLoadingArrears(false));
    }, [payForm.tenant_id]);

    // ── Load C2B / Jenga callbacks ─────────────────────────────────────────
    const loadCallbacks = async () => {
        setLoadingCallbacks(true);
        try {
            const { data } = await c2bSupabase.from('c2b_transactions').select('*').order('created_at', { ascending: false }).limit(100);
            setC2bPayments(data || []);
        } catch { setC2bPayments([]); }
        setLoadingCallbacks(false);
    };

    const openPayModal = () => {
        setPayForm({ tenant_id: 0, amount: '', payment_method: 'Cash', mpesa_receipt: '', mpesa_phone: '', reference_no: '', notes: '', payment_month: new Date().toISOString().slice(0, 7) });
        setPaymentSource('manual'); setSelectedCallback(null); setTenantArrearData(null);
        setShowPayModal(true);
        loadCallbacks(); // auto-load callbacks
    };

    // ── Select a callback → auto-fill form + auto-match tenant by phone ─────────
    const selectCallback = (txn: any) => {
        setSelectedCallback(txn);
        const amount = txn.trans_amount || txn.amount || 0;
        const code = txn.trans_id || txn.mpesa_receipt || txn.reference || '';
        const rawPhone = txn.msisdn || txn.phone || '';

        // Normalise phone: strip leading 254 → 0XXXXXXXXX for comparison
        const normalizePhone = (p: string) => p.replace(/[^0-9]/g, '').replace(/^254/, '0');
        const txnPhone = normalizePhone(rawPhone);

        // Try to auto-match a tenant by phone number
        const matchedTenant = tenants.find((t: any) => {
            const tp = normalizePhone(t.phone || '');
            return tp.length >= 9 && tp === txnPhone;
        });

        if (matchedTenant) {
            setPayForm(f => ({
                ...f, amount: amount.toString(), mpesa_receipt: code,
                mpesa_phone: rawPhone, payment_method: 'M-Pesa',
                tenant_id: matchedTenant.tenant_id,
            }));
            toast.success(`🎯 Auto-matched → ${matchedTenant.tenant_name}`, { icon: '📱' });
        } else {
            setPayForm(f => ({
                ...f, amount: amount.toString(), mpesa_receipt: code,
                mpesa_phone: rawPhone, payment_method: 'M-Pesa',
            }));
        }
    };

    const handlePay = async () => {
        if (!payForm.tenant_id || !payForm.amount) { toast.error('Tenant and amount required'); return; }
        const tenant = tenants.find((t: any) => t.tenant_id === payForm.tenant_id);
        if (!tenant) { toast.error('Tenant not found'); return; }
        try {
            const user = JSON.parse(localStorage.getItem('arms_user') || '{}');
            const paymentTime = new Date().toISOString();
            const result = await recordPayment({
                tenant_id: payForm.tenant_id, amount: parseFloat(payForm.amount),
                payment_method: payForm.payment_method,
                mpesa_receipt: payForm.mpesa_receipt || undefined,
                mpesa_phone: payForm.mpesa_phone || undefined,
                reference_no: payForm.reference_no || undefined,
                notes: `[Month: ${payForm.payment_month}] [Time: ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}] ${payForm.notes || ''}`.trim(),
                recorded_by: user.name || 'Admin',
                location_id: tenant?.location_id
            });
            toast.success('Payment recorded! Generating receipt…');
            const balanceBefore = tenantArrearData?.totalDue ?? (tenant.balance || 0);
            setShowReceipt({
                tenant_name: tenant.tenant_name, phone: tenant.phone || '', id_number: tenant.id_number || '',
                unit_name: tenant.arms_units?.unit_name || '-', location_name: tenant.arms_locations?.location_name || '-',
                monthly_rent: tenant.monthly_rent || 0, amount: parseFloat(payForm.amount),
                payment_method: payForm.payment_method, mpesa_receipt: payForm.mpesa_receipt || '',
                payment_date: paymentTime, payment_month: payForm.payment_month,
                balance_before: balanceBefore, balance_after: Math.max(0, balanceBefore - parseFloat(payForm.amount)),
                recorded_by: user.name || 'Admin', arrears_paid: result.arrearsPaid ?? 0, current_rent_paid: result.currentRentPaid ?? 0,
            });
            setShowPayModal(false); loadData(locationId);
        } catch (err: any) { toast.error(err.message || 'Failed'); }
    };

    const handleDeleteConfirm = async () => {
        if (!deletingPayment) return;
        setActionLoading(true);
        try { await deletePayment(deletingPayment.payment_id); toast.success('Deleted & balances restored'); setDeletingPayment(null); loadData(locationId); } catch (err: any) { toast.error(err.message || 'Delete failed'); }
        setActionLoading(false);
    };

    const handleEditSave = async () => {
        if (!editingPayment) return; setActionLoading(true);
        try { await updatePaymentNotes(editingPayment.payment_id, { reference_no: editForm.reference_no || undefined, notes: editForm.notes_display }); toast.success('Updated'); setEditingPayment(null); loadData(locationId); } catch (err: any) { toast.error(err.message || 'Update failed'); }
        setActionLoading(false);
    };

    const viewReceipt = (p: any) => {
        const monthMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
        const arrearsPaid = parseNoteTag(p.notes, 'ArrearsPaid');
        const currentRentPaid = parseNoteTag(p.notes, 'CurrentRentPaid');
        setShowReceipt({ payment_id: p.payment_id, tenant_name: p.arms_tenants?.tenant_name||'-', phone: p.arms_tenants?.phone||'', id_number: p.arms_tenants?.id_number||'', unit_name: p.arms_tenants?.arms_units?.unit_name||'-', location_name: p.arms_locations?.location_name||'-', monthly_rent: p.arms_tenants?.monthly_rent||0, amount: p.amount, payment_method: p.payment_method, mpesa_receipt: p.mpesa_receipt||'', payment_date: p.payment_date, payment_month: monthMatch?monthMatch[1]:'', balance_before: p.amount+(p.arms_tenants?.balance||0), balance_after: p.arms_tenants?.balance||0, recorded_by: p.recorded_by||'', arrears_paid: arrearsPaid, current_rent_paid: currentRentPaid||p.amount-arrearsPaid });
    };

    const totalAll = payments.reduce((s,p) => s+(p.amount||0),0);
    const todayTotal = payments.filter(p => p.payment_date?.startsWith(new Date().toISOString().split('T')[0])).reduce((s,p) => s+(p.amount||0),0);
    const totalArrearsPaid = payments.reduce((s,p) => s+(p.arrears_paid||0),0);
    const totalCurrentRentPaid = payments.reduce((s,p) => s+(p.current_rent_paid||0),0);
    const selectedTenant = tenants.find((t: any) => t.tenant_id === payForm.tenant_id);

    // ── Live allocation preview ───────────────────────────────────────────────
    const liveAmount = parseFloat(payForm.amount)||0;
    const realArrearsTotal = tenantArrearData?.arrearsTotal ?? 0;
    const realCurrentMonthDue = tenantArrearData?.currentMonthDue ?? 0;
    const realTotalDue = tenantArrearData?.totalDue ?? (selectedTenant?.balance||0);
    const liveArrearsPaid = Math.min(liveAmount, realArrearsTotal);
    const liveCurrentRentPaid = Math.max(0, Math.min(liveAmount - liveArrearsPaid, realCurrentMonthDue));
    const liveCredit = Math.max(0, liveAmount - realTotalDue);
    const liveBalanceAfter = Math.max(0, realTotalDue - liveAmount);

    // Callbacks for current tab
    const activeCallbacks = paymentSource === 'mpesa' ? mpesaTxns : c2bPayments;

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>💰</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30"/>
            </div>
            <p className="text-sm font-bold text-gray-500">Loading payments…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="page-title">💰 Payments</h1>
                    <p className="text-sm text-gray-500 mt-1">Record, track and manage rent payments · FIFO arrears-first allocation</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => loadData(locationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition"><FiRefreshCw size={16}/></button>
                    <button onClick={openPayModal} className="btn-primary flex items-center gap-2"><FiPlus size={16}/> Record Payment</button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    {label:'Total Records',value:payments.length,icon:FiFileText,color:'#6366f1',bg:'#eef2ff',sub:'All time'},
                    {label:"Today's Collection",value:fmt(todayTotal),icon:FiDollarSign,color:'#10b981',bg:'#f0fdf4',sub:'Today'},
                    {label:'Total Collected',value:fmt(totalAll),icon:FiCreditCard,color:'#3b82f6',bg:'#eff6ff',sub:'All payments'},
                    {label:'Arrears Paid',value:fmt(totalArrearsPaid),icon:FiAlertTriangle,color:'#c2410c',bg:'#fff7ed',sub:'⬇ Old balances cleared'},
                    {label:'Current Rent Paid',value:fmt(totalCurrentRentPaid),icon:FiSmartphone,color:'#7c3aed',bg:'#faf5ff',sub:'✅ Monthly rent'},
                ].map((card,i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{borderLeftWidth:4,borderLeftColor:card.color}}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <div className="p-2.5 rounded-xl" style={{background:card.bg}}><card.icon size={18} style={{color:card.color}}/></div>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.05]" style={{background:card.color}}/>
                    </div>
                ))}
            </div>

            {/* Ultra DataGrid */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h2 className="text-sm font-bold text-gray-900">🗂️ Payment Records</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">{payments.length} total · FIFO arrears-first</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {[{label:'Arrears Paid',color:COL.arrearsPaid.text},{label:'Current Rent',color:COL.currentRent.text},{label:'Rem. Arrears',color:COL.arrearsRem.text}].map(l => (
                            <span key={l.label} className="text-[10px] font-bold px-2 py-1 rounded-lg border" style={{color:l.color,borderColor:l.color+'40',background:l.color+'10'}}>{l.label}</span>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{fontSize:12}}>
                        <thead>
                            <tr>
                                {[{label:'Date & Time',col:COL.date},{label:'Tenant',col:COL.tenant},{label:'Location',col:COL.location},{label:'Month',col:COL.month},{label:'Total Paid',col:COL.totalPaid},{label:'⬇ Arrears Paid',col:COL.arrearsPaid},{label:'🏠 Current Rent',col:COL.currentRent},{label:'⏳ Arrears Rem.',col:COL.arrearsRem},{label:'Method',col:COL.method},{label:'Receipt/Ref',col:COL.receipt},{label:'By',col:COL.by},{label:'Actions',col:COL.actions}].map((h,i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{background:h.col.head,color:h.col.text,borderBottom:`2px solid ${h.col.text}25`}}>{h.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {payments.length === 0 ? (
                                <tr><td colSpan={12} className="text-center py-12 text-gray-400">
                                    <div className="flex flex-col items-center gap-2"><span className="text-4xl">📭</span><p className="text-sm font-medium">No payments yet</p></div>
                                </td></tr>
                            ) : payments.map(p => {
                                const monthMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
                                const timeMatch = p.notes?.match(/\[Time: (.+?)\]/);
                                const payMonth = monthMatch ? monthMatch[1] : '-';
                                const payTime = timeMatch ? timeMatch[1] : new Date(p.payment_date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
                                const arrearsPaid = p.arrears_paid||0;
                                const currentRentPaid = p.current_rent_paid||(p.amount-arrearsPaid);
                                const tenantBalance = p.arms_tenants?.balance||0;
                                const monthlyRent = p.arms_tenants?.monthly_rent||0;
                                const arrearsRemaining = Math.max(0, tenantBalance - monthlyRent);
                                return (
                                    <tr key={p.payment_id} className="transition-colors" style={{borderBottom:'1px solid #f1f5f9'}}
                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background='#fafbff'}
                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background=''}>
                                        <td className="px-3 py-3" style={{background:COL.date.bg+'80'}}>
                                            <div className="font-semibold text-xs" style={{color:COL.date.text}}>{new Date(p.payment_date).toLocaleDateString()}</div>
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1"><FiClock size={9}/> {payTime}</div>
                                        </td>
                                        <td className="px-3 py-3 font-semibold text-xs text-gray-900" style={{background:COL.tenant.bg+'80'}}>{p.arms_tenants?.tenant_name||'-'}</td>
                                        <td className="px-3 py-3 text-[11px]" style={{background:COL.location.bg+'80',color:COL.location.text}}>{p.arms_locations?.location_name||'-'}</td>
                                        <td className="px-3 py-3" style={{background:COL.month.bg+'80'}}>
                                            <span className="text-[11px] font-bold" style={{color:COL.month.text}}>{payMonth!=='-' ? new Date(payMonth+'-01').toLocaleDateString('en-US',{month:'short',year:'numeric'}) : '-'}</span>
                                        </td>
                                        <td className="px-3 py-3" style={{background:COL.totalPaid.bg+'80'}}><span className="text-xs font-extrabold" style={{color:COL.totalPaid.text}}>{fmt(p.amount)}</span></td>
                                        <td className="px-3 py-3" style={{background:COL.arrearsPaid.bg+'80'}}>
                                            {arrearsPaid>0 ? <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{background:COL.arrearsPaid.head,color:COL.arrearsPaid.text}}>{fmt(arrearsPaid)}</span> : <span className="text-[10px] text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-3" style={{background:COL.currentRent.bg+'80'}}>
                                            {currentRentPaid>0 ? <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{background:COL.currentRent.head,color:COL.currentRent.text}}>{fmt(currentRentPaid)}</span> : <span className="text-[10px] text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-3" style={{background:COL.arrearsRem.bg+'80'}}>
                                            {arrearsRemaining>0 ? <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{background:COL.arrearsRem.head,color:COL.arrearsRem.text}}>{fmt(arrearsRemaining)}</span> : <span className="text-[10px] font-bold text-green-600">✓ Clear</span>}
                                        </td>
                                        <td className="px-3 py-3" style={{background:COL.method.bg+'80'}}>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${p.payment_method==='M-Pesa'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}`}>{p.payment_method==='M-Pesa'?'📱':'💵'} {p.payment_method}</span>
                                        </td>
                                        <td className="px-3 py-3 text-[10px]" style={{background:COL.receipt.bg+'80',color:COL.receipt.text}}>{p.mpesa_receipt||p.reference_no||'-'}</td>
                                        <td className="px-3 py-3 text-[10px]" style={{background:COL.by.bg+'80',color:COL.by.text}}>{p.recorded_by||'-'}</td>
                                        <td className="px-3 py-3" style={{background:COL.actions.bg+'80'}}>
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => viewReceipt(p)} className="p-1.5 rounded-lg transition hover:scale-110" style={{background:COL.month.head,color:COL.month.text}}><FiPrinter size={13}/></button>
                                                <button onClick={() => { setEditingPayment(p); setEditForm({reference_no:p.reference_no||'',notes_display:cleanNoteDisplay(p.notes)}); }} className="p-1.5 rounded-lg transition hover:scale-110" style={{background:COL.currentRent.head,color:COL.currentRent.text}}><FiEdit2 size={13}/></button>
                                                <button onClick={() => setDeletingPayment(p)} className="p-1.5 rounded-lg transition hover:scale-110" style={{background:'#fee2e2',color:'#b91c1c'}}><FiTrash2 size={13}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {payments.length > 0 && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                        <p className="text-xs text-gray-400">{payments.length} records</p>
                        <div className="flex items-center gap-4 text-xs font-bold flex-wrap">
                            <span style={{color:COL.totalPaid.text}}>Total: {fmt(totalAll)}</span>
                            <span style={{color:COL.arrearsPaid.text}}>Arrears: {fmt(totalArrearsPaid)}</span>
                            <span style={{color:COL.currentRent.text}}>Current Rent: {fmt(totalCurrentRentPaid)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ════════════════ RECORD PAYMENT MODAL ════════════════ */}
            {showPayModal && (
                <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
                    <div className="modal-content" style={{maxWidth:680}} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-6 py-5 relative overflow-hidden" style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)'}}>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">💰 Record Rent Payment</h2>
                            <p className="text-indigo-200 text-sm mt-0.5">Select payment source → choose tenant → confirm</p>
                        </div>

                        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">

                            {/* ── STEP 1: Payment Source ─────────────────────── */}
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">① Payment Source</p>
                                <div className="flex gap-2 p-1.5 rounded-2xl bg-gray-100">
                                    {[
                                        {id:'manual',label:'💵 Manual',desc:'Cash / Bank Transfer'},
                                        {id:'mpesa', label:'📱 M-Pesa',desc:'From callback'},
                                        {id:'jenga', label:'🔗 Jenga/C2B',desc:'From callback'},
                                    ].map(src => (
                                        <button key={src.id}
                                            onClick={() => { setPaymentSource(src.id as any); setSelectedCallback(null); if (src.id!=='manual') setPayForm(f=>({...f,payment_method:'M-Pesa',mpesa_receipt:'',mpesa_phone:'',amount:''})); else setPayForm(f=>({...f,payment_method:'Cash',mpesa_receipt:'',mpesa_phone:''}))}}>
                                            <div className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all text-center ${paymentSource===src.id ? 'bg-white shadow-md text-indigo-700 scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}>
                                                <div>{src.label}</div>
                                                <div className="text-[9px] font-normal opacity-60 mt-0.5">{src.desc}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── CALLBACK TRANSACTION GRID (M-Pesa or Jenga) ── */}
                            {paymentSource !== 'manual' && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                            {paymentSource==='mpesa' ? '📱 M-Pesa Transactions — click a row to select' : '🔗 Jenga / C2B Transactions — click a row to select'}
                                        </p>
                                        <button onClick={loadCallbacks} disabled={loadingCallbacks} className="text-[10px] font-bold px-2 py-1 rounded-lg text-indigo-600 hover:bg-indigo-50 flex items-center gap-1">
                                            {loadingCallbacks ? <div className="spinner" style={{width:10,height:10}}/> : <FiRefreshCw size={10}/>} Refresh
                                        </button>
                                    </div>
                                    <div className="rounded-2xl border overflow-hidden" style={{borderColor:'#e2e8f0'}}>
                                        {loadingCallbacks ? (
                                            <div className="flex items-center justify-center py-8 gap-2">
                                                <div className="spinner" style={{width:16,height:16}}/>
                                                <span className="text-xs text-gray-400">Loading transactions…</span>
                                            </div>
                                        ) : (
                                            <div className="max-h-56 overflow-y-auto">
                                                <table className="w-full" style={{fontSize:12}}>
                                                    <thead className="sticky top-0 z-10">
                                                        <tr style={{background:'linear-gradient(90deg,#f8fafc,#f1f5f9)'}}>
                                                            <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">👤 Name</th>
                                                            <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">📞 Phone</th>
                                                            <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-green-700">💰 Amount</th>
                                                            <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600">🏷 Code</th>
                                                            <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">🕐 Time</th>
                                                            <th className="px-4 py-2.5"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {activeCallbacks.length === 0 ? (
                                                            <tr><td colSpan={6} className="text-center py-6 text-gray-400">
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <span className="text-2xl">📭</span>
                                                                    <p className="text-xs font-medium">No unmatched transactions found</p>
                                                                    <p className="text-[10px] text-gray-300">Transactions that have not been linked to a tenant appear here</p>
                                                                </div>
                                                            </td></tr>
                                                        ) : activeCallbacks.map((txn: any, i: number) => {
                                                            const isSelected = selectedCallback?.id === txn.id;
                                                            const name = `${txn.first_name||''} ${txn.last_name||''}`.trim() || 'Unknown Sender';
                                                            const amount = txn.trans_amount||txn.amount||0;
                                                            const code = txn.trans_id||txn.mpesa_receipt||txn.reference||'-';
                                                            const rawPhone = txn.msisdn||txn.phone||'-';
                                                            const time = txn.created_at ? new Date(txn.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '-';
                                                            // ── Phone auto-match badge ──
                                                            const normP = (p: string) => p.replace(/[^0-9]/g,'').replace(/^254/,'0');
                                                            const txnNorm = normP(rawPhone);
                                                            const matchedT = txnNorm.length >= 9 ? tenants.find((t:any) => normP(t.phone||'') === txnNorm) : null;
                                                            return (
                                                                <tr key={txn.id||i}
                                                                    className="cursor-pointer transition-all border-b border-gray-50"
                                                                    style={{background: isSelected ? 'linear-gradient(90deg,#f0fdf4,#dcfce7)' : matchedT ? '#fafff5' : undefined}}
                                                                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background='#eff6ff'; }}
                                                                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = isSelected ? '' : matchedT ? '#fafff5' : ''; }}
                                                                    onClick={() => selectCallback(txn)}>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                                                                style={{background: isSelected ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
                                                                                {name.charAt(0).toUpperCase()}
                                                                            </div>
                                                                            <span className="font-semibold text-gray-900">{name}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-gray-500">{rawPhone}</td>
                                                                    <td className="px-4 py-3">
                                                                        <span className="font-extrabold text-green-700">{fmt(amount)}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{code}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-gray-400 text-[10px]">{time}</td>
                                                                    <td className="px-4 py-3 min-w-[130px]">
                                                                        {/* Auto-match badge */}
                                                                        {matchedT && !isSelected && (
                                                                            <div className="flex flex-col gap-1">
                                                                                <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 animate-pulse whitespace-nowrap">
                                                                                    🎯 {matchedT.tenant_name}
                                                                                </span>
                                                                                <span className="text-[9px] text-gray-400">Click to auto-select</span>
                                                                            </div>
                                                                        )}
                                                                        {isSelected ? (
                                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">
                                                                                <FiCheck size={10}/> Selected
                                                                            </span>
                                                                        ) : !matchedT ? (
                                                                            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition">
                                                                                Select →
                                                                            </span>
                                                                        ) : null}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                    {selectedCallback && (
                                        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                                            <FiCheck size={14} className="text-green-600"/>
                                            <p className="text-xs font-bold text-green-800">
                                                Selected: <span className="text-green-700">{`${selectedCallback.first_name||''} ${selectedCallback.last_name||''}`.trim()}</span> — {fmt(selectedCallback.trans_amount||selectedCallback.amount||0)} — Code: {selectedCallback.trans_id||selectedCallback.mpesa_receipt||'-'}
                                            </p>
                                            <button onClick={() => {setSelectedCallback(null); setPayForm(f=>({...f,amount:'',mpesa_receipt:'',mpesa_phone:''}));}} className="ml-auto text-gray-400 hover:text-red-500"><FiX size={14}/></button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── STEP 2: Tenant Select ─────────────────────── */}
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">② Select Tenant</p>
                                <select value={payForm.tenant_id} onChange={e => setPayForm({...payForm,tenant_id:parseInt(e.target.value)})} className="select-field">
                                    <option value={0}>Choose tenant…</option>
                                    {tenants.map((t: any) => (
                                        <option key={t.tenant_id} value={t.tenant_id}>
                                            {t.tenant_name} — {t.arms_units?.unit_name||'?'} ({t.arms_locations?.location_name||t.location_id})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Tenant bill breakdown */}
                            {selectedTenant && (
                                <div className="rounded-2xl overflow-hidden border" style={{borderColor:'#c7d2fe'}}>
                                    <div className="px-4 py-2.5 text-xs font-bold text-white" style={{background:'linear-gradient(90deg,#4f46e5,#7c3aed)'}}>📊 Actual Arrears from Billing Records</div>
                                    {loadingArrears ? (
                                        <div className="flex items-center justify-center p-4 gap-2"><div className="spinner" style={{width:14,height:14}}/><span className="text-xs text-gray-400">Calculating…</span></div>
                                    ) : tenantArrearData ? (
                                        <>
                                            <div className="grid grid-cols-3 gap-0">
                                                <div className="p-3 border-r" style={{background:'#fef2f2'}}>
                                                    <p className="text-[9px] font-bold uppercase text-red-400 mb-1">⏰ Prev. Arrears</p>
                                                    <p className="text-lg font-extrabold text-red-700">{fmt(tenantArrearData.arrearsTotal)}</p>
                                                    <p className="text-[10px] text-gray-400">{tenantArrearData.arrearsMonths.length} mth{tenantArrearData.arrearsMonths.length!==1?'s':''} overdue</p>
                                                </div>
                                                <div className="p-3 border-r" style={{background:'#eff6ff'}}>
                                                    <p className="text-[9px] font-bold uppercase text-blue-400 mb-1">🏠 Current Month</p>
                                                    <p className="text-lg font-extrabold text-blue-700">{fmt(tenantArrearData.currentMonthDue)}</p>
                                                    <p className="text-[10px] text-gray-400">Monthly rent</p>
                                                </div>
                                                <div className="p-3" style={{background:'#fef9c3'}}>
                                                    <p className="text-[9px] font-bold uppercase text-amber-600 mb-1">💰 Total Due</p>
                                                    <p className="text-lg font-extrabold text-amber-900">{fmt(tenantArrearData.totalDue)}</p>
                                                    <p className="text-[10px] text-gray-400">{tenantArrearData.bills.length} unpaid bills</p>
                                                </div>
                                            </div>
                                            {tenantArrearData.bills.length > 0 && (
                                                <div className="p-3 border-t bg-gray-50">
                                                    <p className="text-[9px] font-bold uppercase text-gray-400 mb-1.5">📅 Unpaid Bill Months</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {tenantArrearData.bills.map((bill: any) => {
                                                            const isArrear = bill.billing_month < new Date().toISOString().slice(0,7);
                                                            return (
                                                                <div key={bill.billing_id} className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold"
                                                                    style={isArrear ? {background:'#fee2e2',borderColor:'#fca5a5',color:'#b91c1c'} : {background:'#dbeafe',borderColor:'#93c5fd',color:'#1d4ed8'}}>
                                                                    <span>{isArrear?'⏰':'🏠'}</span>
                                                                    <span>{new Date(bill.billing_month+'-01').toLocaleDateString('en-US',{month:'short',year:'numeric'})}</span>
                                                                    <span className="font-extrabold">{fmt(bill.balance)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="p-3 bg-green-50 text-xs text-green-700 font-medium">✅ No unpaid bills — tenant is fully up to date!</div>
                                    )}
                                </div>
                            )}

                            {/* ── STEP 3: Payment Details ─────────────────────── */}
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">③ Payment Details</p>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 mb-1 block">📅 For Month *</label>
                                            <input type="month" value={payForm.payment_month} onChange={e => setPayForm({...payForm,payment_month:e.target.value})} className="input-field"/>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 mb-1 block">💳 Method</label>
                                            <select value={payForm.payment_method} onChange={e => setPayForm({...payForm,payment_method:e.target.value})} className="select-field">
                                                <option value="Cash">💵 Cash</option>
                                                <option value="M-Pesa">📱 M-Pesa</option>
                                                <option value="Bank Transfer">🏦 Bank Transfer</option>
                                                <option value="Jenga">🔗 Jenga</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">💰 Amount (KES) *</label>
                                        <input type="number" value={payForm.amount} onChange={e => setPayForm({...payForm,amount:e.target.value})} className="input-field text-lg font-bold" placeholder="0.00" readOnly={paymentSource!=='manual' && !!selectedCallback} style={paymentSource!=='manual'&&selectedCallback?{background:'#f0fdf4',borderColor:'#86efac'}:{}}/>
                                        {paymentSource!=='manual'&&selectedCallback&&<p className="text-[10px] text-green-600 mt-1">✓ Amount auto-filled from selected callback</p>}
                                    </div>
                                    {payForm.payment_method!=='Cash'&&payForm.payment_method!=='Bank Transfer'&&(
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-xs font-medium text-gray-700 mb-1 block">📝 Transaction Code</label><input value={payForm.mpesa_receipt} onChange={e => setPayForm({...payForm,mpesa_receipt:e.target.value})} className="input-field" placeholder="e.g. SJ12ABC456"/></div>
                                            <div><label className="text-xs font-medium text-gray-700 mb-1 block">📞 Phone</label><input value={payForm.mpesa_phone} onChange={e => setPayForm({...payForm,mpesa_phone:e.target.value})} className="input-field" placeholder="07XXXXXXXX"/></div>
                                        </div>
                                    )}
                                    <div><label className="text-xs font-medium text-gray-700 mb-1 block">📋 Notes</label><textarea value={payForm.notes} onChange={e => setPayForm({...payForm,notes:e.target.value})} className="input-field" rows={2} placeholder="Optional notes"/></div>
                                </div>
                            </div>

                            {/* ── Live Allocation Preview ─────────────────────── */}
                            {selectedTenant && liveAmount > 0 && (
                                <div className="rounded-2xl overflow-hidden border" style={{borderColor:'#a5b4fc'}}>
                                    <div className="px-4 py-2.5 text-xs font-bold text-white" style={{background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}}>💡 Live FIFO Allocation Preview</div>
                                    <div className="grid grid-cols-2 gap-0">
                                        <div className="p-3 border-r" style={{background:COL.arrearsPaid.bg}}>
                                            <p className="text-[9px] font-bold uppercase text-orange-400 mb-1">⬇ Arrears Cleared</p>
                                            <p className="text-base font-extrabold" style={{color:COL.arrearsPaid.text}}>{fmt(liveArrearsPaid)}</p>
                                            <p className="text-[10px] text-gray-400">of {fmt(realArrearsTotal)} overdue</p>
                                        </div>
                                        <div className="p-3" style={{background:COL.currentRent.bg}}>
                                            <p className="text-[9px] font-bold uppercase text-blue-400 mb-1">🏠 Current Month Rent</p>
                                            <p className="text-base font-extrabold" style={{color:COL.currentRent.text}}>{fmt(liveCurrentRentPaid)}</p>
                                            <p className="text-[10px] text-gray-400">of {fmt(realCurrentMonthDue)} due</p>
                                        </div>
                                        {liveCredit>0&&<div className="col-span-2 p-3 border-t" style={{background:'#f0fdf4',borderColor:'#bbf7d0'}}><div className="flex items-center justify-between"><span className="text-xs font-bold text-green-700">💳 Credit (overpayment)</span><span className="text-sm font-extrabold text-green-700">{fmt(liveCredit)}</span></div></div>}
                                        <div className="col-span-2 p-3 border-t" style={{background:liveBalanceAfter>0?'#fef2f2':'#f0fdf4',borderColor:liveBalanceAfter>0?'#fecaca':'#bbf7d0'}}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold" style={{color:liveBalanceAfter>0?'#b91c1c':'#15803d'}}>{liveBalanceAfter>0?'⚠️ Remaining Balance':'✅ Fully Settled'}</span>
                                                <span className="text-sm font-extrabold" style={{color:liveBalanceAfter>0?'#b91c1c':'#15803d'}}>{fmt(liveBalanceAfter)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
                            <button onClick={() => setShowPayModal(false)} className="btn-outline">Cancel</button>
                            <button onClick={handlePay} disabled={!payForm.tenant_id||!payForm.amount} className="btn-success flex items-center gap-2"><FiDollarSign size={16}/> Record & Print Receipt</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingPayment && (
                <div className="modal-overlay" onClick={() => setEditingPayment(null)}>
                    <div className="modal-content" style={{maxWidth:480}} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"><h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><FiEdit2 className="text-blue-500"/> Edit Payment</h2><button onClick={() => setEditingPayment(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><FiX size={16}/></button></div>
                        <div className="p-6 space-y-4">
                            <div className="bg-blue-50 rounded-xl p-3 text-sm border border-blue-100"><p className="font-bold text-blue-900">{editingPayment.arms_tenants?.tenant_name}</p><p className="text-blue-600 text-xs mt-0.5">{fmt(editingPayment.amount)} • {new Date(editingPayment.payment_date).toLocaleDateString()}</p></div>
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">📝 Reference</label><input value={editForm.reference_no} onChange={e => setEditForm({...editForm,reference_no:e.target.value})} className="input-field"/></div>
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">📋 Notes</label><textarea value={editForm.notes_display} onChange={e => setEditForm({...editForm,notes_display:e.target.value})} className="input-field" rows={3}/></div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
                            <button onClick={() => setEditingPayment(null)} className="btn-outline">Cancel</button>
                            <button onClick={handleEditSave} disabled={actionLoading} className="btn-primary flex items-center gap-2">{actionLoading?<div className="spinner" style={{width:14,height:14}}/>:<FiSave size={14}/>} Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm */}
            {deletingPayment && (
                <div className="modal-overlay" onClick={() => setDeletingPayment(null)}>
                    <div className="modal-content" style={{maxWidth:420}} onClick={e => e.stopPropagation()}>
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4"><FiTrash2 size={28} className="text-red-600"/></div>
                            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Payment?</h2>
                            <p className="text-xl font-extrabold text-red-600 my-2">{fmt(deletingPayment.amount)}</p>
                            <p className="text-sm text-gray-500">for <strong>{deletingPayment.arms_tenants?.tenant_name}</strong></p>
                            <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mt-3 border border-amber-100">⚠️ Balances will be restored automatically.</p>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setDeletingPayment(null)} className="btn-outline flex-1">Cancel</button>
                            <button onClick={handleDeleteConfirm} disabled={actionLoading} className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition flex items-center justify-center gap-2">{actionLoading?<div className="spinner" style={{width:14,height:14}}/>:<FiTrash2 size={14}/>} Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {showReceipt && <RentReceipt payment={showReceipt} onClose={() => setShowReceipt(null)}/>}
        </div>
    );
}
