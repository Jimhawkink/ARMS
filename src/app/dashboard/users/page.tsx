'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    getRolePermissions, updateRolePermissions, getARMSUsers,
    createARMSUser, updateARMSUser, deactivateARMSUser,
    getUserCustomPermissions, updateUserCustomPermissions,
    getARMSUsersWithPermissions,
} from '@/lib/supabase';
import { parseStoredUser } from '@/lib/rbac';
import toast from 'react-hot-toast';
import {
    FiShield, FiCheck, FiX, FiRefreshCw, FiPlus, FiEdit2,
    FiUserX, FiSave, FiEye, FiEyeOff, FiSliders, FiUser,
    FiLock, FiUnlock, FiAlertCircle,
} from 'react-icons/fi';
import { topProgress } from '@/components/TopProgressBar';

const PERMISSION_LABELS: Record<string, { label: string; icon: string; group: string }> = {
    can_view_dashboard:       { label: 'View Dashboard',       icon: '🏠', group: 'Core' },
    can_manage_tenants:       { label: 'Manage Tenants',       icon: '👥', group: 'Property' },
    can_manage_units:         { label: 'Manage Units',         icon: '🏢', group: 'Property' },
    can_record_payments:      { label: 'Record Payments',      icon: '💰', group: 'Finance' },
    can_manage_billing:       { label: 'Manage Billing',       icon: '📄', group: 'Finance' },
    can_view_reports:         { label: 'View Reports',         icon: '📊', group: 'Finance' },
    can_manage_expenses:      { label: 'Manage Expenses',      icon: '💸', group: 'Finance' },
    can_send_sms:             { label: 'Send SMS/WhatsApp',    icon: '💬', group: 'Communication' },
    can_issue_demand_letters: { label: 'Issue Demand Letters', icon: '📮', group: 'Communication' },
    can_manage_utilities:     { label: 'Manage Utilities',     icon: '💧', group: 'Operations' },
    can_manage_caretakers:    { label: 'Manage Caretakers',    icon: '🔧', group: 'Operations' },
    can_manage_checklists:    { label: 'Manage Checklists',    icon: '✅', group: 'Operations' },
    can_manage_users:         { label: 'Manage Users',         icon: '🛡️', group: 'System' },
    can_manage_settings:      { label: 'Manage Settings',      icon: '⚙️', group: 'System' },
};

const PERM_GROUPS = ['Core', 'Property', 'Finance', 'Communication', 'Operations', 'System'];

