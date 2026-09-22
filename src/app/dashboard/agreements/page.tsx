'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';

interface AgreementTemplate {
    template_id: number;
    title: string;
    content: string;
    admin_signature_url: string | null;
    admin_name: string;
    admin_title: string;
    version: string;
    is_active: boolean;
    created_at: string;
}

interface TenantAgreement {
    agreement_id: number;
    tenant_id: number;
    tenant_name: string;
    unit_name: string;
    location_name: string;
    lease_start_date: string | null;
    lease_end_date: string | null;
    monthly_rent: number;
    deposit_amount: number;
    accepted: boolean;
    signed_at: string | null;
    signature_text: string | null;
    issued_by: string;
    issued_at: string;
    created_at: string;
}

type ActiveView = 'dashboard' | 'editor' | 'preview' | 'agreements';

function fmt(n: number) { return `KES ${(n || 0).toLocaleString()}`; }
function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

const DEFAULT_CONTENT = `RESIDENTIAL TENANCY AGREEMENT

This Tenancy Agreement is entered into between:

LANDLORD: {{admin_name}} (hereinafter "Landlord")
TENANT: {{tenant_name}} (hereinafter "Tenant")
PREMISES: Unit {{unit_name}}, {{location_name}}

1. TERM OF TENANCY
The tenancy shall commence on {{lease_start_date}} and continue on a month-to-month basis unless a fixed end date of {{lease_end_date}} has been specified, or until terminated in accordance with this Agreement.

2. RENT
The Tenant agrees to pay a monthly rent of {{monthly_rent}} (Kenya Shillings), due on or before the 5th day of each month. Payments shall be made via the designated M-Pesa paybill or such other method as agreed.

3. SECURITY DEPOSIT
The Tenant shall pay a refundable security deposit of {{deposit_amount}} prior to or upon commencement of the tenancy. This deposit shall be refunded within 30 days of vacating the premises, less any deductions for damages beyond normal wear and tear.

4. USE OF PREMISES
The premises shall be used solely for residential purposes. The Tenant shall not sublet or assign this agreement without the prior written consent of the Landlord.

5. UTILITIES & SERVICES
The Tenant shall be responsible for payment of water, electricity, and any other utilities consumed at the premises unless otherwise agreed in writing.

6. MAINTENANCE & REPAIRS
The Tenant shall keep the premises in clean and good condition. Any damage caused by the Tenant shall be repaired at the Tenant's expense. The Tenant shall promptly report any maintenance issues to the Landlord.

7. ACCESS
The Landlord shall have the right to enter the premises at reasonable times and with reasonable notice (except in emergencies) for the purposes of inspection, maintenance, or repairs.

8. TERMINATION
Either party may terminate this agreement by providing one (1) calendar month's written notice. The Landlord may terminate this agreement immediately in the event of non-payment of rent or breach of any term of this agreement.

9. HOUSE RULES
The Tenant agrees to comply with all house rules established by the Landlord including noise regulations, waste disposal guidelines, and communal area usage policies.

10. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the Republic of Kenya, including the Landlord and Tenant (Shops, Hotels and Catering Establishments) Act and the Rent Restriction Act.

By digitally signing this agreement on the mobile application, the Tenant confirms that they have read, understood, and agree to be bound by all terms and conditions set forth herein.`;

