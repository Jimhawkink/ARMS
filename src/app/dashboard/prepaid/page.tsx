'use client';
import { useState, useEffect } from 'react';
import { getPrepaidTokens, addPrepaidToken, getUtilityTypes, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiZap, FiPlus } from 'react-icons/fi';

export default function PrepaidTokensPage() {
    const [tokens, setTokens] = useState<any[]>([]);
    const [utilityTypes, setUtilityTypes] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ tenant_id: '', utility_type_id: '', amount: '', rate: '', units: '', meter: '', receipt: '', notes: '' });

    const fmt = (n: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(n || 0);

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
            const [t, ut, tn] = await Promise.all([
                getPrepaidTokens(globalLocationId ? { locationId: globalLocationId } : undefined),
                getUtilityTypes(),
                getTenants(globalLocationId || undefined),
            ]);
            setTokens(t); setUtilityTypes(ut.filter((u: any) => u.billing_method === 'prepaid')); setTenants(tn.filter((x: any) => x.status === 'Active'));
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [globalLocationId]);

    const handleAdd = async () => {
        if (!form.tenant_id || !form.utility_type_id || !form.amount) return toast.error('Fill required fields');
        const amount = parseFloat(form.amount);
        const rate = parseFloat(form.rate) || 25;
        const unitsPurchased = Math.round((amount / rate) * 100) / 100;
        try {
            const tenant = tenants.find((t: any) => t.tenant_id === parseInt(form.tenant_id));
            await addPrepaidToken({
                tenant_id: parseInt(form.tenant_id),
                unit_id: tenant?.unit_id,
                location_id: tenant?.location_id || globalLocationId || undefined,
                utility_type_id: parseInt(form.utility_type_id),
                amount_paid: amount,
                units_purchased: unitsPurchased,
                rate_per_unit: rate,
                meter_number: form.meter || undefined,
                receipt_number: form.receipt || undefined,
                notes: form.notes || undefined,
            });
            toast.success(`Token purchased: ${unitsPurchased} units for ${fmt(amount)}`);
            setShowAdd(false); setForm({ tenant_id: '', utility_type_id: '', amount: '', rate: '', units: '', meter: '', receipt: '', notes: '' });
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>⚡ Prepaid Tokens</h1>
                    <p className="text-sm text-gray-500 mt-1">Electricity sub-metering • Token tracking</p>
                </div>
                <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition">
                    <FiPlus size={14} /> Purchase Token
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Tenant</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Unit</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Utility</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Amount</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Units</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Rate</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Meter</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                    </tr></thead>
                    <tbody>
                        {tokens.map(t => (
                            <tr key={t.token_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-3 text-gray-600">{new Date(t.purchase_date).toLocaleDateString('en-KE')}</td>
                                <td className="px-4 py-3 font-semibold">{t.arms_tenants?.tenant_name}</td>
                                <td className="px-4 py-3">{t.arms_units?.unit_name}</td>
                                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-50 text-yellow-600">{t.arms_utility_types?.utility_name}</span></td>
                                <td className="px-4 py-3 text-right font-bold">{fmt(t.amount_paid)}</td>
                                <td className="px-4 py-3 text-right font-bold text-indigo-600">{t.units_purchased} kWh</td>
                                <td className="px-4 py-3 text-right">{fmt(t.rate_per_unit)}/kWh</td>
                                <td className="px-4 py-3 text-gray-600">{t.meter_number || '-'}</td>
                                <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${t.status === 'Purchased' ? 'bg-green-50 text-green-600' : t.status === 'Vended' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                            </tr>
                        ))}
                        {tokens.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No prepaid tokens yet</td></tr>}
                    </tbody>
                </table>
            </div>

            {showAdd && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowAdd(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800">⚡ Purchase Prepaid Token</h3>
                        <select value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option value="">Select tenant</option>
                            {tenants.map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} - {t.arms_units?.unit_name}</option>)}
                        </select>
                        <select value={form.utility_type_id} onChange={e => setForm({ ...form, utility_type_id: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option value="">Select utility</option>
                            {utilityTypes.map((u: any) => <option key={u.utility_type_id} value={u.utility_type_id}>{u.utility_name} ({u.unit_of_measure})</option>)}
                        </select>
                        <input type="number" placeholder="Amount Paid (KES) *" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input type="number" placeholder="Rate per unit (KES)" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input placeholder="Meter Number" value={form.meter} onChange={e => setForm({ ...form, meter: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input placeholder="Receipt Number" value={form.receipt} onChange={e => setForm({ ...form, receipt: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        {form.amount && form.rate && (
                            <div className="p-3 rounded-xl bg-yellow-50 text-center">
                                <p className="text-xs text-gray-500">Units to be purchased</p>
                                <p className="text-xl font-black text-yellow-600">{(parseFloat(form.amount) / (parseFloat(form.rate) || 25)).toFixed(2)} kWh</p>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button onClick={handleAdd} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">Purchase</button>
                            <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
