'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getRolePermissions, updateRolePermissions, getARMSUsers, createARMSUser, updateARMSUser, deactivateARMSUser } from '@/lib/supabase';
import { parseStoredUser } from '@/lib/rbac';
import toast from 'react-hot-toast';
import { FiShield, FiCheck, FiX, FiRefreshCw, FiPlus, FiEdit2, FiUserX, FiSave, FiEye, FiEyeOff } from 'react-icons/fi';

const PERMISSION_LABELS: Record<string, string> = {
    can_manage_tenants: 'Manage Tenants',
    can_manage_units: 'Manage Units',
    can_record_payments: 'Record Payments',
    can_view_reports: 'View Reports',
    can_send_sms: 'Send SMS/WhatsApp',
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

const ROLE_META: Record<string, { icon: string; gradient: string; color: string; desc: string }> = {
    admin:     { icon: '', gradient: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#4f46e5', desc: 'Full access. Can manage all modules, users, and settings.' },
    manager:   { icon: '', gradient: 'linear-gradient(135deg,#0284c7,#0891b2)', color: '#0284c7', desc: 'Manages tenants, billing, payments. Cannot access Settings, Users, or Licensing.' },
    caretaker: { icon: '', gradient: 'linear-gradient(135deg,#059669,#10b981)', color: '#059669', desc: 'Operational access: tenants, payments, utilities, checklists.' },
    agent:     { icon: '', gradient: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#7c3aed', desc: 'Can manage tenants, billing, payments, SMS, demand letters.' },
    owner:     { icon: '', gradient: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#d97706', desc: 'Read-only: reports, dashboard, expenses.' },
    viewer:    { icon: '', gradient: 'linear-gradient(135deg,#6b7280,#9ca3af)', color: '#6b7280', desc: 'Read-only: reports and dashboard only.' },
};

const ROLES = ['admin', 'manager', 'caretaker', 'agent', 'owner', 'viewer'];

export default function UsersAccessPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [roles, setRoles] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingRole, setEditingRole] = useState<string | null>(null);
    const [tab, setTab] = useState<'users' | 'roles'>('users');

    // Add user form
    const [showAddUser, setShowAddUser] = useState(false);
    const [editUser, setEditUser] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [showPwd, setShowPwd] = useState(false);
    const [form, setForm] = useState({ user_name: '', password_hash: '', name: '', email: '', phone: '', user_role: 'manager' });

    useEffect(() => {
        const raw = localStorage.getItem('arms_user');
        const u = raw ? parseStoredUser(raw) : null;
        if (!u) { router.push('/'); return; }
        // Only admin or super admin can access this page
        if (!u.isSuperAdmin && u.userRole !== 'admin' && !u.permissions?.can_manage_users) {
            toast.error('Access denied'); router.push('/dashboard'); return;
        }
        setCurrentUser(u);
        loadData();
    }, [router]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [r, u] = await Promise.all([getRolePermissions(), getARMSUsers()]);
            setRoles(r); setUsers(u);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    }, []);

    const togglePermission = async (roleName: string, perm: string, current: boolean) => {
        if (perm === 'is_super_admin') return; // Never toggle super admin
        if (roleName === 'admin' && !currentUser?.isSuperAdmin) return toast.error('Only Super Admin can modify admin role');
        try {
            await updateRolePermissions(roleName, { [perm]: !current });
            toast.success(`${PERMISSION_LABELS[perm]} ${!current ? 'enabled' : 'disabled'} for ${roleName}`);
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleSaveUser = async () => {
        if (!form.name.trim() || !form.user_name.trim()) return toast.error('Name and username are required');
        if (!editUser && !form.password_hash.trim()) return toast.error('Password is required for new users');
        setSaving(true);
        try {
            if (editUser) {
                const updates: any = { name: form.name, email: form.email, phone: form.phone, user_role: form.user_role };
                if (form.password_hash.trim()) updates.password_hash = form.password_hash;
                await updateARMSUser(editUser.user_id, updates);
                toast.success('User updated');
            } else {
                await createARMSUser({ user_name: form.user_name, password_hash: form.password_hash, name: form.name, email: form.email, phone: form.phone, user_role: form.user_role, user_type: form.user_role });
                toast.success('User created');
            }
            setShowAddUser(false); setEditUser(null);
            setForm({ user_name: '', password_hash: '', name: '', email: '', phone: '', user_role: 'manager' });
            loadData();
        } catch (e: any) { toast.error(e.message); }
        setSaving(false);
    };

    const handleDeactivate = async (u: any) => {
        if (u.is_super_admin) return toast.error('Cannot deactivate the Super Admin');
        if (!confirm(`Deactivate ${u.name}? They will no longer be able to log in.`)) return;
        try { await deactivateARMSUser(u.user_id); toast.success('User deactivated'); loadData(); }
        catch (e: any) { toast.error(e.message); }
    };

    const openEdit = (u: any) => {
        setEditUser(u);
        setForm({ user_name: u.user_name, password_hash: '', name: u.name, email: u.email || '', phone: u.phone || '', user_role: u.user_role || 'manager' });
        setShowAddUser(true);
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}></div><div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" /></div>
            <p className="text-sm font-bold text-gray-500">Loading Access Control</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h1 className="page-title"> Users & Access Control</h1><p className="text-sm text-gray-500 mt-1">Role-based permissions  {users.filter(u => u.active).length} active users</p></div>
                <div className="flex items-center gap-2">
                    <button onClick={loadData} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition"><FiRefreshCw size={15} /></button>
                    {tab === 'users' && <button onClick={() => { setShowAddUser(true); setEditUser(null); setForm({ user_name: '', password_hash: '', name: '', email: '', phone: '', user_role: 'manager' }); }} className="btn-primary flex items-center gap-2"><FiPlus size={14} /> Add User</button>}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {[{ k: 'users', l: ' Users' }, { k: 'roles', l: ' Role Permissions' }].map(t => (
                    <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === t.k ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>{t.l}</button>
                ))}
            </div>

            {/*  USERS TAB  */}
            {tab === 'users' && (
                <div className="space-y-4">
                    {showAddUser && (
                        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                                <FiShield size={18} className="text-white" />
                                <div><h3 className="text-sm font-bold text-white">{editUser ? 'Edit User' : 'Add New User'}</h3><p className="text-white/60 text-[10px]">All users except Super Admin can be managed here</p></div>
                                <button onClick={() => { setShowAddUser(false); setEditUser(null); }} className="ml-auto p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={16} /></button>
                            </div>
                            <div className="p-5 grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider"> Full Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="John Doe" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider"> Username *</label><input value={form.user_name} onChange={e => setForm({ ...form, user_name: e.target.value })} className="input-field" placeholder="johndoe" disabled={!!editUser} /></div>
                                <div className="relative"><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider"> Password {editUser ? '(leave blank to keep)' : '*'}</label><input type={showPwd ? 'text' : 'password'} value={form.password_hash} onChange={e => setForm({ ...form, password_hash: e.target.value })} className="input-field pr-10" placeholder={editUser ? 'Leave blank to keep current' : 'Min 8 characters'} /><button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-8 text-gray-400">{showPwd ? <FiEyeOff size={14} /> : <FiEye size={14} />}</button></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider"> Role *</label>
                                    <select value={form.user_role} onChange={e => setForm({ ...form, user_role: e.target.value })} className="select-field">
                                        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                                    </select>
                                </div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider"> Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="john@example.com" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider"> Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="07XXXXXXXX" /></div>
                                <div className="col-span-2 flex gap-3 justify-end pt-2">
                                    <button onClick={() => { setShowAddUser(false); setEditUser(null); }} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                                    <button onClick={handleSaveUser} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                        {saving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <FiSave size={14} />} {editUser ? 'Update User' : 'Create User'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        {['#', ' Name', ' Username', ' Role', ' Contact', ' Status', ' Actions'].map((h, i) => (
                                            <th key={i} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u, idx) => {
                                        const meta = ROLE_META[u.user_role] || ROLE_META.viewer;
                                        const isSuperAdmin = u.is_super_admin;
                                        return (
                                            <tr key={u.user_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}
                                                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                                <td className="px-4 py-3 text-center font-bold text-gray-400">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                                            style={{ background: isSuperAdmin ? 'linear-gradient(135deg,#f59e0b,#d97706)' : meta.gradient }}>
                                                            {isSuperAdmin ? '' : u.name?.charAt(0)?.toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-800">{u.name}</p>
                                                            {isSuperAdmin && <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">SUPER ADMIN</span>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-gray-600 text-xs">{u.user_name}</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{ background: meta.gradient }}>
                                                        {meta.icon} {u.user_role || 'admin'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">{u.phone || u.email || ''}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${u.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                        {u.active ? ' Active' : ' Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {!isSuperAdmin ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition" title="Edit"><FiEdit2 size={13} /></button>
                                                            {u.active && <button onClick={() => handleDeactivate(u)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition" title="Deactivate"><FiUserX size={13} /></button>}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-amber-600 font-bold"> Protected</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/*  ROLES TAB  */}
            {tab === 'roles' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {roles.map(role => {
                            const meta = ROLE_META[role.role_name] || ROLE_META.viewer;
                            const permCount = Object.entries(PERMISSION_LABELS).filter(([k]) => k !== 'is_super_admin').filter(([k]) => role[k]).length;
                            const isSelected = editingRole === role.role_name;
                            return (
                                <div key={role.role_name} className={`bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all ${isSelected ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100'}`}
                                    onClick={() => setEditingRole(isSelected ? null : role.role_name)}>
                                    <div className="px-4 py-3 flex items-center gap-2 relative overflow-hidden" style={{ background: meta.gradient }}>
                                        <span className="text-lg">{meta.icon}</span>
                                        <div className="flex-1 min-w-0"><p className="font-bold text-white capitalize text-xs">{role.role_name}</p><p className="text-white/60 text-[9px]">{permCount} perms</p></div>
                                    </div>
                                    <div className="p-2.5">
                                        <div className="flex flex-wrap gap-1">
                                            {Object.entries(PERMISSION_LABELS).filter(([k]) => k !== 'is_super_admin').slice(0, 6).map(([k]) => (
                                                <div key={k} className={`w-2 h-2 rounded-full ${role[k] ? 'bg-green-400' : 'bg-gray-200'}`} title={PERMISSION_LABELS[k]} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {editingRole && (() => {
                        const role = roles.find(r => r.role_name === editingRole);
                        if (!role) return null;
                        const meta = ROLE_META[role.role_name] || ROLE_META.viewer;
                        const permCount = Object.entries(PERMISSION_LABELS).filter(([k]) => k !== 'is_super_admin').filter(([k]) => role[k]).length;
                        const isAdminRole = role.role_name === 'admin';
                        return (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 flex items-center justify-between relative overflow-hidden" style={{ background: meta.gradient }}>
                                    <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div><h3 className="text-lg font-bold text-white capitalize">{role.role_name} Permissions</h3><p className="text-white/70 text-xs">{permCount} of {Object.keys(PERMISSION_LABELS).length - 1} enabled</p></div>
                                    </div>
                                    {isAdminRole && !currentUser?.isSuperAdmin && (
                                        <span className="text-xs font-bold text-white/80 bg-white/20 px-3 py-1 rounded-full"> Super Admin only</span>
                                    )}
                                </div>
                                <div className="p-5">
                                    <p className="text-xs text-gray-500 mb-4 italic">{meta.desc}</p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                                            const isSuperAdminPerm = key === 'is_super_admin';
                                            const enabled = role[key];
                                            const isLocked = isSuperAdminPerm || (isAdminRole && !currentUser?.isSuperAdmin);
                                            return (
                                                <button key={key} onClick={() => !isLocked && togglePermission(role.role_name, key, enabled)}
                                                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all ${enabled ? 'bg-green-50 border-green-200 text-green-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-400'} ${isLocked ? 'cursor-default opacity-70' : 'hover:shadow-md cursor-pointer'}`}>
                                                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                                                        {enabled ? <FiCheck size={11} className="text-white" /> : <FiX size={11} className="text-white" />}
                                                    </div>
                                                    <span className="truncate">{label}</span>
                                                    {isLocked && <span className="ml-auto text-[9px]"></span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
