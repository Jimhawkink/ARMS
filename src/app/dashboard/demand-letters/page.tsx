'use client';
import { useState, useEffect } from 'react';
import { getDemandLetters, createDemandLetter, updateDemandLetter, getOverdueTenants, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiFileText, FiPlus, FiPrinter, FiSend, FiCheck } from 'react-icons/fi';

const LETTER_TEMPLATES: Record<string, { subject: string; body: string }> = {
    Arrears: {
        subject: 'NOTICE OF RENT ARREARS',
        body: `Dear {name},

RE: OUTSTANDING RENT ARREARS - {unit}

Our records indicate that you have accumulated rent arrears amounting to KES {balance} for the unit {unit} at {location}.

This is a formal notice requiring you to settle the outstanding amount within 7 DAYS from the date of this notice.

Failure to remit the full amount may result in further action including but not limited to:
1. Late payment penalties as per the lease agreement
2. Legal proceedings for recovery
3. Termination of tenancy

Kindly make payment via M-Pesa to our paybill account or visit our offices.

Yours faithfully,
ARMS Management`,
    },
    Eviction: {
        subject: 'NOTICE OF INTENTION TO EVICT',
        body: `Dear {name},

RE: NOTICE OF INTENTION TO EVICT - {unit}

TAKE NOTICE that owing to your failure to pay rent arrears of KES {balance} for unit {unit} at {location}, the landlord intends to terminate your tenancy and recover possession of the premises.

You are hereby required to VACATE the premises within 30 DAYS from the date of this notice, failing which eviction proceedings will be commenced against you without further notice.

All outstanding rent must be paid before vacating. Your deposit will be applied against any outstanding balance.

This notice is given pursuant to the Landlord and Tenant (Shops, Hotels and Catering Establishments) Act, Cap 301, Laws of Kenya.

Yours faithfully,
ARMS Management`,
    },
    Final_Demand: {
        subject: 'FINAL DEMAND FOR PAYMENT',
        body: `Dear {name},

RE: FINAL DEMAND - KES {balance} - {unit}

This is our FINAL DEMAND for payment of KES {balance} being rent arrears for unit {unit} at {location}.

Despite previous notices, the amount remains unpaid. You are hereby given 48 HOURS to settle this debt in full.

If payment is not received within the stipulated time, we shall instruct our advocates to commence legal proceedings for recovery of the debt plus costs, without further reference to you.

This is our final notice.

Yours faithfully,
ARMS Management`,
    },
    Notice: {
        subject: 'GENERAL NOTICE',
        body: `Dear {name},

RE: NOTICE - {unit}

This is to notify you regarding matters pertaining to your tenancy at unit {unit}, {location}.

Outstanding balance: KES {balance}

Please ensure compliance within the stipulated timeframe.

Yours faithfully,
ARMS Management`,
    },
};