export default function AgreementsPage() {
    const [view, setView] = useState<ActiveView>('dashboard');
    const [template, setTemplate] = useState<AgreementTemplate | null>(null);
    const [agreements, setAgreements] = useState<TenantAgreement[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [sigPreview, setSigPreview] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'signed' | 'pending'>('all');
    const fileRef = useRef<HTMLInputElement>(null);

    // Template form state
    const [tForm, setTForm] = useState({
        title: 'ARMS Residential Tenancy Agreement',
        content: DEFAULT_CONTENT,
        admin_name: '',
        admin_title: 'Property Manager',
        version: 'v1.0',
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [tmplRes, agmtRes] = await Promise.all([
                fetch('/api/agreements/template'),
                fetch('/api/agreements/sign'),
            ]);
            if (tmplRes.ok) {
                const d = await tmplRes.json();
                if (d.template) {
                    setTemplate(d.template);
                    setSigPreview(d.template.admin_signature_url);
                    setTForm({
                        title: d.template.title,
                        content: d.template.content,
                        admin_name: d.template.admin_name,
                        admin_title: d.template.admin_title,
                        version: d.template.version,
                    });
                }
            }
            if (agmtRes.ok) {
                const d = await agmtRes.json();
                setAgreements(d.agreements || []);
            }
        } catch { toast.error('Failed to load data'); }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const saveTemplate = async () => {
        if (!tForm.title.trim() || !tForm.content.trim()) { toast.error('Title and content are required'); return; }
        setSaving(true);
        try {
            const method = template ? 'PUT' : 'POST';
            const body = { ...tForm, ...(template ? { template_id: template.template_id } : {}) };
            const res = await fetch('/api/agreements/template', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('✅ Template saved successfully!');
            await loadData();
            setView('dashboard');
        } catch (e: any) { toast.error(e.message || 'Save failed'); }
        setSaving(false);
    };

    const uploadSignature = async (file: File) => {
        if (!template) { toast.error('Save the template first before uploading a signature'); return; }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('template_id', String(template.template_id));
            const res = await fetch('/api/agreements/upload-signature', { method: 'POST', body: formData });
            if (!res.ok) throw new Error((await res.json()).error);
            const d = await res.json();
            setSigPreview(d.url);
            toast.success('✅ Signature uploaded!');
            loadData();
        } catch (e: any) { toast.error(e.message || 'Upload failed'); }
        setUploading(false);
    };

    const filtered = agreements.filter(a => {
        const match = (a.tenant_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (a.unit_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (a.location_name || '').toLowerCase().includes(search.toLowerCase());
        if (!match) return false;
        if (filterStatus === 'signed') return a.accepted;
        if (filterStatus === 'pending') return !a.accepted;
        return true;
    });

    const signedCount = agreements.filter(a => a.accepted).length;
    const pendingCount = agreements.filter(a => !a.accepted).length;

    // ── DASHBOARD VIEW ──
    if (view === 'dashboard') return (
        <div className="animate-fadeIn space-y-6 p-6 bg-gray-50 min-h-full">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
                        📋 Tenancy Agreements
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Digital lease management · Legally traceable signatures</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setView('agreements')}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition">
                        📄 View All Agreements
                    </button>
                    <button onClick={() => setView('editor')}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-90 transition"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                        ✏️ {template ? 'Edit Template' : 'Create Template'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-2xl animate-pulse">📋</div>
                </div>
            ) : (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { emoji: '📋', label: 'Total Issued', value: agreements.length, color: '#6366f1', bg: '#eef2ff' },
                            { emoji: '✅', label: 'Signed', value: signedCount, color: '#059669', bg: '#f0fdf4' },
                            { emoji: '⏳', label: 'Pending', value: pendingCount, color: '#d97706', bg: '#fffbeb' },
                            { emoji: '📊', label: 'Sign Rate', value: agreements.length > 0 ? `${Math.round(signedCount / agreements.length * 100)}%` : '—', color: '#7c3aed', bg: '#faf5ff' },
                        ].map(s => (
                            <div key={s.label} className="rounded-2xl p-5 border"
                                style={{ background: s.bg, borderColor: s.bg }}>
                                <p className="text-2xl mb-1">{s.emoji}</p>
                                <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                                <p className="text-xs font-semibold text-gray-500 mt-1">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Template Status Card */}
                    <div className="rounded-2xl border bg-white p-6 shadow-sm">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                                    style={{ background: template ? '#f0fdf4' : '#fff7ed' }}>
                                    {template ? '✅' : '📝'}
                                </div>
                                <div>
                                    <p className="font-extrabold text-gray-900 text-base">
                                        {template ? template.title : 'No Template Yet'}
                                    </p>
                                    {template ? (
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">{template.version}</span>
                                            <span className="text-xs text-gray-400">by {template.admin_name}</span>
                                            <span className="text-xs text-gray-400">· {fmtDate(template.created_at)}</span>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400 mt-1">Create a template to start issuing agreements to tenants</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {template && (
                                    <button onClick={() => setView('preview')}
                                        className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                                        👁 Preview
                                    </button>
                                )}
                                <button onClick={() => setView('editor')}
                                    className="px-3 py-2 rounded-xl text-xs font-bold text-white transition"
                                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                    {template ? '✏️ Edit' : '+ Create'}
                                </button>
                            </div>
                        </div>

                        {/* Admin Signature */}
                        {template && (
                            <div className="mt-5 pt-5 border-t border-gray-100">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Admin Signature</p>
                                    <button onClick={() => fileRef.current?.click()}
                                        disabled={uploading}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition">
                                        {uploading ? '⏳ Uploading…' : sigPreview ? '🔄 Change' : '⬆️ Upload Signature'}
                                    </button>
                                    <input ref={fileRef} type="file" accept="image/*" className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadSignature(f); e.target.value = ''; }} />
                                </div>
                                {sigPreview ? (
                                    <div className="flex items-center gap-4">
                                        <img src={sigPreview} alt="Admin signature"
                                            className="h-16 max-w-48 object-contain border border-gray-100 rounded-xl p-2 bg-gray-50" />
                                        <div>
                                            <p className="text-sm font-extrabold text-gray-800">{template.admin_name}</p>
                                            <p className="text-xs text-gray-500">{template.admin_title}</p>
                                            <p className="text-[10px] text-green-600 font-semibold mt-1">✓ Signature will appear on tenant agreements</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                                        <span className="text-amber-500 text-xl">⚠️</span>
                                        <div>
                                            <p className="text-sm font-bold text-amber-800">No signature uploaded</p>
                                            <p className="text-xs text-amber-600">Upload your signature so it appears on all tenant agreements</p>
                                        </div>
                                        <button onClick={() => fileRef.current?.click()}
                                            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition">
                                            Upload
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Recent Agreements preview */}
                    {agreements.length > 0 && (
                        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-extrabold text-gray-800">Recent Agreements</h3>
                                <button onClick={() => setView('agreements')}
                                    className="text-xs font-bold text-indigo-500 hover:text-indigo-700 transition">
                                    View all →
                                </button>
                            </div>
                            {agreements.slice(0, 5).map(a => (
                                <div key={a.agreement_id} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${a.accepted ? 'bg-green-100' : 'bg-amber-100'}`}>
                                        {a.accepted ? '✅' : '⏳'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate">{a.tenant_name}</p>
                                        <p className="text-[11px] text-gray-400">{a.unit_name} · {a.location_name}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className={`text-xs font-extrabold ${a.accepted ? 'text-green-600' : 'text-amber-600'}`}>
                                            {a.accepted ? '✓ Signed' : 'Pending'}
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {a.accepted ? fmtDate(a.signed_at) : `Issued ${fmtDate(a.created_at)}`}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );

    // ── EDITOR VIEW ──
    if (view === 'editor') return (
        <div className="animate-fadeIn flex flex-col h-full bg-gray-50">
            {/* Editor Header */}
            <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => setView('dashboard')}
                        className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition text-lg">
                        ←
                    </button>
                    <div>
                        <h2 className="font-extrabold text-gray-900">{template ? 'Edit Template' : 'Create Template'}</h2>
                        <p className="text-xs text-gray-400">Changes apply to all future agreements</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setView('preview')}
                        className="px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                        👁 Preview
                    </button>
                    <button onClick={saveTemplate} disabled={saving}
                        className="px-5 py-2 rounded-xl text-sm font-bold text-white shadow hover:opacity-90 transition disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                        {saving ? '⏳ Saving…' : '💾 Save Template'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Meta fields */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4">Agreement Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-gray-600 mb-1.5 block">Agreement Title</label>
                            <input value={tForm.title} onChange={e => setTForm(p => ({ ...p, title: e.target.value }))}
                                className="input-field w-full" placeholder="e.g. ARMS Residential Tenancy Agreement" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-1.5 block">Landlord / Manager Name</label>
                            <input value={tForm.admin_name} onChange={e => setTForm(p => ({ ...p, admin_name: e.target.value }))}
                                className="input-field w-full" placeholder="Your full name" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-1.5 block">Title / Position</label>
                            <input value={tForm.admin_title} onChange={e => setTForm(p => ({ ...p, admin_title: e.target.value }))}
                                className="input-field w-full" placeholder="e.g. Property Manager" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-1.5 block">Version</label>
                            <input value={tForm.version} onChange={e => setTForm(p => ({ ...p, version: e.target.value }))}
                                className="input-field w-full" placeholder="v1.0" />
                        </div>
                    </div>
                </div>

                {/* Content editor */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Agreement Content</h3>
                        <button onClick={() => setTForm(p => ({ ...p, content: DEFAULT_CONTENT }))}
                            className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold transition">
                            Reset to default
                        </button>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                        {['{{tenant_name}}', '{{unit_name}}', '{{location_name}}', '{{lease_start_date}}', '{{lease_end_date}}', '{{monthly_rent}}', '{{deposit_amount}}', '{{admin_name}}'].map(tag => (
                            <button key={tag} onClick={() => setTForm(p => ({ ...p, content: p.content + tag }))}
                                className="text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg border border-indigo-100 font-mono hover:bg-indigo-100 transition">
                                {tag}
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={tForm.content}
                        onChange={e => setTForm(p => ({ ...p, content: e.target.value }))}
                        rows={24}
                        className="w-full font-mono text-xs text-gray-700 border border-gray-200 rounded-xl p-4 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 resize-none"
                        placeholder="Type your agreement content here…"
                    />
                    <p className="text-[11px] text-gray-400 mt-2">
                        Use the tags above to insert dynamic fields. They are automatically replaced with actual tenant data when issuing.
                    </p>
                </div>
            </div>
        </div>
    );

    // ── PREVIEW VIEW ──
    if (view === 'preview') {
        const previewContent = tForm.content
            .replace(/{{tenant_name}}/g, 'John Mwangi')
            .replace(/{{unit_name}}/g, 'A-101')
            .replace(/{{location_name}}/g, 'Alpha Apartments')
            .replace(/{{lease_start_date}}/g, '01 October 2026')
            .replace(/{{lease_end_date}}/g, 'Month-to-Month')
            .replace(/{{monthly_rent}}/g, 'KES 9,500')
            .replace(/{{deposit_amount}}/g, 'KES 19,000')
            .replace(/{{admin_name}}/g, tForm.admin_name || 'The Landlord');

        return (
            <div className="animate-fadeIn flex flex-col h-full bg-gray-100">
                <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('editor')} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition text-lg">←</button>
                        <div>
                            <h2 className="font-extrabold text-gray-900">Agreement Preview</h2>
                            <p className="text-xs text-gray-400">Showing with sample data</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setView('editor')} className="px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">✏️ Back to Editor</button>
                        <button onClick={saveTemplate} disabled={saving}
                            className="px-5 py-2 rounded-xl text-sm font-bold text-white shadow hover:opacity-90 transition"
                            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                            {saving ? '⏳ Saving…' : '💾 Save'}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
                        {/* Doc header */}
                        <div className="px-10 py-8 border-b-4 border-indigo-600" style={{ background: 'linear-gradient(135deg,#1e1b4b,#3730a3)' }}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Alpha Solutions</p>
                                    <h1 className="text-white text-2xl font-extrabold leading-tight">{tForm.title}</h1>
                                    <p className="text-indigo-300 text-sm mt-2">{tForm.version}</p>
                                </div>
                                <div className="text-6xl opacity-20">📋</div>
                            </div>
                        </div>
                        {/* Details strip */}
                        <div className="px-10 py-5 bg-indigo-50 border-b border-indigo-100">
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Monthly Rent', value: 'KES 9,500' },
                                    { label: 'Security Deposit', value: 'KES 19,000' },
                                    { label: 'Lease Start', value: '01 Oct 2026' },
                                ].map(d => (
                                    <div key={d.label}>
                                        <p className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-wider">{d.label}</p>
                                        <p className="text-sm font-extrabold text-indigo-900 mt-0.5">{d.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Body */}
                        <div className="px-10 py-8">
                            <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">{previewContent}</pre>
                        </div>
                        {/* Signatures */}
                        <div className="px-10 pb-10">
                            <div className="grid grid-cols-2 gap-8 pt-6 border-t-2 border-gray-100">
                                <div>
                                    <p className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-widest mb-3">Landlord / Manager</p>
                                    {sigPreview
                                        ? <img src={sigPreview} alt="sig" className="h-12 mb-2 object-contain" />
                                        : <div className="h-12 mb-2 border-b-2 border-gray-300" />}
                                    <p className="text-sm font-extrabold text-gray-800">{tForm.admin_name || '—'}</p>
                                    <p className="text-xs text-gray-400">{tForm.admin_title}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-widest mb-3">Tenant Digital Signature</p>
                                    <div className="h-12 mb-2 border-b-2 border-gray-300 flex items-end pb-1">
                                        <span className="text-gray-400 italic text-sm">John Mwangi</span>
                                    </div>
                                    <p className="text-sm font-extrabold text-gray-800">John Mwangi</p>
                                    <p className="text-xs text-gray-400">Signed digitally via mobile app</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── AGREEMENTS LIST VIEW ──
    return (
        <div className="animate-fadeIn flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <button onClick={() => setView('dashboard')} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition text-lg">←</button>
                    <div>
                        <h2 className="font-extrabold text-gray-900">All Agreements</h2>
                        <p className="text-xs text-gray-400">{agreements.length} total · {signedCount} signed · {pendingCount} pending</p>
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search tenant, unit, location…"
                        className="input-field text-sm w-56" />
                    {['all', 'signed', 'pending'].map(f => (
                        <button key={f} onClick={() => setFilterStatus(f as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition capitalize ${filterStatus === f ? 'bg-indigo-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <span className="text-5xl">📋</span>
                        <p className="text-gray-500 font-bold">No agreements found</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(a => (
                            <div key={a.agreement_id}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden">
                                <div className="flex items-start gap-4 p-5">
                                    {/* Status icon */}
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${a.accepted ? 'bg-green-100' : 'bg-amber-100'}`}>
                                        {a.accepted ? '✅' : '⏳'}
                                    </div>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div>
                                                <p className="font-extrabold text-gray-900 text-base">{a.tenant_name}</p>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className="text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-semibold border border-indigo-100">🏠 {a.unit_name}</span>
                                                    <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold border border-amber-100">📍 {a.location_name}</span>
                                                    {a.accepted && a.signature_text && (
                                                        <span className="text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-semibold border border-green-100">✍️ "{a.signature_text}"</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={`flex-shrink-0 text-xs font-extrabold px-3 py-1 rounded-full ${a.accepted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {a.accepted ? '✓ SIGNED' : 'PENDING'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-50">
                                            {[
                                                { label: 'Monthly Rent', value: fmt(a.monthly_rent) },
                                                { label: 'Deposit', value: fmt(a.deposit_amount) },
                                                { label: 'Issued', value: fmtDate(a.created_at) },
                                                { label: a.accepted ? 'Signed' : 'Expires', value: a.accepted ? fmtDate(a.signed_at) : '—' },
                                            ].map(d => (
                                                <div key={d.label}>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{d.label}</p>
                                                    <p className="text-sm font-extrabold text-gray-800 mt-0.5">{d.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
