'use client';
import { useState, useEffect, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';

interface Template {
    template_id: number;
    location_id: number | null;
    title: string;
    content: string;
    admin_signature_url: string | null;
    admin_name: string;
    admin_title: string;
    version: string;
    is_active: boolean;
}

interface Agreement {
    agreement_id: number;
    tenant_id: number;
    template_version: string;
    lease_start_date: string;
    lease_end_date: string;
    monthly_rent: number;
    deposit_amount: number;
    unit_name: string;
    issued_by: string;
    issued_at: string;
    accepted: boolean;
    signed_at: string | null;
    signature_text: string | null;
    arms_tenants: {
        tenant_name: string;
        phone: string;
        arms_units: { unit_name: string } | null;
        arms_locations: { location_name: string } | null;
    } | null;
}

const DEFAULT_CONTENT = `TENANCY AGREEMENT

This Tenancy Agreement ("Agreement") is entered into between the Landlord/Property Manager and the Tenant named herein.

1. PREMISES
The Landlord agrees to let and the Tenant agrees to take the premises described above for residential purposes only.

2. TERM
The tenancy shall commence on the date specified and continue on a month-to-month basis unless terminated by either party with 30 days written notice.

3. RENT
The Tenant agrees to pay the monthly rent as specified, payable on or before the 5th day of each month. Late payment attracts a penalty of 10% of the monthly rent.

4. DEPOSIT
A security deposit as specified is payable upon signing. This deposit shall be refunded within 30 days of vacating, less any deductions for damage beyond normal wear and tear.

5. USE OF PREMISES
The premises shall be used solely as a private residence. The Tenant shall not sublet or assign the premises without prior written consent.

6. MAINTENANCE
The Tenant shall keep the premises clean and in good condition. The Tenant shall report any repairs needed promptly. Damage caused by the Tenant's negligence shall be repaired at the Tenant's expense.

7. UTILITIES
The Tenant is responsible for payment of water, electricity, and other utilities unless otherwise agreed.

8. TERMINATION
Either party may terminate this agreement with 30 days written notice. The Landlord may terminate immediately for non-payment of rent, damage to property, or breach of any term of this agreement.

9. GOVERNING LAW
This agreement shall be governed by the laws of Kenya, including the Landlord and Tenant (Shops, Hotels and Catering Establishments) Act.

By accepting this agreement, the Tenant confirms they have read, understood, and agree to be bound by these terms.`;

export default function AgreementsPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [agreements, setAgreements] = useState<Agreement[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'agreements' | 'template'>('agreements');
    const [editingTemplate, setEditingTemplate] = useState<Partial<Template>>({
        title: 'Tenancy Agreement & Terms and Conditions',
        content: DEFAULT_CONTENT,
        admin_name: '',
        admin_title: 'Landlord / Property Manager',
        version: '1.0',
    });
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [uploadingSig, setUploadingSig] = useState(false);
    const [filter, setFilter] = useState<'all' | 'signed' | 'unsigned'>('all');
    const [search, setSearch] = useState('');
    const [viewAgreement, setViewAgreement] = useState<Agreement | null>(null);
    const sigInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadAll();
    }, []);

    async function loadAll() {
        setLoading(true);
        try {
            const [tRes, aRes] = await Promise.all([
                fetch('/api/agreements/template'),
                fetch('/api/agreements/sign?all=1'),
            ]);
            const tData = await tRes.json();
            const aData = await aRes.json();
            setTemplates(tData.templates || []);
            setAgreements(aData.agreements || []);
            if (tData.templates?.length > 0) {
                setEditingTemplate(tData.templates[0]);
            }
        } catch { toast.error('Failed to load'); }
        setLoading(false);
    }

    async function saveTemplate() {
        setSavingTemplate(true);
        try {
            const method = (editingTemplate as Template).template_id ? 'PATCH' : 'POST';
            const url = (editingTemplate as Template).template_id
                ? `/api/agreements/template?id=${(editingTemplate as Template).template_id}`
                : '/api/agreements/template';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingTemplate),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            toast.success('Template saved!');
            setEditingTemplate(data.template);
            loadAll();
        } catch (err: any) { toast.error(err.message); }
        setSavingTemplate(false);
    }

    async function uploadSignature(file: File) {
        setUploadingSig(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target?.result as string;
                const res = await fetch('/api/agreements/upload-signature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ base64, filename: `sig_${Date.now()}.png` }),
                });
                const data = await res.json();
                if (data.error) { toast.error(data.error); setUploadingSig(false); return; }
                setEditingTemplate(prev => ({ ...prev, admin_signature_url: data.url }));
                toast.success('Signature uploaded!');
                setUploadingSig(false);
            };
            reader.readAsDataURL(file);
        } catch (err: any) { toast.error(err.message); setUploadingSig(false); }
    }

    const filtered = agreements.filter(a => {
        if (filter === 'signed' && !a.accepted) return false;
        if (filter === 'unsigned' && a.accepted) return false;
        const name = a.arms_tenants?.tenant_name || '';
        return name.toLowerCase().includes(search.toLowerCase()) ||
            (a.arms_tenants?.phone || '').includes(search);
    });

    const signedCount = agreements.filter(a => a.accepted).length;
    const unsignedCount = agreements.length - signedCount;

    return (
        <div className="min-h-screen bg-gray-50">
            <Toaster position="top-right" />

            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">📋</div>
                    <div>
                        <h1 className="text-xl font-extrabold text-white">Tenancy Agreements</h1>
                        <p className="text-indigo-200 text-sm">Digital lease management · Cutting-edge signing</p>
                    </div>
                </div>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Total', value: agreements.length, color: 'bg-white/20' },
                        { label: '✅ Signed', value: signedCount, color: 'bg-green-500/30' },
                        { label: '⏳ Pending', value: unsignedCount, color: 'bg-amber-500/30' },
                    ].map(s => (
                        <div key={s.label} className={`${s.color} rounded-2xl px-4 py-2.5 text-center`}>
                            <p className="text-2xl font-black text-white">{s.value}</p>
                            <p className="text-[11px] text-white/80 font-semibold">{s.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-100 px-6 flex gap-1">
                {(['agreements', 'template'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-4 py-3 text-sm font-bold capitalize transition border-b-2 ${
                            activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}>
                        {tab === 'agreements' ? '📋 All Agreements' : '✏️ Agreement Template'}
                    </button>
                ))}
            </div>

            <div className="p-6">
                {/* === AGREEMENTS TAB === */}
                {activeTab === 'agreements' && (
                    <div className="space-y-4">
                        {/* Filters */}
                        <div className="flex flex-wrap gap-3 items-center">
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search tenant, phone…"
                                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 bg-white w-64" />
                            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                                {(['all', 'signed', 'unsigned'] as const).map(f => (
                                    <button key={f} onClick={() => setFilter(f)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${filter === f ? 'bg-white shadow text-indigo-700' : 'text-gray-500'}`}>
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Table */}
                        {loading ? (
                            <div className="text-center py-12 text-gray-400">Loading agreements…</div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center py-16 gap-3 text-gray-400">
                                <span className="text-5xl">📋</span>
                                <p className="font-semibold">No agreements yet</p>
                                <p className="text-sm">Issue agreements from the Add/Update Tenant section</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            {['Tenant', 'Unit / Location', 'Rent', 'Lease Period', 'Issued', 'Status', ''].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filtered.map(a => (
                                            <tr key={a.agreement_id} className="hover:bg-gray-50 transition">
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-gray-800">{a.arms_tenants?.tenant_name || '—'}</p>
                                                    <p className="text-[11px] text-gray-400">{a.arms_tenants?.phone || '—'}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-gray-700 font-semibold">{a.unit_name || a.arms_tenants?.arms_units?.unit_name || '—'}</p>
                                                    <p className="text-[11px] text-gray-400">{a.arms_tenants?.arms_locations?.location_name || '—'}</p>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-indigo-700">KES {(a.monthly_rent || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-xs text-gray-500">
                                                    {a.lease_start_date ? `${a.lease_start_date} → ${a.lease_end_date || '∞'}` : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500">
                                                    {a.issued_at ? new Date(a.issued_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                                    <br /><span className="text-gray-400">{a.issued_by}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {a.accepted ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-green-100 text-green-700">
                                                            ✅ Signed
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
                                                            ⏳ Pending
                                                        </span>
                                                    )}
                                                    {a.signed_at && (
                                                        <p className="text-[10px] text-gray-400 mt-1">
                                                            {new Date(a.signed_at).toLocaleDateString('en-KE')}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button onClick={() => setViewAgreement(a)}
                                                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition">
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* === TEMPLATE TAB === */}
                {activeTab === 'template' && (
                    <div className="max-w-4xl mx-auto space-y-5">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                            <h2 className="text-base font-extrabold text-gray-800">📝 Agreement Template Editor</h2>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Agreement Title</label>
                                    <input type="text" value={editingTemplate.title || ''} onChange={e => setEditingTemplate(p => ({ ...p, title: e.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Version</label>
                                    <input type="text" value={editingTemplate.version || '1.0'} onChange={e => setEditingTemplate(p => ({ ...p, version: e.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Agreement Content</label>
                                <textarea value={editingTemplate.content || ''} onChange={e => setEditingTemplate(p => ({ ...p, content: e.target.value }))}
                                    rows={20} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-mono text-gray-700 focus:outline-none focus:border-indigo-400 resize-y" />
                                <p className="text-[11px] text-gray-400 mt-1">Tip: Use plain text. Tenant name, room, rent amount will be auto-filled.</p>
                            </div>

                            {/* Admin Signature Section */}
                            <div className="border-t border-gray-100 pt-5">
                                <h3 className="text-sm font-extrabold text-gray-700 mb-4">🖊️ Admin / Landlord Signature</h3>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Landlord / Manager Name</label>
                                        <input type="text" value={editingTemplate.admin_name || ''} onChange={e => setEditingTemplate(p => ({ ...p, admin_name: e.target.value }))}
                                            placeholder="e.g. John Kamau" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Title</label>
                                        <input type="text" value={editingTemplate.admin_title || ''} onChange={e => setEditingTemplate(p => ({ ...p, admin_title: e.target.value }))}
                                            placeholder="e.g. Property Manager" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400" />
                                    </div>
                                </div>

                                {/* Signature Upload */}
                                <div className="flex items-start gap-4">
                                    <div className="flex-1">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Upload Your Signature</label>
                                        <div
                                            className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition"
                                            onClick={() => sigInputRef.current?.click()}
                                        >
                                            {uploadingSig ? (
                                                <p className="text-sm text-indigo-500 font-semibold">Uploading…</p>
                                            ) : (
                                                <>
                                                    <p className="text-3xl mb-2">🖊️</p>
                                                    <p className="text-sm font-semibold text-gray-600">Click to upload signature image</p>
                                                    <p className="text-xs text-gray-400 mt-1">PNG, JPG — transparent background recommended</p>
                                                </>
                                            )}
                                        </div>
                                        <input ref={sigInputRef} type="file" accept="image/*" className="hidden"
                                            onChange={e => { if (e.target.files?.[0]) uploadSignature(e.target.files[0]); }} />
                                    </div>

                                    {editingTemplate.admin_signature_url && (
                                        <div className="flex-shrink-0">
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Current Signature</label>
                                            <div className="border border-gray-200 rounded-2xl p-3 bg-white">
                                                <img src={editingTemplate.admin_signature_url} alt="Admin signature"
                                                    className="h-20 object-contain max-w-[200px]" />
                                            </div>
                                            <button onClick={() => setEditingTemplate(p => ({ ...p, admin_signature_url: undefined }))}
                                                className="text-[11px] text-red-500 hover:text-red-700 mt-1 font-semibold">Remove</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button onClick={saveTemplate} disabled={savingTemplate}
                                className="w-full py-3 rounded-2xl text-sm font-bold text-white transition"
                                style={{ background: savingTemplate ? '#e2e8f0' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: savingTemplate ? '#94a3b8' : 'white' }}>
                                {savingTemplate ? 'Saving…' : '💾 Save Agreement Template'}
                            </button>
                        </div>

                        {/* Preview */}
                        {editingTemplate.content && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h3 className="text-sm font-extrabold text-gray-700 mb-4">👁️ Agreement Preview</h3>
                                <div className="border border-gray-200 rounded-xl p-6 bg-gray-50 space-y-4">
                                    <h2 className="text-lg font-black text-center text-gray-900">{editingTemplate.title}</h2>
                                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{editingTemplate.content}</pre>
                                    {editingTemplate.admin_signature_url && (
                                        <div className="border-t border-gray-200 pt-4 flex items-end justify-between">
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Landlord / Property Manager</p>
                                                <img src={editingTemplate.admin_signature_url} alt="Signature" className="h-14 object-contain" />
                                                <p className="text-xs font-bold text-gray-800 mt-1">{editingTemplate.admin_name}</p>
                                                <p className="text-xs text-gray-500">{editingTemplate.admin_title}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-500 mb-1">Tenant Signature</p>
                                                <div className="w-36 h-12 border-b-2 border-gray-400" />
                                                <p className="text-xs text-gray-500 mt-1">Date: ___________</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* View Agreement Modal */}
            {viewAgreement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-3xl flex items-center justify-between">
                            <h2 className="text-white font-extrabold">📋 Agreement Details</h2>
                            <button onClick={() => setViewAgreement(null)} className="text-white/80 hover:text-white text-xl">✕</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'Tenant', value: viewAgreement.arms_tenants?.tenant_name },
                                    { label: 'Phone', value: viewAgreement.arms_tenants?.phone },
                                    { label: 'Unit', value: viewAgreement.unit_name || viewAgreement.arms_tenants?.arms_units?.unit_name },
                                    { label: 'Location', value: viewAgreement.arms_tenants?.arms_locations?.location_name },
                                    { label: 'Monthly Rent', value: `KES ${(viewAgreement.monthly_rent || 0).toLocaleString()}` },
                                    { label: 'Deposit', value: `KES ${(viewAgreement.deposit_amount || 0).toLocaleString()}` },
                                    { label: 'Lease Start', value: viewAgreement.lease_start_date },
                                    { label: 'Lease End', value: viewAgreement.lease_end_date || 'Month-to-Month' },
                                    { label: 'Issued By', value: viewAgreement.issued_by },
                                    { label: 'Issued On', value: viewAgreement.issued_at ? new Date(viewAgreement.issued_at).toLocaleDateString('en-KE') : '—' },
                                ].map(item => (
                                    <div key={item.label}>
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{item.label}</p>
                                        <p className="text-sm font-semibold text-gray-800">{item.value || '—'}</p>
                                    </div>
                                ))}
                            </div>
                            <div className={`rounded-2xl px-4 py-3 ${viewAgreement.accepted ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                                <p className={`text-sm font-bold ${viewAgreement.accepted ? 'text-green-700' : 'text-amber-700'}`}>
                                    {viewAgreement.accepted ? '✅ Tenant has signed this agreement' : '⏳ Waiting for tenant signature'}
                                </p>
                                {viewAgreement.accepted && (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs text-gray-600">Signed: {viewAgreement.signed_at ? new Date(viewAgreement.signed_at).toLocaleString('en-KE') : '—'}</p>
                                        <p className="text-xs text-gray-600">Signature: <span className="font-bold italic">{viewAgreement.signature_text}</span></p>
                                        {viewAgreement.device_info && <p className="text-[11px] text-gray-400">Device: {viewAgreement.device_info}</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