export default function DemandLettersPage() {
    const [letters, setLetters] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [overdue, setOverdue] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [selectedTenant, setSelectedTenant] = useState('');
    const [letterType, setLetterType] = useState<string>('Arrears');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [deadline, setDeadline] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('Print');

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
            const [l, t, o] = await Promise.all([
                getDemandLetters(globalLocationId ? { locationId: globalLocationId } : undefined),
                getTenants(globalLocationId || undefined),
                getOverdueTenants(globalLocationId || undefined),
            ]);
            setLetters(l); setTenants(t.filter((t: any) => t.status === 'Active')); setOverdue(o);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [globalLocationId]);

    const handleTemplateSelect = (type: string) => {
        setLetterType(type);
        const tmpl = LETTER_TEMPLATES[type];
        if (tmpl) {
            setSubject(tmpl.subject);
            setBody(tmpl.body);
        }
    };

    const handleTenantSelect = (tenantId: string) => {
        setSelectedTenant(tenantId);
        const tenant = tenants.find((t: any) => t.tenant_id === parseInt(tenantId));
        if (tenant) {
            const name = tenant.tenant_name;
            const unit = tenant.arms_units?.unit_name || '';
            const balance = String(tenant.balance || 0);
            const location = tenant.arms_locations?.location_name || '';
            setSubject(prev => prev.replace('{name}', name).replace('{unit}', unit).replace('{balance}', balance).replace('{location}', location));
            setBody(prev => prev.replace('{name}', name).replace('{unit}', unit).replace('{balance}', balance).replace('{location}', location));
        }
    };

    const handleCreate = async () => {
        if (!selectedTenant || !subject || !body) return toast.error('Fill all required fields');
        const tenant = tenants.find((t: any) => t.tenant_id === parseInt(selectedTenant));
        try {
            await createDemandLetter({
                tenant_id: parseInt(selectedTenant),
                location_id: tenant?.location_id || undefined,
                unit_id: tenant?.unit_id || undefined,
                letter_type: letterType,
                subject,
                body,
                amount_owed: tenant?.balance || 0,
                deadline_date: deadline || undefined,
                delivery_method: deliveryMethod,
                issued_by: 'Admin',
            });
            toast.success('Demand letter issued');
            setShowCreate(false); setSelectedTenant(''); setSubject(''); setBody('');
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handlePrint = (letter: any) => {
        const printContent = `
            <html><head><title>${letter.subject}</title>
            <style>body{font-family:Arial,Helvetica,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#000}
            h1{font-size:18px;border-bottom:2px solid #000;padding-bottom:10px}
            .meta{font-size:12px;color:#333;margin:20px 0}p{font-size:14px;line-height:1.8;white-space:pre-line}
            .footer{margin-top:40px;border-top:1px solid #ccc;padding-top:10px;font-size:11px;color:#666}</style></head>
            <body><h1>${letter.subject}</h1>
            <div class="meta">Date: ${new Date(letter.issued_date).toLocaleDateString('en-KE')} | Ref: DL-${String(letter.letter_id).padStart(4, '0')} | Type: ${letter.letter_type}</div>
            <p>${letter.body}</p>
            <div class="footer">Alpha Rental Management System (ARMS) | This is a computer-generated document</div>
            </body></html>`;
        const w = window.open('', '_blank');
        if (w) { w.document.write(printContent); w.document.close(); w.print(); }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>📜 Demand Letters</h1>
                    <p className="text-sm text-gray-500 mt-1">Arrears notices • Eviction warnings • KRA-compliant</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition">
                    <FiPlus size={14} /> New Letter
                </button>
            </div>

            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Overdue Tenants', value: overdue.length, color: '#ef4444' },
                    { label: 'Letters Issued', value: letters.length, color: '#6366f1' },
                    { label: 'Acknowledged', value: letters.filter(l => l.tenant_acknowledged).length, color: '#059669' },
                    { label: 'Pending', value: letters.filter(l => l.status === 'Issued' && !l.tenant_acknowledged).length, color: '#f59e0b' },
                ].map(s => (
                    <div key={s.label} className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase">{s.label}</p>
                        <p className="text-2xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Tenant</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Subject</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Amount</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Actions</th>
                    </tr></thead>
                    <tbody>
                        {letters.map(l => (
                            <tr key={l.letter_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-3 text-gray-600">{new Date(l.issued_date).toLocaleDateString('en-KE')}</td>
                                <td className="px-4 py-3 font-semibold">{l.arms_tenants?.tenant_name}</td>
                                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${l.letter_type === 'Eviction' ? 'bg-red-50 text-red-600' : l.letter_type === 'Final_Demand' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>{l.letter_type.replace('_', ' ')}</span></td>
                                <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{l.subject}</td>
                                <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(l.amount_owed)}</td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${l.status === 'Draft' ? 'bg-gray-100 text-gray-600' : l.tenant_acknowledged ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                        {l.tenant_acknowledged ? 'Acknowledged' : l.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => handlePrint(l)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Print"><FiPrinter size={13} /></button>
                                        {!l.tenant_acknowledged && (
                                            <button onClick={async () => { await updateDemandLetter(l.letter_id, { tenant_acknowledged: true, acknowledged_at: new Date().toISOString() }); loadData(); toast.success('Marked as acknowledged'); }}
                                                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="Mark Acknowledged"><FiCheck size={13} /></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {letters.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No demand letters yet</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Create Letter Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800">📜 Create Demand Letter</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Tenant *</label>
                                <select value={selectedTenant} onChange={e => handleTenantSelect(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                    <option value="">Select tenant</option>
                                    {overdue.map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} - {t.arms_units?.unit_name} (Bal: {fmt(t.balance)})</option>)}
                                    {tenants.filter((t: any) => !overdue.find((o: any) => o.tenant_id === t.tenant_id)).map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} - {t.arms_units?.unit_name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Letter Type</label>
                                <select value={letterType} onChange={e => handleTemplateSelect(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                    <option value="Arrears">Arrears Notice</option>
                                    <option value="Eviction">Eviction Notice</option>
                                    <option value="Final_Demand">Final Demand</option>
                                    <option value="Notice">General Notice</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Subject</label>
                            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Letter Body</label>
                            <textarea value={body} onChange={e => setBody(e.target.value)} rows={12}
                                className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm font-mono" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Deadline</label>
                                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Delivery</label>
                                <select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                    <option>Print</option><option>SMS</option><option>WhatsApp</option><option>Email</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleCreate} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">Issue Letter</button>
                            <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
