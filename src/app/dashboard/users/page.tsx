'use client';
import { useState, useEffect } from 'react';
import { getRolePermissions, updateRolePermissions } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiShield, FiCheck, FiX } from 'react-icons/fi';

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

const ROLE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
    admin: { bg: 'bg-indigo-50', text: 'text-indigo-600', icon: '👑' },
    caretaker: { bg: 'bg-green-50', text: 'text-green-600', icon: '🧑‍🔧' },
    agent: { bg: 'bg-blue-50', text: 'text-blue-600', icon: '🤝' },
    owner: { bg: 'bg-amber-50', text: 'text-amber-600', icon: '💼' },
    viewer: { bg: 'bg-gray-50', text: 'text-gray-600', icon: '👁️' },
};

export default function UsersAccessPage() {
    const [roles, setRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingRole, setEditingRole] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const r = await getRolePermissions();
            setRoles(r);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const togglePermission = async (roleName: string, perm: string, current: boolean) => {
        try {
            await updateRolePermissions(roleName, { [perm]: !current });
            toast.success(`${perm} ${!current ? 'enabled' : 'disabled'} for ${roleName}`);
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>🔐 Users & Access Control</h1>
                <p className="text-sm text-gray-500 mt-1">Role-based permissions • Limited access per location</p>
            </div>

            <div className="grid grid-cols-5 gap-4">
                {roles.map(role => {
                    const colors = ROLE_COLORS[role.role_name] || ROLE_COLORS.viewer;
                    return (
                        <div key={role.role_name} className={`rounded-2xl p-4 ${colors.bg} border border-gray-100 shadow-sm text-center cursor-pointer hover:shadow-md transition`}
                            onClick={() => setEditingRole(editingRole === role.role_name ? null : role.role_name)}>
                            <span className="text-3xl">{colors.icon}</span>
                            <p className={`font-bold mt-2 capitalize ${colors.text}`}>{role.role_name}</p>
                            <p className="text-xs text-gray-500 mt-1">{Object.entries(PERMISSION_LABELS).filter(([k]) => k !== 'is_super_admin').filter(([k]) => role[k]).length} permissions</p>
                        </div>
                    );
                })}
            </div>

            {editingRole && (() => {
                const role = roles.find(r => r.role_name === editingRole);
                if (!role) return null;
                const colors = ROLE_COLORS[role.role_name] || ROLE_COLORS.viewer;
                return (
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{colors.icon}</span>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 capitalize">{role.role_name} Permissions</h3>
                                <p className="text-xs text-gray-500">Click to toggle each permission</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                                const isSuperAdmin = key === 'is_super_admin';
                                const enabled = role[key];
                                return (
                                    <button key={key} onClick={() => !isSuperAdmin && togglePermission(role.role_name, key, enabled)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-semibold transition ${enabled ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'} ${isSuperAdmin ? 'cursor-default' : 'hover:shadow-sm'}`}>
                                        {enabled ? <FiCheck size={14} className="text-green-600" /> : <FiX size={14} className="text-gray-400" />}
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4">📋 Role Descriptions</h3>
                <div className="space-y-3">
                    {[
                        { role: 'admin', desc: 'Full system access. Can manage all modules, users, and settings. Super admin privileges.', icon: '👑' },
                        { role: 'caretaker', desc: 'Can manage tenants, record payments, send SMS, manage utilities and checklists. No access to reports, settings, or user management.', icon: '🧑‍🔧' },
                        { role: 'agent', desc: 'Can manage tenants, units, billing, payments, SMS, demand letters, expenses, and checklists. Cannot manage users or settings.', icon: '🤝' },
                        { role: 'owner', desc: 'Read-only access to reports, dashboard, and expenses. Ideal for property owners/investors who need visibility without editing.', icon: '💼' },
                        { role: 'viewer', desc: 'Read-only access to reports and dashboard only. Most restricted role.', icon: '👁️' },
                    ].map(r => (
                        <div key={r.role} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                            <span className="text-xl">{r.icon}</span>
                            <div>
                                <p className="font-bold text-gray-800 capitalize">{r.role}</p>
                                <p className="text-xs text-gray-600 mt-0.5">{r.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
