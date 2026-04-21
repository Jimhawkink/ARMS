'use client';
import { useState, useEffect, useCallback } from 'react';
import { getRolePermissions, updateRolePermissions } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiShield, FiCheck, FiX, FiRefreshCw, FiSearch } from 'react-icons/fi';

const PERMISSION_LABELS: Record<string, string> = {
    can_manage_tenants: 'Manage Tenants',
    can_manage_units: 'Manage Units',
    can_record_payments: 'Record Payments',
    can_view_reports: 'View Reports',
    can_send_sms: 'Send SMS',
    can_manage_utilities: 'Manage Utilities',
    can_manage_caretakers: 'Manage Caretakers',
    can_issue_demand_letters: 'Issue Demand Letters',
    can_manage_settings: 'Manage Settings',
    can_manage_users: 'Manage Users',
    can_manage_expenses: 'Manage Expenses',
    can_manage_billing: 'Manage Billing',
    can_manage_checklists: 'Manage Checklists',
    can_view_dashboard: 'View Dashboard',
    is_super_admin: 'Super Admin',
};

const ROLE_META: Record<string, { bg: string; text: string; icon: string; gradient: string; color: string; desc: string }> = {
    admin: { bg: 'bg-indigo-50', text: 'text-indigo-600', icon: '👑', gradient: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#4f46e5', desc: 'Full system access. Can manage all modules, users, and settings. Super admin privileges.' },
    caretaker: { bg: 'bg-green-50', text: 'text-green-600', icon: '🧑‍🔧', gradient: 'linear-gradient(135deg,#059669,#10b981)', color: '#059669', desc: 'Can manage tenants, record payments, send SMS, manage utilities and checklists. No access to reports, settings, or user management.' },
    agent: { bg: 'bg-blue-50', text: 'text-blue-600', icon: '🤝', gradient: 'linear-gradient(135deg,#0284c7,#06b6d4)', color: '#0284c7', desc: 'Can manage tenants, units, billing, payments, SMS, demand letters, expenses, and checklists. Cannot manage users or settings.' },
    owner: { bg: 'bg-amber-50', text: 'text-amber-600', icon: '💼', gradient: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#d97706', desc: 'Read-only access to reports, dashboard, and expenses. Ideal for property owners/investors who need visibility without editing.' },
    viewer: { bg: 'bg-gray-50', text: 'text-gray-600', icon: '👁️', gradient: 'linear-gradient(135deg,#6b7280,#9ca3af)', color: '#6b7280', desc: 'Read-only access to reports and dashboard only. Most restricted role.' },
};

export default function UsersAccessPage() {
    const [roles, setRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingRole, setEditingRole] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try { const r = await getRolePermissions(); setRoles(r); } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const togglePermission = async (roleName: string, perm: string, current: boolean) => {
        try {
            await updateRolePermissions(roleName, { [perm]: !current });
            toast.success(`✅ ${perm.replace(/can_manage_|can_view_|can_record_|can_send_|can_issue_|is_/g, '').replace(/_/g, ' ')} ${!current ? 'enabled' : 'disabled'} for ${roleName}`);
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const totalPerms = roles.reduce((s, r) => s + Object.entries(PERMISSION_LABELS).filter(([k]) => k !== 'is_super_admin').filter(([k]) => r[k]).length, 0);
    const maxPerms = roles.length * (Object.keys(PERMISSION_LABELS).length - 1);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>🔐</div><div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" /></div>
            <p className="text-sm font-bold text-gray-500">Loading Access Control…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h1 className="page-title">🔐 Users & Access Control</h1><p className="text-sm text-gray-500 mt-1">Role-based permissions • Limited access per location</p></div>
                <button onClick={() => loadData()} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition"><FiRefreshCw size={15} /></button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total Roles', value: roles.length, emoji: '👥', color: '#4f46e5', sub: 'Defined roles' },
                    { label: 'Active Perms', value: totalPerms, emoji: '✅', color: '#059669', sub: 'Enabled permissions' },
                    { label: 'Max Possible', value: maxPerms, emoji: '📊', color: '#0284c7', sub: 'Total available' },
                    { label: 'Coverage', value: maxPerms ? Math.round((totalPerms / maxPerms) * 100) + '%' : '0%', emoji: '📈', color: '#d97706', sub: 'Permission usage' },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p><span className="text-xl">{card.emoji}</span></div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p><p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* Role Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {roles.map(role => {
                    const meta = ROLE_META[role.role_name] || ROLE_META.viewer;
                    const permCount = Object.entries(PERMISSION_LABELS).filter(([k]) => k !== 'is_super_admin').filter(([k]) => role[k]).length;
                    const isSelected = editingRole === role.role_name;
                    return (
                        <div key={role.role_name} className={`bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all ${isSelected ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100'}`}
                            onClick={() => setEditingRole(isSelected ? null : role.role_name)}>
                            <div className="px-4 py-3 flex items-center gap-3 relative overflow-hidden" style={{ background: meta.gradient }}>
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/20 text-lg">{meta.icon}</div>
                                <div className="flex-1 min-w-0"><p className="font-bold text-white capitalize text-sm">{role.role_name}</p><p className="text-white/60 text-[10px]">{permCount} permissions</p></div>
                            </div>
                            <div className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-1">
                                        {Object.entries(PERMISSION_LABELS).filter(([k]) => k !== 'is_super_admin').slice(0, 5).map(([k]) => (
                                            <div key={k} className={`w-2 h-2 rounded-full ${role[k] ? 'bg-green-400' : 'bg-gray-200'}`} title={PERMISSION_LABELS[k]} />
                                        ))}
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400">{permCount}/{Object.keys(PERMISSION_LABELS).length - 1}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Permission Editor */}
            {editingRole && (() => {
                const role = roles.find(r => r.role_name === editingRole);
                if (!role) return null;
                const meta = ROLE_META[role.role_name] || ROLE_META.viewer;
                const permCount = Object.entries(PERMISSION_LABELS).filter(([k]) => k !== 'is_super_admin').filter(([k]) => role[k]).length;
                return (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 flex items-center justify-between relative overflow-hidden" style={{ background: meta.gradient }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{meta.icon}</span>
                                <div><h3 className="text-lg font-bold text-white capitalize">{role.role_name} Permissions</h3><p className="text-white/70 text-xs">{permCount} of {Object.keys(PERMISSION_LABELS).length - 1} enabled</p></div>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${(permCount / (Object.keys(PERMISSION_LABELS).length - 1)) * 100}%`, background: meta.color }} />
                                    </div>
                                    <span className="text-xs font-bold text-gray-500">{Math.round((permCount / (Object.keys(PERMISSION_LABELS).length - 1)) * 100)}%</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {Object.entries(PERMISSION_LABELS).filter(([k]) => search ? PERMISSION_LABELS[k].toLowerCase().includes(search.toLowerCase()) : true).map(([key, label]) => {
                                    const isSuperAdmin = key === 'is_super_admin';
                                    const enabled = role[key];
                                    return (
                                        <button key={key} onClick={() => !isSuperAdmin && togglePermission(role.role_name, key, enabled)}
                                            className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-bold transition-all ${enabled ? 'bg-green-50 border-green-200 text-green-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-400'} ${isSuperAdmin ? 'cursor-default' : 'hover:shadow-md'}`}>
                                            <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                                                {enabled ? <FiCheck size={11} className="text-white" /> : <FiX size={11} className="text-white" />}
                                            </div>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Role Descriptions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-700">📋 Role Descriptions</h3>
                </div>
                <div className="p-4 space-y-2">
                    {Object.entries(ROLE_META).map(([name, meta]) => (
                        <div key={name} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-gray-200 transition">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0" style={{ background: meta.gradient }}>{meta.icon}</div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-800 capitalize text-sm">{name}</p>
                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{meta.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
