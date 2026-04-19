'use client';
import { useState, useEffect, useCallback } from 'react';
import { getPayments, recordPayment, deletePayment, updatePaymentNotes, getTenants, getLocations, getMpesaTransactions, autoMatchMpesa, autoMatchAllUnmatched, c2bSupabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiPlus, FiRefreshCw, FiCheck, FiLink, FiDollarSign, FiCreditCard, FiSmartphone, FiClock, FiFileText, FiPrinter, FiEdit2, FiTrash2, FiX, FiAlertTriangle, FiSave } from 'react-icons/fi';
import RentReceipt from '@/components/RentReceipt';

// ── helpers ──────────────────────────────────────────────
const parseNoteTag = (notes: string, tag: string): number => {
    if (!notes) return 0;
    const m = notes.match(new RegExp(`\\[${tag}:(\\d+(?:\\.\\d+)?)\\]`));
    return m ? parseFloat(m[1]) : 0;
};
const cleanNoteDisplay = (notes: string) => {
    return (notes || '')
        .replace(/\[Month:[^\]]+\]/g, '')
        .replace(/\[Time:[^\]]+\]/g, '')
        .replace(/\[ArrearsPaid:[^\]]+\]/g, '')
        .replace(/\[CurrentRentPaid:[^\]]+\]/g, '')
        .trim();
};

