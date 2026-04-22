'use client';
import { useState } from 'react';
import { loginPortalUser } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiUser, FiLock, FiHome, FiCreditCard, FiFileText, FiAlertCircle, FiLogOut, FiSend } from 'react-icons/fi';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

export default function TenantPortalPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loggedIn, setLoggedIn] = useState(false);
    const [tenant, setTenant] = useState<any>(null);
    const [portalTab, setPortalTab] = useState<'overview' | 'bills' | 'receipts' | 'issues'>('overview');
    const [issuePriority, setIssuePriority] = useState('Medium');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password) return toast.error('Enter credentials');
        try {
            const result = await loginPortalUser(username, password);
            if (result) { setLoggedIn(true); setTenant(result.arms_tenants); toast.success(`Welcome, ${result.arms_tenants?.tenant_name}`); }
            else { toast.error('Invalid credentials'); }
        } catch (e: any) { toast.error(e.message); }
    };

    const handleLogout = () => { setLoggedIn(false); setTenant(null); setUsername(''); setPassword(''); };

    if (!loggedIn) {
        return (
            <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 50%, #eef2ff 100%)' }}>
                <div className="w-full max-w-md relative z-10">
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-xl" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                            <span className="text-white text-3xl font-black">A</span>
                        </div>
                        <h1 className="text-3xl font-black text-gray-900 mt-6" style={{ fontFamily: 'Outfit, sans-serif' }}>ARMS Portal</h1>
                        <p className="text-sm text-gray-500 mt-2">View your rent, receipts & raise issues</p>
                    </div>
                    <form onSubmit={handleLogin} className="bg-white rounded-3xl p-8 shadow-xl space-y-5 border border-gray-100">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">👤 Username</label>
                            <div className="relative mt-1.5">
                                <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input value={username} onChange={e => setUsername(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all" placeholder="Enter username" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">🔒 Password</label>
                            <div className="relative mt-1.5">
                                <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all" placeholder="Enter password" />
                            </div>
                        </div>
                        <button type="submit" className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition shadow-lg hover:shadow-xl hover:opacity-90" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>Sign In</button>
                        <p className="text-xs text-center text-gray-400">Contact your landlord for portal access credentials</p>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50">
            {/* Header */}
            <header className="sticky top-0 z-40 px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e8edf5' }}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        <span className="text-white text-xs font-black">A</span>
                    </div>
                    <div><span className="font-bold text-gray-800">ARMS Portal</span><p className="text-[10px] text-gray-400">Tenant Self-Service</p></div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>{(tenant?.tenant_name || '?').charAt(0)}</div>
                        <span className="text-xs font-bold text-indigo-700">{tenant?.tenant_name}</span>
                    </div>
                    <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 border border-red-100 transition"><FiLogOut size={12} /> Logout</button>
                </div>
            </header>

            <div className="max-w-5xl mx-auto p-6 space-y-5">
                {/* Welcome Banner */}
                <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                    <div className="absolute right-0 top-0 w-48 h-48 rounded-full -translate-y-16 translate-x-16 opacity-10 bg-white" />
                    <div className="absolute right-20 bottom-0 w-32 h-32 rounded-full translate-y-12 opacity-10 bg-white" />
                    <div className="relative z-10">
                        <h2 className="text-xl font-black">Welcome, {tenant?.tenant_name} 👋</h2>
                        <p className="text-sm text-indigo-200 mt-1">🏠 {tenant?.arms_units?.unit_name || '-'} • 📍 {tenant?.arms_locations?.location_name || '-'}</p>
                        <div className="grid grid-cols-3 gap-4 mt-5">
                            {[
                                { label: 'Monthly Rent', value: fmt(tenant?.monthly_rent || 0), emoji: '💰' },
                                { label: 'Balance Due', value: fmt(tenant?.balance || 0), emoji: '📋' },
                                { label: 'Move-in Date', value: tenant?.move_in_date || '—', emoji: '📅' },
                            ].map((item, i) => (
                                <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                                    <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">{item.emoji} {item.label}</p>
                                    <p className="text-lg font-black mt-1">{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                    {[
                        { key: 'overview', label: '🏠 Overview', keyVal: 'overview' as const },
                        { key: 'bills', label: '📋 My Bills', keyVal: 'bills' as const },
                        { key: 'receipts', label: '🧾 Receipts', keyVal: 'receipts' as const },
                        { key: 'issues', label: '🔧 Raise Issue', keyVal: 'issues' as const },
                    ].map(t => (
                        <button key={t.key} onClick={() => setPortalTab(t.keyVal)}
                            className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${portalTab === t.key ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
                    ))}
                </div>

                {/* Overview Tab */}
                {portalTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#ecfdf5,#f0fdf4)' }}>
                                <span className="text-lg">🏠</span><h3 className="font-bold text-green-800 text-sm">My Unit</h3>
                            </div>
                            <div className="p-5 space-y-3 text-xs">
                                {[
                                    { label: 'Unit', value: tenant?.arms_units?.unit_name || '—' },
                                    { label: 'Type', value: tenant?.arms_units?.unit_type || '—' },
                                    { label: 'Monthly Rent', value: fmt(tenant?.monthly_rent || 0), bold: true, color: 'text-green-600' },
                                    { label: 'Deposit Paid', value: fmt(tenant?.deposit_paid || 0) },
                                    { label: 'Status', value: tenant?.status || '—' },
                                ].map((row, i) => (
                                    <div key={i} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                                        <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">{row.label}</span>
                                        <span className={`font-bold ${row.bold ? 'text-base font-extrabold' : ''} ${row.color || 'text-gray-700'}`}>{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
                                <span className="text-lg">📞</span><h3 className="font-bold text-indigo-800 text-sm">Contact Info</h3>
                            </div>
                            <div className="p-5 space-y-3 text-xs">
                                {[
                                    { label: 'Phone', value: tenant?.phone || '—' },
                                    { label: 'Email', value: tenant?.email || '—' },
                                    { label: 'ID Number', value: tenant?.id_number || '—' },
                                    { label: 'Emergency', value: tenant?.emergency_contact || '—' },
                                    { label: 'Emergency Phone', value: tenant?.emergency_phone || '—' },
                                ].map((row, i) => (
                                    <div key={i} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                                        <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">{row.label}</span>
                                        <span className="font-bold text-gray-700">{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Bills Tab */}
                {portalTab === 'bills' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}><FiFileText size={28} className="text-indigo-400" /></div>
                        <p className="font-bold text-gray-700 text-lg">Billing Details</p>
                        <p className="text-xs text-gray-400 mt-1">Your monthly rent statements and billing history will appear here</p>
                    </div>
                )}

                {/* Receipts Tab */}
                {portalTab === 'receipts' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg,#ecfdf5,#f0fdf4)' }}><FiCreditCard size={28} className="text-green-400" /></div>
                        <p className="font-bold text-gray-700 text-lg">Payment Receipts</p>
                        <p className="text-xs text-gray-400 mt-1">Download and print your payment confirmations</p>
                    </div>
                )}

                {/* Issues Tab */}
                {portalTab === 'issues' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <span className="text-2xl">🔧</span>
                            <div><h3 className="text-lg font-bold text-white">Report a Maintenance Issue</h3><p className="text-white/70 text-xs">We'll get back to you promptly</p></div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏷️ Issue Type</label><select className="select-field"><option>Maintenance</option><option>Plumbing</option><option>Electrical</option><option>Noise</option><option>Security</option><option>Other</option></select></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">⚡ Priority</label>
                                    <div className="flex gap-2 mt-1">
                                        {['Low', 'Medium', 'High', 'Urgent'].map(p => (
                                            <button key={p} onClick={() => setIssuePriority(p)} className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all border ${issuePriority === p ? (p === 'Urgent' ? 'bg-red-50 text-red-700 border-red-200 shadow-sm' : p === 'High' ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm' : p === 'Medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 shadow-sm' : 'bg-green-50 text-green-700 border-green-200 shadow-sm') : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{p}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📋 Subject</label><input className="input-field" placeholder="Brief description of the issue" /></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📝 Description</label><textarea rows={4} className="input-field" placeholder="Provide details about the issue…" /></div>
                        </div>
                        <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                            <button className="w-full py-3 rounded-xl text-white font-bold text-sm transition shadow-md hover:opacity-90 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}><FiSend size={14} /> Submit Issue</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