const ROLE_META: Record<string, { icon: string; gradient: string; color: string; desc: string }> = {
    admin:     { icon: '🛡️', gradient: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#4f46e5', desc: 'Full access. Can manage all modules, users, and settings.' },
    manager:   { icon: '👔', gradient: 'linear-gradient(135deg,#0284c7,#0891b2)', color: '#0284c7', desc: 'Manages tenants, billing, payments. Cannot access Settings, Users, or Licensing.' },
    caretaker: { icon: '🔧', gradient: 'linear-gradient(135deg,#059669,#10b981)', color: '#059669', desc: 'Operational access: tenants, payments, utilities, checklists.' },
    agent:     { icon: '🤝', gradient: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#7c3aed', desc: 'Can manage tenants, billing, payments, SMS, demand letters.' },
    owner:     { icon: '👑', gradient: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#d97706', desc: 'Read-only: reports, dashboard, expenses.' },
    viewer:    { icon: '👁️', gradient: 'linear-gradient(135deg,#6b7280,#9ca3af)', color: '#6b7280', desc: 'Read-only: reports and dashboard only.' },
};

const ROLES = ['admin', 'manager', 'caretaker', 'agent', 'owner', 'viewer'];
const PERM_KEYS = Object.keys(PERMISSION_LABELS);

export default function UsersAccessPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [roles, setRoles] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingRole, setEditingRole] = useState<string | null>(null);
    const [tab, setTab] = useState<'users' | 'roles' | 'menu-perms'>('users');

    // Add/edit user form
    const [showAddUser, setShowAddUser] = useState(false);
    const [editUser, setEditUser] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [showPwd, setShowPwd] = useState(false);
    const [form, setForm] = useState({ user_name: '', password_hash: '', name: '', email: '', phone: '', user_role: 'manager' });

    // Menu permissions per user
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [userPerms, setUserPerms] = useState<Record<string, boolean>>({});
    const [rolePermsForUser, setRolePermsForUser] = useState<Record<string, boolean>>({});
    const [hasCustomPerms, setHasCustomPerms] = useState(false);
    const [savingPerms, setSavingPerms] = useState(false);

    useEffect(() => {
        const raw = localStorage.getItem('arms_user');
        const u = raw ? parseStoredUser(raw) : null;
        if (!u) { router.push('/'); return; }
        if (!u.isSuperAdmin && u.userRole !== 'admin' && !u.permissions?.can_manage_users) {
            toast.error('Access denied'); router.push('/dashboard'); return;
        }
        setCurrentUser(u);
        loadData();
    }, [router]);

    const loadData = useCallback(async () => {
        setLoading(true);
        topProgress.start();
        try {
            const [r, u] = await Promise.all([getRolePermissions(), getARMSUsersWithPermissions()]);
            setRoles(r); setUsers(u);
        } catch (e: any) { toast.error(e.message); } finally { topProgress.done(); }
        setLoading(false);
    }, []);

    // ── Load permissions for selected user ───────────────────
    const loadUserPerms = useCallback(async (userId: number, userRole: string) => {
        try {
            // Get role defaults
            const roleRow = roles.find(r => r.role_name === userRole);
            const defaults: Record<string, boolean> = {};
            for (const k of PERM_KEYS) defaults[k] = roleRow?.[k] === true;
            setRolePermsForUser(defaults);

            // Get custom overrides
            const custom = await getUserCustomPermissions(userId);
            setHasCustomPerms(!!custom);
            // Merge: custom overrides role defaults
            setUserPerms({ ...defaults, ...(custom || {}) });
        } catch (e: any) {
            toast.error('Could not load user permissions');
        }
    }, [roles]);

    const handleSelectUserForPerms = async (u: any) => {
        setSelectedUserId(u.user_id);
        await loadUserPerms(u.user_id, u.user_role || 'admin');
    };

    const toggleUserPerm = (key: string) => {
        setUserPerms(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSaveUserPerms = async () => {
        if (!selectedUserId) return;
        setSavingPerms(true);
        topProgress.start();
        try {
            // Only save keys that differ from role defaults
            const overrides: Record<string, boolean> = {};
            let hasAnyOverride = false;
            for (const k of PERM_KEYS) {
                if (userPerms[k] !== rolePermsForUser[k]) {
                    overrides[k] = userPerms[k];
                    hasAnyOverride = true;
                }
            }
            await updateUserCustomPermissions(selectedUserId, hasAnyOverride ? overrides : null);
            setHasCustomPerms(hasAnyOverride);
            toast.success(hasAnyOverride ? '✅ Custom permissions saved' : '✅ Permissions reset to role defaults');
            loadData();
        } catch (e: any) { toast.error(e.message); } finally {
            topProgress.done(); setSavingPerms(false);
        }
    };

    const handleResetToRoleDefaults = async () => {
        if (!selectedUserId) return;
        if (!confirm('Reset this user to their role default permissions? All custom overrides will be removed.')) return;
        setSavingPerms(true);
        try {
            await updateUserCustomPermissions(selectedUserId, null);
            setUserPerms({ ...rolePermsForUser });
            setHasCustomPerms(false);
            toast.success('✅ Reset to role defaults');
            loadData();
        } catch (e: any) { toast.error(e.message); } finally { setSavingPerms(false); }
    };

    // ── Role permission toggle ────────────────────────────────
    const togglePermission = async (roleName: string, perm: string, current: boolean) => {
        if (roleName === 'admin' && !currentUser?.isSuperAdmin) return toast.error('Only Super Admin can modify admin role');
        try {
            await updateRolePermissions(roleName, { [perm]: !current });
            toast.success(`${PERMISSION_LABELS[perm]?.label} ${!current ? 'enabled' : 'disabled'} for ${roleName}`);
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    // ── User CRUD ─────────────────────────────────────────────
    const handleSaveUser = async () => {
        if (!form.name.trim() || !form.user_name.trim()) return toast.error('Name and username are required');
        if (!editUser && !form.password_hash.trim()) return toast.error('Password is required for new users');
        setSaving(true);
        topProgress.start();
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
        } catch (e: any) { toast.error(e.message); } finally { topProgress.done(); }
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

    const selectedUser = users.find(u => u.user_id === selectedUserId);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>🛡️</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading Access Control</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title">🛡️ Users & Access Control</h1>
                    <p className="text-sm text-gray-500 mt-1">Role-based permissions • {users.filter(u => u.active).length} active users</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={loadData} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition"><FiRefreshCw size={15} /></button>
                    {tab === 'users' && (
                        <button onClick={() => { setShowAddUser(true); setEditUser(null); setForm({ user_name: '', password_hash: '', name: '', email: '', phone: '', user_role: 'manager' }); }}
                            className="btn-primary flex items-center gap-2"><FiPlus size={14} /> Add User</button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {[
                    { k: 'users',      l: '👥 Users' },
                    { k: 'roles',      l: '🛡️ Role Permissions' },
                    { k: 'menu-perms', l: '🔑 Assign Menu Permissions' },
                ].map(t => (
                    <button key={t.k} onClick={() => setTab(t.k as any)}
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === t.k ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t.l}
                    </button>
                ))}
            </div>

            {/* ══════════════════════════════════════════════════════
                TAB: USERS
            ══════════════════════════════════════════════════════ */}
            {tab === 'users' && (
                <div className="space-y-4">
                    {showAddUser && (
                        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                                <FiShield size={18} className="text-white" />
                                <div>
                                    <h3 className="text-sm font-bold text-white">{editUser ? 'Edit User' : 'Add New User'}</h3>
                                    <p className="text-white/60 text-[10px]">All users except Super Admin can be managed here</p>
                                </div>
                                <button onClick={() => { setShowAddUser(false); setEditUser(null); }} className="ml-auto p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={16} /></button>
                            </div>
                            <div className="p-5 grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">👤 Full Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="John Doe" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔤 Username *</label><input value={form.user_name} onChange={e => setForm({ ...form, user_name: e.target.value })} className="input-field" placeholder="johndoe" disabled={!!editUser} /></div>
                                <div className="relative">
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔒 Password {editUser ? '(leave blank to keep)' : '*'}</label>
                                    <input type={showPwd ? 'text' : 'password'} value={form.password_hash} onChange={e => setForm({ ...form, password_hash: e.target.value })} className="input-field pr-10" placeholder={editUser ? 'Leave blank to keep current' : 'Min 8 characters'} />
                                    <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-8 text-gray-400">{showPwd ? <FiEyeOff size={14} /> : <FiEye size={14} />}</button>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🎭 Role *</label>
                                    <select value={form.user_role} onChange={e => setForm({ ...form, user_role: e.target.value })} className="select-field">
                                        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                                    </select>
                                </div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📧 Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="john@example.com" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📱 Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="07XXXXXXXX" /></div>
                                <div className="col-span-2 flex gap-3 justify-end pt-2">
                                    <button onClick={() => { setShowAddUser(false); setEditUser(null); }} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                                    <button onClick={handleSaveUser} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                        <FiSave size={14} /> {editUser ? 'Update User' : 'Create User'}
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
                                        {['#', '👤 Name', '🔤 Username', '🎭 Role', '📱 Contact', '🟢 Status', '⚙️ Actions'].map((h, i) => (
                                            <th key={i} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u, idx) => {
                                        const meta = ROLE_META[u.user_role] || ROLE_META.viewer;
                                        const isSuperAdmin = u.is_super_admin;
                                        const hasCustom = !!u.custom_permissions && Object.keys(u.custom_permissions).length > 0;
                                        return (
                                            <tr key={u.user_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}
                                                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                                <td className="px-4 py-3 text-center font-bold text-gray-400">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                                            style={{ background: isSuperAdmin ? 'linear-gradient(135deg,#f59e0b,#d97706)' : meta.gradient }}>
                                                            {isSuperAdmin ? '👑' : u.name?.charAt(0)?.toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-800">{u.name}</p>
                                                            {isSuperAdmin && <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">SUPER ADMIN</span>}
                                                            {hasCustom && !isSuperAdmin && <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-200 ml-1">Custom Perms</span>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-gray-600 text-xs">{u.user_name}</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{ background: meta.gradient }}>
                                                        {meta.icon} {u.user_role || 'admin'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">{u.phone || u.email || '—'}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${u.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                        {u.active ? '🟢 Active' : '⚫ Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {!isSuperAdmin ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition" title="Edit"><FiEdit2 size={13} /></button>
                                                            <button onClick={() => { setTab('menu-perms'); handleSelectUserForPerms(u); }} className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 transition" title="Assign Menu Permissions"><FiSliders size={13} /></button>
                                                            {u.active && <button onClick={() => handleDeactivate(u)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition" title="Deactivate"><FiUserX size={13} /></button>}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-amber-600 font-bold">🔒 Protected</span>
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

            {/* ══════════════════════════════════════════════════════
                TAB: ROLE PERMISSIONS
            ══════════════════════════════════════════════════════ */}
            {tab === 'roles' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {roles.map(role => {
                            const meta = ROLE_META[role.role_name] || ROLE_META.viewer;
                            const permCount = PERM_KEYS.filter(k => role[k]).length;
                            const isSelected = editingRole === role.role_name;
                            return (
                                <div key={role.role_name}
                                    className={`bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all ${isSelected ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100'}`}
                                    onClick={() => setEditingRole(isSelected ? null : role.role_name)}>
                                    <div className="px-4 py-3 flex items-center gap-2 relative overflow-hidden" style={{ background: meta.gradient }}>
                                        <span className="text-lg">{meta.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-white capitalize text-xs">{role.role_name}</p>
                                            <p className="text-white/60 text-[9px]">{permCount} perms</p>
                                        </div>
                                    </div>
                                    <div className="p-2.5">
                                        <div className="flex flex-wrap gap-1">
                                            {PERM_KEYS.slice(0, 6).map(k => (
                                                <div key={k} className={`w-2 h-2 rounded-full ${role[k] ? 'bg-green-400' : 'bg-gray-200'}`} title={PERMISSION_LABELS[k]?.label} />
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
                        const permCount = PERM_KEYS.filter(k => role[k]).length;
                        const isAdminRole = role.role_name === 'admin';
                        return (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 flex items-center justify-between relative overflow-hidden" style={{ background: meta.gradient }}>
                                    <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div>
                                            <h3 className="text-lg font-bold text-white capitalize">{role.role_name} Permissions</h3>
                                            <p className="text-white/70 text-xs">{permCount} of {PERM_KEYS.length} enabled</p>
                                        </div>
                                    </div>
                                    {isAdminRole && !currentUser?.isSuperAdmin && (
                                        <span className="text-xs font-bold text-white/80 bg-white/20 px-3 py-1 rounded-full">🔒 Super Admin only</span>
                                    )}
                                </div>
                                <div className="p-5">
                                    <p className="text-xs text-gray-500 mb-4 italic">{meta.desc}</p>
                                    {PERM_GROUPS.map(group => {
                                        const groupPerms = PERM_KEYS.filter(k => PERMISSION_LABELS[k]?.group === group);
                                        return (
                                            <div key={group} className="mb-4">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">{group}</p>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                    {groupPerms.map(key => {
                                                        const { label, icon } = PERMISSION_LABELS[key];
                                                        const enabled = role[key];
                                                        const isLocked = isAdminRole && !currentUser?.isSuperAdmin;
                                                        return (
                                                            <button key={key} onClick={() => !isLocked && togglePermission(role.role_name, key, enabled)}
                                                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all ${enabled ? 'bg-green-50 border-green-200 text-green-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-400'} ${isLocked ? 'cursor-default opacity-70' : 'hover:shadow-md cursor-pointer'}`}>
                                                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                                                                    {enabled ? <FiCheck size={11} className="text-white" /> : <FiX size={11} className="text-white" />}
                                                                </div>
                                                                <span className="truncate">{icon} {label}</span>
                                                                {isLocked && <FiLock size={10} className="ml-auto text-amber-400" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB: ASSIGN MENU PERMISSIONS PER USER
            ══════════════════════════════════════════════════════ */}
            {tab === 'menu-perms' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Left: User list */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                            <h3 className="text-sm font-bold text-white">👥 Select User</h3>
                            <p className="text-white/60 text-[10px]">Choose a user to assign menu permissions</p>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {users.filter(u => !u.is_super_admin && u.active).map(u => {
                                const meta = ROLE_META[u.user_role] || ROLE_META.viewer;
                                const hasCustom = !!u.custom_permissions && Object.keys(u.custom_permissions).length > 0;
                                const isSelected = selectedUserId === u.user_id;
                                return (
                                    <button key={u.user_id} onClick={() => handleSelectUserForPerms(u)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'hover:bg-gray-50'}`}>
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                                            style={{ background: meta.gradient }}>
                                            {u.name?.charAt(0)?.toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>{u.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: meta.gradient }}>{meta.icon} {u.user_role}</span>
                                                {hasCustom && <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-200">Custom</span>}
                                            </div>
                                        </div>
                                        {isSelected && <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />}
                                    </button>
                                );
                            })}
                            {users.filter(u => !u.is_super_admin && u.active).length === 0 && (
                                <div className="px-4 py-8 text-center text-gray-400 text-sm">No active users found</div>
                            )}
                        </div>
                    </div>

                    {/* Right: Permission editor */}
                    <div className="lg:col-span-2">
                        {!selectedUserId ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center h-64 gap-3">
                                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: 'linear-gradient(135deg,#f1f5f9,#e2e8f0)' }}>🔑</div>
                                <p className="text-sm font-bold text-gray-500">Select a user to assign menu permissions</p>
                                <p className="text-xs text-gray-400 text-center max-w-xs">Grant or restrict specific menu items for each user, overriding their role defaults.</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                {/* User header */}
                                <div className="px-6 py-4 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                    <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: 'rgba(255,255,255,0.2)' }}>
                                            {selectedUser?.name?.charAt(0)?.toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-white">{selectedUser?.name}</h3>
                                            <p className="text-white/70 text-xs">
                                                Role: <span className="font-bold capitalize">{selectedUser?.user_role}</span>
                                                {hasCustomPerms && <span className="ml-2 bg-yellow-400/30 text-yellow-100 px-2 py-0.5 rounded-full text-[9px] font-bold">⚡ Custom overrides active</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {hasCustomPerms && (
                                            <button onClick={handleResetToRoleDefaults} disabled={savingPerms}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs font-bold hover:bg-white/30 transition">
                                                <FiUnlock size={12} /> Reset to Role
                                            </button>
                                        )}
                                        <button onClick={handleSaveUserPerms} disabled={savingPerms}
                                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white text-indigo-700 text-xs font-bold hover:bg-indigo-50 transition shadow">
                                            <FiSave size={12} /> {savingPerms ? 'Saving...' : 'Save Permissions'}
                                        </button>
                                    </div>
                                </div>

                                {/* Info banner */}
                                <div className="mx-5 mt-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-2">
                                    <FiAlertCircle size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-blue-700">
                                        <span className="font-bold">How it works:</span> Toggle permissions below to override this user&apos;s role defaults.
                                        Green = granted, Gray = denied. Changes only affect this user.
                                        {hasCustomPerms && <span className="ml-1 font-bold text-purple-700"> This user has custom overrides active.</span>}
                                    </p>
                                </div>

                                {/* Permission groups */}
                                <div className="p-5 space-y-5">
                                    {PERM_GROUPS.map(group => {
                                        const groupPerms = PERM_KEYS.filter(k => PERMISSION_LABELS[k]?.group === group);
                                        return (
                                            <div key={group}>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">{group}</p>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                    {groupPerms.map(key => {
                                                        const { label, icon } = PERMISSION_LABELS[key];
                                                        const enabled = userPerms[key] === true;
                                                        const isOverridden = userPerms[key] !== rolePermsForUser[key];
                                                        return (
                                                            <button key={key} onClick={() => toggleUserPerm(key)}
                                                                className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all hover:shadow-md cursor-pointer
                                                                    ${enabled ? 'bg-green-50 border-green-200 text-green-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-400'}
                                                                    ${isOverridden ? 'ring-2 ring-purple-300' : ''}`}>
                                                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                                                                    {enabled ? <FiCheck size={11} className="text-white" /> : <FiX size={11} className="text-white" />}
                                                                </div>
                                                                <span className="truncate flex-1">{icon} {label}</span>
                                                                {isOverridden && (
                                                                    <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-purple-500 border-2 border-white" title="Custom override" />
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Legend */}
                                <div className="px-5 pb-5 flex items-center gap-4 text-[10px] text-gray-400">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-green-400" />
                                        <span>Granted</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-gray-300" />
                                        <span>Denied</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-purple-500 border-2 border-white ring-1 ring-purple-300" />
                                        <span>Custom override (differs from role default)</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
