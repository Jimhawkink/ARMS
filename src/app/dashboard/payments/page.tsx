'use client';
import { useState, useEffect, useCallback } from 'react';
import { getPayments, recordPayment, getTenants, getLocations, getMpesaTransactions, autoMatchMpesa, autoMatchAllUnmatched, c2bSupabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiPlus, FiRefreshCw, FiCheck, FiLink, FiDollarSign, FiCreditCard, FiSmartphone, FiClock, FiFileText, FiPrinter } from 'react-icons/fi';
import RentReceipt from '@/components/RentReceipt';

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
    const [payForm, setPayForm] = useState({ tenant_id: 0, amount: '', payment_method: 'Cash', mpesa_receipt: '', mpesa_phone: '', reference_no: '', notes: '', payment_month: new Date().toISOString().slice(0, 7) });

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [p, t, l, m] = await Promise.all([getPayments({ locationId: locId ?? undefined }), getTenants(locId ?? undefined), getLocations(), getMpesaTransactions(false)]);
            setPayments(p); setTenants(t.filter((te: any) => te.status === 'Active')); setLocations(l); setMpesaTxns(m);
        } catch { toast.error('Failed'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location'); const lid = saved ? parseInt(saved) : null; setLocationId(lid); loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler); return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const loadC2B = async () => {
        try {
            const { data } = await c2bSupabase.from('c2b_transactions').select('*').order('created_at', { ascending: false }).limit(50);
            setC2bPayments(data || []); toast.success(`${data?.length || 0} C2B loaded`);
        } catch { setC2bPayments([]); }
    };

    const handlePay = async () => {
        if (!payForm.tenant_id || !payForm.amount) { toast.error('Tenant and amount required'); return; }
        const tenant = tenants.find((t: any) => t.tenant_id === payForm.tenant_id);
        if (!tenant) { toast.error('Tenant not found'); return; }
        try {
            const user = JSON.parse(localStorage.getItem('arms_user') || '{}');
            const paymentTime = new Date().toISOString();
            await recordPayment({
                tenant_id: payForm.tenant_id, amount: parseFloat(payForm.amount), payment_method: payForm.payment_method,
                mpesa_receipt: payForm.mpesa_receipt || undefined, mpesa_phone: payForm.mpesa_phone || undefined,
                reference_no: payForm.reference_no || undefined,
                notes: `[Month: ${payForm.payment_month}] [Time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${payForm.notes || ''}`.trim(),
                recorded_by: user.name || 'Admin', location_id: tenant?.location_id
            });
            toast.success('Payment recorded! Generating receipt...');

            // Calculate balance after payment
            const balanceBefore = tenant.balance || 0;
            const newBalance = Math.max(0, balanceBefore - parseFloat(payForm.amount));

            // Show receipt
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
            });

            setShowPayModal(false);
            setPayForm({ tenant_id: 0, amount: '', payment_method: 'Cash', mpesa_receipt: '', mpesa_phone: '', reference_no: '', notes: '', payment_month: new Date().toISOString().slice(0, 7) });
            loadData(locationId);
        } catch (err: any) { toast.error(err.message || 'Failed'); }
    };

    const handleAutoMatch = async (id: number) => {
        try { const r = await autoMatchMpesa(id); if (r) { toast.success(`Matched to ${r.tenant.tenant_name}!`); loadData(locationId); } else toast.error('No match'); } catch { toast.error('Failed'); }
    };

    const handleAutoMatchAll = async () => {
        setMatching(true);
        try { const r = await autoMatchAllUnmatched(); toast.success(`${r.length} matched!`); loadData(locationId); } catch { toast.error('Failed'); }
        setMatching(false);
    };

    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
    const todayTotal = payments.filter(p => p.payment_date?.startsWith(new Date().toISOString().split('T')[0])).reduce((s, p) => s + (p.amount || 0), 0);
    const totalAll = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const selectedTenant = tenants.find((t: any) => t.tenant_id === payForm.tenant_id);

    // View receipt for existing payment
    const viewReceipt = (p: any) => {
        const monthMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
        setShowReceipt({
            payment_id: p.payment_id,
            tenant_name: p.arms_tenants?.tenant_name || '-',
            phone: p.arms_tenants?.phone || '',
            unit_name: '-', location_name: p.arms_locations?.location_name || '-',
            monthly_rent: 0, amount: p.amount,
            payment_method: p.payment_method,
            mpesa_receipt: p.mpesa_receipt || '',
            payment_date: p.payment_date,
            payment_month: monthMatch ? monthMatch[1] : '',
            balance_before: p.amount, // approximate: balance was at least the amount paid
            balance_after: 0, recorded_by: p.recorded_by || '',
        });
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    return (
        <div className="animate-fadeIn space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div><h1 className="page-title">💰 Payments</h1><p className="text-sm text-gray-500 mt-1">Record and track tenant rent payments</p></div>
                <div className="flex gap-2">
                    <button onClick={() => setShowMpesaPanel(!showMpesaPanel)} className="btn-outline flex items-center gap-2 text-green-700 border-green-200 hover:bg-green-50">📱 M-Pesa C2B</button>
                    <button onClick={() => { setPayForm({ tenant_id: 0, amount: '', payment_method: 'Cash', mpesa_receipt: '', mpesa_phone: '', reference_no: '', notes: '', payment_month: new Date().toISOString().slice(0, 7) }); setShowPayModal(true); }} className="btn-primary flex items-center gap-2"><FiPlus size={16} /> Record Payment</button>
                </div>
            </div>

            {/* Premium Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#6366f1' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Total Payments</p>
                        <div className="p-2.5 rounded-xl bg-indigo-50"><FiFileText size={18} className="text-indigo-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-gray-900">{payments.length}</p>
                    <p className="text-xs text-gray-400 mt-1">All time</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-indigo-500 opacity-[0.04]"></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#10b981' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Today&apos;s Collection</p>
                        <div className="p-2.5 rounded-xl bg-green-50"><FiDollarSign size={18} className="text-green-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-green-600">{fmt(todayTotal)}</p>
                    <p className="text-xs text-gray-400 mt-1">Collected today</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-green-500 opacity-[0.04]"></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#3b82f6' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Cash Payments</p>
                        <div className="p-2.5 rounded-xl bg-blue-50"><FiCreditCard size={18} className="text-blue-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-blue-600">{payments.filter(p => p.payment_method === 'Cash').length}</p>
                    <p className="text-xs text-gray-400 mt-1">💵 Cash records</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-blue-500 opacity-[0.04]"></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#8b5cf6' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">M-Pesa Payments</p>
                        <div className="p-2.5 rounded-xl bg-purple-50"><FiSmartphone size={18} className="text-purple-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-purple-600">{payments.filter(p => p.payment_method === 'M-Pesa').length}</p>
                    <p className="text-xs text-gray-400 mt-1">📱 M-Pesa records</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-purple-500 opacity-[0.04]"></div>
                </div>
            </div>

            {/* M-Pesa C2B Panel */}
            {showMpesaPanel && (
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><FiSmartphone className="text-green-500" /> M-Pesa C2B Transactions</h2>
                        <div className="flex gap-2">
                            <button onClick={handleAutoMatchAll} disabled={matching} className="btn-success text-sm px-3 py-2 flex items-center gap-2">{matching ? <div className="spinner" style={{ width: 14, height: 14 }}></div> : <FiLink size={14} />} Match All</button>
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
                                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-green-50 hover:bg-green-100 transition">
                                    <div><p className="text-sm font-medium text-gray-900">{p.first_name || 'Unknown'} {p.last_name || ''}</p><p className="text-xs text-gray-400">{p.msisdn || p.phone} • C2B</p></div>
                                    <span className="text-sm font-bold text-green-600">{fmt(p.trans_amount || p.amount)}</span>
                                </div>
                            ))}
                        </>}
                    </div>
                </div>
            )}

            {/* Payments Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead><tr><th>Date & Time</th><th>Tenant</th><th>Location</th><th>Month</th><th>Amount</th><th>Method</th><th>Receipt</th><th>By</th><th>🖨️</th></tr></thead>
                        <tbody>
                            {payments.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-gray-400">No payments yet</td></tr> :
                            payments.map(p => {
                                const monthMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
                                const timeMatch = p.notes?.match(/\[Time: (.+?)\]/);
                                const payMonth = monthMatch ? monthMatch[1] : '-';
                                const payTime = timeMatch ? timeMatch[1] : new Date(p.payment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return (
                                <tr key={p.payment_id} className="hover:bg-indigo-50/30">
                                    <td>
                                        <div className="text-gray-900 text-sm font-medium">{new Date(p.payment_date).toLocaleDateString()}</div>
                                        <div className="text-xs text-gray-400 flex items-center gap-1"><FiClock size={10} /> {payTime}</div>
                                    </td>
                                    <td className="font-medium text-gray-900">{p.arms_tenants?.tenant_name || '-'}</td>
                                    <td className="text-gray-500 text-xs">{p.arms_locations?.location_name || '-'}</td>
                                    <td className="text-indigo-600 font-medium text-sm">{payMonth !== '-' ? new Date(payMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}</td>
                                    <td className="font-bold text-green-600">{fmt(p.amount)}</td>
                                    <td><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${p.payment_method === 'M-Pesa' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{p.payment_method === 'M-Pesa' ? '📱' : '💵'} {p.payment_method}</span></td>
                                    <td className="text-gray-400 text-xs">{p.mpesa_receipt || p.reference_no || '-'}</td>
                                    <td className="text-gray-400 text-xs">{p.recorded_by || '-'}</td>
                                    <td>
                                        <button onClick={() => viewReceipt(p)} className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition" title="View Receipt">
                                            <FiPrinter size={14} />
                                        </button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Record Payment Modal */}
            {showPayModal && (
                <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">💰 Record Rent Payment</h2>
                            <p className="text-indigo-200 text-sm mt-0.5">Enter payment details below</p>
                        </div>
                        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">👤 Select Tenant *</label>
                                <select value={payForm.tenant_id} onChange={e => setPayForm({ ...payForm, tenant_id: parseInt(e.target.value) })} className="select-field">
                                    <option value={0}>Choose tenant...</option>
                                    {tenants.map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} — {t.arms_units?.unit_name} ({t.arms_locations?.location_name}) [Bal: KES {(t.balance || 0).toLocaleString()}]</option>)}
                                </select>
                            </div>

                            {selectedTenant && (
                                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-4 border border-indigo-100">
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">👤 Tenant</span><span className="font-semibold text-gray-900">{selectedTenant.tenant_name}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">📞 Phone</span><span className="font-medium text-gray-700">{selectedTenant.phone || '-'}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">🏠 Unit / Room</span><span className="font-medium text-gray-700">{selectedTenant.arms_units?.unit_name || '-'}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">📍 Location</span><span className="font-medium text-gray-700">{selectedTenant.arms_locations?.location_name || '-'}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">💰 Monthly Rent</span><span className="font-semibold text-gray-900">{fmt(selectedTenant.monthly_rent)}</span></div>
                                        <div><span className="text-gray-400 text-[10px] font-bold uppercase block">⚠️ Balance</span><span className={`font-bold ${(selectedTenant.balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(selectedTenant.balance)}</span></div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                                <label className="text-sm font-semibold text-blue-800 mb-1.5 block">📅 Payment For Month *</label>
                                <input type="month" value={payForm.payment_month} onChange={e => setPayForm({ ...payForm, payment_month: e.target.value })} className="input-field" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">💰 Amount (KES) *</label><input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} className="input-field" placeholder="0" /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">💳 Payment Method *</label>
                                    <select value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })} className="select-field"><option value="Cash">💵 Cash</option><option value="M-Pesa">📱 M-Pesa</option></select></div>
                            </div>
                            {payForm.payment_method === 'M-Pesa' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-sm font-medium text-gray-700 mb-1 block">📝 M-Pesa Receipt</label><input value={payForm.mpesa_receipt} onChange={e => setPayForm({ ...payForm, mpesa_receipt: e.target.value })} className="input-field" placeholder="SJ12ABC456" /></div>
                                    <div><label className="text-sm font-medium text-gray-700 mb-1 block">📞 Phone</label><input value={payForm.mpesa_phone} onChange={e => setPayForm({ ...payForm, mpesa_phone: e.target.value })} className="input-field" placeholder="07XXXXXXXX" /></div>
                                </div>
                            )}
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">📋 Notes</label><textarea value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} className="input-field" rows={2} placeholder="Payment notes (optional)" /></div>

                            {selectedTenant && payForm.amount && (
                                <div className="bg-green-50 rounded-xl p-3 border border-green-100 text-sm space-y-1">
                                    <p className="text-green-800 font-medium">💡 Payment will be applied to oldest unpaid bills first (FIFO).</p>
                                    {parseFloat(payForm.amount) < (selectedTenant.monthly_rent || 0) && (
                                        <p className="text-amber-700">⚠️ Partial payment — KES {((selectedTenant.monthly_rent || 0) - parseFloat(payForm.amount)).toLocaleString()} will remain as balance and accrue to next month.</p>
                                    )}
                                    <p className="text-green-700 flex items-center gap-1"><FiClock size={12} /> Real-time: {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
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

            {/* Receipt Modal */}
            {showReceipt && <RentReceipt payment={showReceipt} onClose={() => setShowReceipt(null)} />}
        </div>
    );
}
