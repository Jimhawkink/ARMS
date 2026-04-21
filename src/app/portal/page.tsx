'use client';
import { useState } from 'react';
import { loginPortalUser } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiUser, FiLock, FiHome, FiCreditCard, FiFileText, FiAlertCircle, FiMessageSquare } from 'react-icons/fi';

export default function TenantPortalPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loggedIn, setLoggedIn] = useState(false);
    const [tenant, setTenant] = useState<any>(null);
    const [portalTab, setPortalTab] = useState<'overview' | 'bills' | 'receipts' | 'issues'>('overview');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password) return toast.error('Enter credentials');
        try {
            const result = await loginPortalUser(username, password);
            if (result) {
                setLoggedIn(true);
                setTenant(result.arms_tenants);
                toast.success(`Welcome, ${result.arms_tenants?.tenant_name}`);
            } else {
                toast.error('Invalid credentials');
            }
        } catch (e: any) { toast.error(e.message); }
    };

    const handleLogout = () => {
        setLoggedIn(false); setTenant(null); setUsername(''); setPassword('');
    };

    const fmt = (n: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(n || 0);

    if (!loggedIn) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #1a2744 100%)' }}>
                <div className="w-full max-w-md">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                            <span className="text-white text-2xl font-black">A</span>
                        </div>
                        <h1 className="text-2xl font-black text-white mt-4" style={{ fontFamily: 'Outfit, sans-serif' }}>ARMS Tenant Portal</h1>
                        <p className="text-sm text-slate-400 mt-1">View your rent, receipts & raise issues</p>
                    </div>
                    <form onSubmit={handleLogin} className="bg-white rounded-2xl p-6 shadow-xl space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Username</label>
                            <div className="relative mt-1">
                                <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input value={username} onChange={e => setUsername(e.target.value)} className="w-full pl-9 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Enter username" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Password</label>
                            <div className="relative mt-1">
                                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-9 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Enter password" />
                            </div>
                        </div>
                        <button type="submit" className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition">Sign In</button>
                        <p className="text-xs text-center text-gray-400">Contact your landlord for portal access credentials</p>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="sticky top-0 z-40 px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e8edf5' }}>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        <span className="text-white text-xs font-black">A</span>
                    </div>
                    <span className="font-bold text-gray-800">ARMS Portal</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-600">{tenant?.tenant_name}</span>
                    <button onClick={handleLogout} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition">Logout</button>
                </div>
            </header>

            <div className="max-w-4xl mx-auto p-6 space-y-6">
                {/* Welcome */}
                <div className="rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    <h2 className="text-xl font-black">Welcome, {tenant?.tenant_name} 👋</h2>
                    <p className="text-sm text-indigo-200 mt-1">Unit: {tenant?.arms_units?.unit_name || '-'} | Location: {tenant?.arms_locations?.location_name || '-'}</p>
                    <div className="grid grid-cols-3 gap-4 mt-4">
                        <div className="bg-white/10 rounded-xl p-3">
                            <p className="text-xs text-indigo-200">Monthly Rent</p>
                            <p className="text-lg font-black">{fmt(tenant?.monthly_rent || 0)}</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3">
                            <p className="text-xs text-indigo-200">Balance Due</p>
                            <p className="text-lg font-black">{fmt(tenant?.balance || 0)}</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3">
                            <p className="text-xs text-indigo-200">Move-in Date</p>
                            <p className="text-lg font-black">{tenant?.move_in_date || '-'}</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-gray-100 shadow-sm">
                    {[
                        { key: 'overview', label: 'Overview', icon: FiHome },
                        { key: 'bills', label: 'My Bills', icon: FiFileText },
                        { key: 'receipts', label: 'Receipts', icon: FiCreditCard },
                        { key: 'issues', label: 'Raise Issue', icon: FiAlertCircle },
                    ].map(t => (
                        <button key={t.key} onClick={() => setPortalTab(t.key as any)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${portalTab === t.key ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                            <t.icon size={14} /> {t.label}
                        </button>
                    ))}
                </div>

                {portalTab === 'overview' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-3">🏠 My Unit</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500">Unit</span><span className="font-semibold">{tenant?.arms_units?.unit_name || '-'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-semibold">{tenant?.arms_units?.unit_type || '-'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Monthly Rent</span><span className="font-bold text-green-600">{fmt(tenant?.monthly_rent || 0)}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Deposit Paid</span><span className="font-semibold">{fmt(tenant?.deposit_paid || 0)}</span></div>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-3">📞 Contact Info</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500">Phone</span><span className="font-semibold">{tenant?.phone || '-'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="font-semibold">{tenant?.email || '-'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">ID Number</span><span className="font-semibold">{tenant?.id_number || '-'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Emergency</span><span className="font-semibold">{tenant?.emergency_contact || '-'}</span></div>
                            </div>
                        </div>
                    </div>
                )}

                {portalTab === 'bills' && (
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
                        <FiFileText size={40} className="mx-auto text-indigo-300 mb-3" />
                        <p className="font-bold text-gray-700">Billing details will appear here</p>
                        <p className="text-xs text-gray-400 mt-1">Your monthly rent statements and billing history</p>
                    </div>
                )}

                {portalTab === 'receipts' && (
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
                        <FiCreditCard size={40} className="mx-auto text-green-300 mb-3" />
                        <p className="font-bold text-gray-700">Payment receipts will appear here</p>
                        <p className="text-xs text-gray-400 mt-1">Download and print your payment confirmations</p>
                    </div>
                )}

                {portalTab === 'issues' && (
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                        <h3 className="font-bold text-gray-800">🔧 Report a Maintenance Issue</h3>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Issue Type</label>
                            <select className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                <option>Maintenance</option><option>Plumbing</option><option>Electrical</option><option>Noise</option><option>Security</option><option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Subject</label>
                            <input className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Brief description of the issue" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                            <textarea rows={4} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Provide details about the issue..." />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Priority</label>
                            <div className="flex gap-2 mt-1">
                                {['Low', 'Medium', 'High', 'Urgent'].map(p => (
                                    <button key={p} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition">{p}</button>
                                ))}
                            </div>
                        </div>
                        <button className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition">Submit Issue</button>
                    </div>
                )}
            </div>
        </div>
    );
}