// ── Column color tokens ───────────────────────────────────
const COL = {
    date:         { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    tenant:       { bg: '#f8fafc', text: '#1e293b', head: '#e2e8f0' },
    location:     { bg: '#f1f5f9', text: '#475569', head: '#e2e8f0' },
    month:        { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    totalPaid:    { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    arrearsPaid:  { bg: '#fff7ed', text: '#c2410c', head: '#fed7aa' },
    currentRent:  { bg: '#eff6ff', text: '#1d4ed8', head: '#bfdbfe' },
    arrearsRem:   { bg: '#fef9c3', text: '#92400e', head: '#fde68a' },
    method:       { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    receipt:      { bg: '#fafafa', text: '#6b7280', head: '#f3f4f6' },
    by:           { bg: '#fafafa', text: '#9ca3af', head: '#f3f4f6' },
    actions:      { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
};

export default function PaymentsPage() {
    const [payments, setPayments] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [mpesaTxns, setMpesaTxns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPayModal, setShowPayModal] = useState(false);
    const [showMpesaPanel, setShowMpesaPanel] = useState(false);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [matching, setMatching] = useState(false);
    const [c2bPayments, setC2bPayments] = useState<any[]>([]);
    const [showReceipt, setShowReceipt] = useState<any>(null);

    // Edit / Delete state
    const [editingPayment, setEditingPayment] = useState<any>(null);
    const [editForm, setEditForm] = useState({ reference_no: '', notes_display: '' });
    const [deletingPayment, setDeletingPayment] = useState<any>(null);
    const [actionLoading, setActionLoading] = useState(false);

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
            setPayments(p);
            setTenants(t.filter((te: any) => te.status === 'Active'));
            setLocations(l);
            setMpesaTxns(m);
        } catch { toast.error('Failed to load payments'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setLocationId(lid);
        loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const loadC2B = async () => {
        try {
            const { data } = await c2bSupabase.from('c2b_transactions').select('*').order('created_at', { ascending: false }).limit(50);
            setC2bPayments(data || []);
            toast.success(`${data?.length || 0} C2B loaded`);
        } catch { setC2bPayments([]); }
    };

    const handlePay = async () => {
        if (!payForm.tenant_id || !payForm.amount) { toast.error('Tenant and amount required'); return; }
        const tenant = tenants.find((t: any) => t.tenant_id === payForm.tenant_id);
        if (!tenant) { toast.error('Tenant not found'); return; }
        try {
            const user = JSON.parse(localStorage.getItem('arms_user') || '{}');
            const paymentTime = new Date().toISOString();
            const result = await recordPayment({
                tenant_id: payForm.tenant_id,
                amount: parseFloat(payForm.amount),
                payment_method: payForm.payment_method,
                mpesa_receipt: payForm.mpesa_receipt || undefined,
                mpesa_phone: payForm.mpesa_phone || undefined,
                reference_no: payForm.reference_no || undefined,
                notes: `[Month: ${payForm.payment_month}] [Time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${payForm.notes || ''}`.trim(),
                recorded_by: user.name || 'Admin',
                location_id: tenant?.location_id
            });
            toast.success('Payment recorded! Generating receipt…');

            const balanceBefore = tenant.balance || 0;
            const newBalance = Math.max(0, balanceBefore - parseFloat(payForm.amount));

            setShowReceipt({
                tenant_name: tenant.tenant_name,
                phone: tenant.phone || '',
                id_number: tenant.id_number || '',
                unit_name: tenant.arms_units?.unit_name || '-',
                location_name: tenant.arms_locations?.location_name || '-',
                monthly_rent: tenant.monthly_rent || 0,
                amount: parseFloat(payForm.amount),
                payment_method: payForm.payment_method,
                mpesa_receipt: payForm.mpesa_receipt || '',
                payment_date: paymentTime,
                payment_month: payForm.payment_month,
                balance_before: balanceBefore,
                balance_after: newBalance,
                recorded_by: user.name || 'Admin',
                arrears_paid: result.arrearsPaid ?? 0,
                current_rent_paid: result.currentRentPaid ?? 0,
            });

            setShowPayModal(false);
            setPayForm({ tenant_id: 0, amount: '', payment_method: 'Cash', mpesa_receipt: '', mpesa_phone: '', reference_no: '', notes: '', payment_month: new Date().toISOString().slice(0, 7) });
            loadData(locationId);
        } catch (err: any) { toast.error(err.message || 'Failed'); }
    };

    const handleAutoMatch = async (id: number) => {
        try {
            const r = await autoMatchMpesa(id);
            if (r) { toast.success(`Matched to ${r.tenant.tenant_name}!`); loadData(locationId); }
            else toast.error('No match found');
        } catch { toast.error('Failed'); }
    };

    const handleAutoMatchAll = async () => {
        setMatching(true);
        try { const r = await autoMatchAllUnmatched(); toast.success(`${r.length} matched!`); loadData(locationId); } catch { toast.error('Failed'); }
        setMatching(false);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingPayment) return;
        setActionLoading(true);
        try {
            await deletePayment(deletingPayment.payment_id);
            toast.success('Payment deleted and balances restored.');
            setDeletingPayment(null);
            loadData(locationId);
        } catch (err: any) { toast.error(err.message || 'Delete failed'); }
        setActionLoading(false);
    };

    const handleEditSave = async () => {
        if (!editingPayment) return;
        setActionLoading(true);
        try {
            await updatePaymentNotes(editingPayment.payment_id, {
                reference_no: editForm.reference_no || undefined,
                notes: editForm.notes_display
            });
            toast.success('Payment updated.');
            setEditingPayment(null);
            loadData(locationId);
        } catch (err: any) { toast.error(err.message || 'Update failed'); }
        setActionLoading(false);
    };

    const openEdit = (p: any) => {
        setEditingPayment(p);
        setEditForm({ reference_no: p.reference_no || '', notes_display: cleanNoteDisplay(p.notes) });
    };

    const viewReceipt = (p: any) => {
        const monthMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
        const arrearsPaid = parseNoteTag(p.notes, 'ArrearsPaid');
        const currentRentPaid = parseNoteTag(p.notes, 'CurrentRentPaid');
        setShowReceipt({
            payment_id: p.payment_id,
            tenant_name: p.arms_tenants?.tenant_name || '-',
            phone: p.arms_tenants?.phone || '',
            id_number: p.arms_tenants?.id_number || '',
            unit_name: p.arms_tenants?.arms_units?.unit_name || '-',
            location_name: p.arms_locations?.location_name || '-',
            monthly_rent: p.arms_tenants?.monthly_rent || 0,
            amount: p.amount,
            payment_method: p.payment_method,
            mpesa_receipt: p.mpesa_receipt || '',
            payment_date: p.payment_date,
            payment_month: monthMatch ? monthMatch[1] : '',
            balance_before: p.amount + (p.arms_tenants?.balance || 0),
            balance_after: p.arms_tenants?.balance || 0,
            recorded_by: p.recorded_by || '',
            arrears_paid: arrearsPaid,
            current_rent_paid: currentRentPaid || p.amount - arrearsPaid,
        });
    };

    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
    const todayTotal = payments.filter(p => p.payment_date?.startsWith(new Date().toISOString().split('T')[0])).reduce((s, p) => s + (p.amount || 0), 0);
    const totalAll = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalArrearsPaid = payments.reduce((s, p) => s + (p.arrears_paid || 0), 0);
    const totalCurrentRentPaid = payments.reduce((s, p) => s + (p.current_rent_paid || 0), 0);
    const selectedTenant = tenants.find((t: any) => t.tenant_id === payForm.tenant_id);

    // Live breakdown for payment modal
    const liveAmount = parseFloat(payForm.amount) || 0;
    const tenantArrears = selectedTenant ? Math.max(0, (selectedTenant.balance || 0) - (selectedTenant.monthly_rent || 0)) : 0;
    const liveArrearsPaid = Math.min(liveAmount, tenantArrears);
    const liveCurrentRentPaid = Math.max(0, liveAmount - liveArrearsPaid);
    const liveBalanceAfter = Math.max(0, (selectedTenant?.balance || 0) - liveAmount);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>💰</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
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
                    <p className="text-sm text-gray-500 mt-1">Record, track and manage tenant rent payments</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => loadData(locationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition">
                        <FiRefreshCw size={16} />
                    </button>
                    <button onClick={() => setShowMpesaPanel(!showMpesaPanel)} className="btn-outline flex items-center gap-2 text-green-700 border-green-200 hover:bg-green-50">📱 M-Pesa C2B</button>
                    <button onClick={() => { setPayForm({ tenant_id: 0, amount: '', payment_method: 'Cash', mpesa_receipt: '', mpesa_phone: '', reference_no: '', notes: '', payment_month: new Date().toISOString().slice(0, 7) }); setShowPayModal(true); }} className="btn-primary flex items-center gap-2">
                        <FiPlus size={16} /> Record Payment
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { label: 'Total Records', value: payments.length, icon: FiFileText, color: '#6366f1', bg: '#eef2ff', sub: 'All time' },
                    { label: "Today's Collection", value: fmt(todayTotal), icon: FiDollarSign, color: '#10b981', bg: '#f0fdf4', sub: 'Collected today' },
                    { label: 'Total Collected', value: fmt(totalAll), icon: FiCreditCard, color: '#3b82f6', bg: '#eff6ff', sub: 'All payments' },
                    { label: 'Arrears Paid', value: fmt(totalArrearsPaid), icon: FiAlertTriangle, color: '#c2410c', bg: '#fff7ed', sub: '⬇ Old balances cleared' },
                    { label: 'Current Rent Paid', value: fmt(totalCurrentRentPaid), icon: FiSmartphone, color: '#7c3aed', bg: '#faf5ff', sub: '✅ This month rent' },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <div className="p-2.5 rounded-xl" style={{ background: card.bg }}>
                                <card.icon size={18} style={{ color: card.color }} />
                            </div>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.05]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* M-Pesa C2B Panel */}
            {showMpesaPanel && (
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><FiSmartphone className="text-green-500" /> M-Pesa C2B Transactions</h2>
                        <div className="flex gap-2">
                            <button onClick={handleAutoMatchAll} disabled={matching} className="btn-success text-sm px-3 py-2 flex items-center gap-2">
                                {matching ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <FiLink size={14} />} Match All
                            </button>
                            <button onClick={loadC2B} className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><FiRefreshCw size={16} /></button>
                        </div>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {mpesaTxns.length === 0 && c2bPayments.length === 0 ? (
                            <div className="text-center py-6"><p className="text-sm text-gray-400">No unmatched transactions</p><button onClick={loadC2B} className="mt-2 text-xs text-indigo-600 hover:text-indigo-700">Load C2B →</button></div>
                        ) : <>
                            {mpesaTxns.map(txn => (
                                <div key={txn.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                                    <div><p className="text-sm font-medium text-gray-900">{txn.first_name} {txn.last_name}</p><p className="text-xs text-gray-400">{txn.msisdn} • {txn.trans_id}</p></div>
                                    <div className="flex items-center gap-3"><span className="text-sm font-bold text-green-600">{fmt(txn.trans_amount)}</span><button onClick={() => handleAutoMatch(txn.id)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50"><FiCheck size={16} /></button></div>
                                </div>
                            ))}
                            {c2bPayments.map(p => (
                                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-green-50">
                                    <div><p className="text-sm font-medium text-gray-900">{p.first_name || 'Unknown'} {p.last_name || ''}</p><p className="text-xs text-gray-400">{p.msisdn || p.phone} • C2B</p></div>
                                    <span className="text-sm font-bold text-green-600">{fmt(p.trans_amount || p.amount)}</span>
                                </div>
                            ))}
                        </>}
                    </div>
                </div>
            )}

            {/* ── Ultra Color-Coded Payments DataGrid ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-bold text-gray-900">🗂️ Payment Records</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">{payments.length} total · Color-coded by field type</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {[{ label: 'Arrears Paid', color: COL.arrearsPaid.text }, { label: 'Current Rent', color: COL.currentRent.text }, { label: 'Remaining Arrears', color: COL.arrearsRem.text }].map(l => (
                            <span key={l.label} className="text-[10px] font-bold px-2 py-1 rounded-lg border" style={{ color: l.color, borderColor: l.color + '40', background: l.color + '10' }}>{l.label}</span>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                        <thead>
                            <tr>
                                {[
                                    { label: 'Date & Time', col: COL.date },
                                    { label: 'Tenant', col: COL.tenant },
                                    { label: 'Location', col: COL.location },
                                    { label: 'Month', col: COL.month },
                                    { label: 'Total Paid', col: COL.totalPaid },
                                    { label: '⬇ Arrears Paid', col: COL.arrearsPaid },
                                    { label: '🏠 Current Rent Paid', col: COL.currentRent },
                                    { label: '⏳ Arrears Remaining', col: COL.arrearsRem },
                                    { label: 'Method', col: COL.method },
                                    { label: 'Receipt/Ref', col: COL.receipt },
                                    { label: 'By', col: COL.by },
                                    { label: 'Actions', col: COL.actions },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                        style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}25` }}>
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {payments.length === 0 ? (
                                <tr><td colSpan={12} className="text-center py-12 text-gray-400">
                                    <div className="flex flex-col items-center gap-2"><span className="text-4xl">📭</span><p className="text-sm font-medium">No payments recorded yet</p></div>
                                </td></tr>
                            ) : payments.map(p => {
                                const monthMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
                                const timeMatch = p.notes?.match(/\[Time: (.+?)\]/);
                                const payMonth = monthMatch ? monthMatch[1] : '-';
                                const payTime = timeMatch ? timeMatch[1] : new Date(p.payment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const arrearsPaid = p.arrears_paid || 0;
                                const currentRentPaid = p.current_rent_paid || (p.amount - arrearsPaid);
                                const tenantBalance = p.arms_tenants?.balance || 0;
                                const monthlyRent = p.arms_tenants?.monthly_rent || 0;
                                const arrearsRemaining = Math.max(0, tenantBalance - monthlyRent);

                                return (
                                    <tr key={p.payment_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        {/* Date/Time */}
                                        <td className="px-3 py-3" style={{ background: COL.date.bg + '80' }}>
                                            <div className="font-semibold text-xs" style={{ color: COL.date.text }}>{new Date(p.payment_date).toLocaleDateString()}</div>
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1"><FiClock size={9} /> {payTime}</div>
                                        </td>
                                        {/* Tenant */}
                                        <td className="px-3 py-3" style={{ background: COL.tenant.bg + '80' }}>
                                            <span className="font-semibold text-xs text-gray-900">{p.arms_tenants?.tenant_name || '-'}</span>
                                        </td>
                                        {/* Location */}
                                        <td className="px-3 py-3 text-[11px]" style={{ background: COL.location.bg + '80', color: COL.location.text }}>
                                            {p.arms_locations?.location_name || '-'}
                                        </td>
                                        {/* Month */}
                                        <td className="px-3 py-3" style={{ background: COL.month.bg + '80' }}>
                                            <span className="text-[11px] font-bold" style={{ color: COL.month.text }}>
                                                {payMonth !== '-' ? new Date(payMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
                                            </span>
                                        </td>
                                        {/* Total Paid */}
                                        <td className="px-3 py-3" style={{ background: COL.totalPaid.bg + '80' }}>
                                            <span className="text-xs font-extrabold" style={{ color: COL.totalPaid.text }}>{fmt(p.amount)}</span>
                                        </td>
                                        {/* Arrears Paid */}
                                        <td className="px-3 py-3" style={{ background: COL.arrearsPaid.bg + '80' }}>
                                            {arrearsPaid > 0
                                                ? <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: COL.arrearsPaid.head, color: COL.arrearsPaid.text }}>{fmt(arrearsPaid)}</span>
                                                : <span className="text-[10px] text-gray-300">—</span>}
                                        </td>
                                        {/* Current Month Rent Paid */}
                                        <td className="px-3 py-3" style={{ background: COL.currentRent.bg + '80' }}>
                                            {currentRentPaid > 0
                                                ? <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: COL.currentRent.head, color: COL.currentRent.text }}>{fmt(currentRentPaid)}</span>
                                                : <span className="text-[10px] text-gray-300">—</span>}
                                        </td>
                                        {/* Arrears Remaining */}
                                        <td className="px-3 py-3" style={{ background: COL.arrearsRem.bg + '80' }}>
                                            {arrearsRemaining > 0
                                                ? <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: COL.arrearsRem.head, color: COL.arrearsRem.text }}>{fmt(arrearsRemaining)}</span>
                                                : <span className="text-[10px] font-bold text-green-600">✓ Clear</span>}
                                        </td>
                                        {/* Method */}
                                        <td className="px-3 py-3" style={{ background: COL.method.bg + '80' }}>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${p.payment_method === 'M-Pesa' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {p.payment_method === 'M-Pesa' ? '📱' : '💵'} {p.payment_method}
                                            </span>
                                        </td>
                                        {/* Receipt/Ref */}
                                        <td className="px-3 py-3 text-[10px]" style={{ background: COL.receipt.bg + '80', color: COL.receipt.text }}>
                                            {p.mpesa_receipt || p.reference_no || '-'}
                                        </td>
                                        {/* By */}
                                        <td className="px-3 py-3 text-[10px]" style={{ background: COL.by.bg + '80', color: COL.by.text }}>
                                            {p.recorded_by || '-'}
                                        </td>
                                        {/* Actions */}
                                        <td className="px-3 py-3" style={{ background: COL.actions.bg + '80' }}>
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => viewReceipt(p)} title="View Receipt"
                                                    className="p-1.5 rounded-lg transition hover:scale-110"
                                                    style={{ background: COL.month.head, color: COL.month.text }}>
                                                    <FiPrinter size={13} />
                                                </button>
                                                <button onClick={() => openEdit(p)} title="Edit Payment"
                                                    className="p-1.5 rounded-lg transition hover:scale-110"
                                                    style={{ background: COL.currentRent.head, color: COL.currentRent.text }}>
                                                    <FiEdit2 size={13} />
                                                </button>
                                                <button onClick={() => setDeletingPayment(p)} title="Delete Payment"
                                                    className="p-1.5 rounded-lg transition hover:scale-110"
                                                    style={{ background: '#fee2e2', color: '#b91c1c' }}>
                                                    <FiTrash2 size={13} />
                                                </button>
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
                        <p className="text-xs text-gray-400">{payments.length} record{payments.length !== 1 ? 's' : ''}</p>
                        <div className="flex items-center gap-4 text-xs font-bold">
                            <span style={{ color: COL.totalPaid.text }}>Total: {fmt(totalAll)}</span>
                            <span style={{ color: COL.arrearsPaid.text }}>Arrears Paid: {fmt(totalArrearsPaid)}</span>
                            <span style={{ color: COL.currentRent.text }}>Current Rent: {fmt(totalCurrentRentPaid)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Record Payment Modal ── */}
            {showPayModal && (
                <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">💰 Record Rent Payment</h2>
                            <p className="text-indigo-200 text-sm mt-0.5">Arrears are cleared first, then current month rent</p>
                        </div>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            {/* Tenant select */}
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">👤 Select Tenant *</label>
                                <select value={payForm.tenant_id} onChange={e => setPayForm({ ...payForm, tenant_id: parseInt(e.target.value) })} className="select-field">
                                    <option value={0}>Choose tenant…</option>
                                    {tenants.map((t: any) => (
                                        <option key={t.tenant_id} value={t.tenant_id}>
                                            {t.tenant_name} — {t.arms_units?.unit_name} ({t.arms_locations?.location_name}) [Bal: KES {(t.balance || 0).toLocaleString()}]
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Tenant info card */}
                            {selectedTenant && (
                                <div className="rounded-2xl p-4 border" style={{ background: 'linear-gradient(135deg,#eff6ff,#faf5ff)', borderColor: '#c7d2fe' }}>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">👤 Tenant</span><span className="font-semibold text-gray-900">{selectedTenant.tenant_name}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">📞 Phone</span><span className="font-medium text-gray-700">{selectedTenant.phone || '-'}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">🏠 Unit</span><span className="font-medium text-gray-700">{selectedTenant.arms_units?.unit_name || '-'}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">💰 Monthly Rent</span><span className="font-semibold text-gray-900">{fmt(selectedTenant.monthly_rent)}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">⚠️ Total Balance</span><span className={`font-bold ${(selectedTenant.balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(selectedTenant.balance)}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">🕐 Prev. Arrears</span><span className="font-bold text-orange-600">{fmt(tenantArrears)}</span></div>
                                    </div>
                                </div>
                            )}

                            {/* Payment month */}
                            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                                <label className="text-sm font-semibold text-blue-800 mb-1.5 block">📅 Payment For Month *</label>
                                <input type="month" value={payForm.payment_month} onChange={e => setPayForm({ ...payForm, payment_month: e.target.value })} className="input-field" required />
                            </div>

                            {/* Amount + method */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1 block">💰 Amount (KES) *</label>
                                    <input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} className="input-field" placeholder="0" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1 block">💳 Payment Method *</label>
                                    <select value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })} className="select-field">
                                        <option value="Cash">💵 Cash</option>
                                        <option value="M-Pesa">📱 M-Pesa</option>
                                    </select>
                                </div>
                            </div>

                            {payForm.payment_method === 'M-Pesa' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-sm font-medium text-gray-700 mb-1 block">📝 M-Pesa Receipt</label><input value={payForm.mpesa_receipt} onChange={e => setPayForm({ ...payForm, mpesa_receipt: e.target.value })} className="input-field" placeholder="SJ12ABC456" /></div>
                                    <div><label className="text-sm font-medium text-gray-700 mb-1 block">📞 Phone</label><input value={payForm.mpesa_phone} onChange={e => setPayForm({ ...payForm, mpesa_phone: e.target.value })} className="input-field" placeholder="07XXXXXXXX" /></div>
                                </div>
                            )}

                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">📋 Notes</label><textarea value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} className="input-field" rows={2} placeholder="Payment notes (optional)" /></div>

                            {/* Live payment breakdown */}
                            {selectedTenant && liveAmount > 0 && (
                                <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#a5b4fc' }}>
                                    <div className="px-4 py-2.5 text-xs font-bold text-white flex items-center gap-2" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}>
                                        💡 Live Payment Allocation (FIFO — Arrears First)
                                    </div>
                                    <div className="grid grid-cols-2 gap-0">
                                        <div className="p-3 border-r" style={{ background: COL.arrearsPaid.bg }}>
                                            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: COL.arrearsPaid.text }}>⬇ Arrears Paid</p>
                                            <p className="text-lg font-extrabold" style={{ color: COL.arrearsPaid.text }}>{fmt(liveArrearsPaid)}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">of {fmt(tenantArrears)} owed</p>
                                        </div>
                                        <div className="p-3" style={{ background: COL.currentRent.bg }}>
                                            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: COL.currentRent.text }}>🏠 Current Month Rent</p>
                                            <p className="text-lg font-extrabold" style={{ color: COL.currentRent.text }}>{fmt(liveCurrentRentPaid)}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">of {fmt(selectedTenant.monthly_rent)} due</p>
                                        </div>
                                        <div className="p-3 col-span-2 border-t" style={{ background: liveBalanceAfter > 0 ? '#fef2f2' : '#f0fdf4', borderColor: liveBalanceAfter > 0 ? '#fecaca' : '#bbf7d0' }}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold" style={{ color: liveBalanceAfter > 0 ? '#b91c1c' : '#15803d' }}>
                                                    {liveBalanceAfter > 0 ? '⚠️ Balance After Payment' : '✅ Fully Settled'}
                                                </span>
                                                <span className="text-sm font-extrabold" style={{ color: liveBalanceAfter > 0 ? '#b91c1c' : '#15803d' }}>{fmt(liveBalanceAfter)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
                            <button onClick={() => setShowPayModal(false)} className="btn-outline">Cancel</button>
                            <button onClick={handlePay} className="btn-success flex items-center gap-2"><FiDollarSign size={16} /> Record & Print Receipt</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Payment Modal ── */}
            {editingPayment && (
                <div className="modal-overlay" onClick={() => setEditingPayment(null)}>
                    <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><FiEdit2 className="text-blue-500" /> Edit Receipt Details</h2>
                            <button onClick={() => setEditingPayment(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><FiX size={16} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-blue-50 rounded-xl p-3 text-sm border border-blue-100">
                                <p className="font-bold text-blue-900">{editingPayment.arms_tenants?.tenant_name}</p>
                                <p className="text-blue-600 text-xs mt-0.5">{fmt(editingPayment.amount)} • {new Date(editingPayment.payment_date).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">📝 Reference / Receipt No</label>
                                <input value={editForm.reference_no} onChange={e => setEditForm({ ...editForm, reference_no: e.target.value })} className="input-field" placeholder="Reference number" />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">📋 Notes</label>
                                <textarea value={editForm.notes_display} onChange={e => setEditForm({ ...editForm, notes_display: e.target.value })} className="input-field" rows={3} />
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
                            <button onClick={() => setEditingPayment(null)} className="btn-outline">Cancel</button>
                            <button onClick={handleEditSave} disabled={actionLoading} className="btn-primary flex items-center gap-2">
                                {actionLoading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <FiSave size={14} />} Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirm Modal ── */}
            {deletingPayment && (
                <div className="modal-overlay" onClick={() => setDeletingPayment(null)}>
                    <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                                <FiTrash2 size={28} className="text-red-600" />
                            </div>
                            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Payment?</h2>
                            <p className="text-sm text-gray-500 mb-1">This will permanently delete the payment of</p>
                            <p className="text-xl font-extrabold text-red-600 mb-1">{fmt(deletingPayment.amount)}</p>
                            <p className="text-sm text-gray-500 mb-1">for <strong>{deletingPayment.arms_tenants?.tenant_name}</strong></p>
                            <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mt-3 border border-amber-100">
                                ⚠️ Tenant balance and billing records will be restored automatically.
                            </p>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setDeletingPayment(null)} className="btn-outline flex-1">Cancel</button>
                            <button onClick={handleDeleteConfirm} disabled={actionLoading}
                                className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition flex items-center justify-center gap-2">
                                {actionLoading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <FiTrash2 size={14} />} Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Receipt Modal */}
            {showReceipt && <RentReceipt payment={showReceipt} onClose={() => setShowReceipt(null)} />}
        </div>
    );
}
