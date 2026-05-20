'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
    FiShield, FiRefreshCw, FiSearch, FiCheckCircle, FiXCircle,
    FiUsers, FiAlertTriangle, FiX, FiZap,
} from 'react-icons/fi';

interface TenantLicense {
    id: string;
    tenant_id: number;
    phone: string;
    is_active: boolean;
    licensed_at: string;
    last_seen_at: string;
    revoked_at: string | null;
    revoked_reason: string | null;
    // joined
    tenant_name?: string;
    unit_name?: string | null;
    location_name?: string | null;
}

type FilterStatus = 'all' | 'active' | 'revoked';

const fmt = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTime = (d: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    const diff = Date.now() - dt.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return fmt(d);
};

export default function TenantLicensingPage() {
    const router = useRouter();
    const [licenses, setLicenses] = useState<TenantLicense[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [bulkLoading, setBulkLoading] = useState(false);

    // Revoke modal state
    const [revokeModal, setRevokeModal] = useState<{ open: boolean; tenantId: number | null; tenantName: string }>({
        open: false, tenantId: null, tenantName: '',
    });
    const [revokeReason, setRevokeReason] = useState('');
    const [revoking, setRevoking] = useState(false);
    const [reactivating, setReactivating] = useState<number | null>(null);

    // Auth check
    useEffect(() => {
        const user = localStorage.getItem('arms_user');
        if (!user) { router.push('/'); return; }
    }, [router]);

    const fetchLicenses = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/license/tenant-list');
            const data = await res.json();
            if (res.ok) setLicenses(data.licenses || []);
            else toast.error('Failed to load licenses');
        } catch {
            toast.error('Failed to load licenses');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLicenses(); }, [fetchLicenses]);

    const filtered = useMemo(() => {
        let list = [...licenses];
        if (filterStatus === 'active') list = list.filter(l => l.is_active);
        if (filterStatus === 'revoked') list = list.filter(l => !l.is_active);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(l =>
                (l.tenant_name || '').toLowerCase().includes(q) ||
                (l.phone || '').includes(q)
            );
        }
        return list;
    }, [licenses, filterStatus, search]);

    const activeCount = licenses.filter(l => l.is_active).length;
    const revokedCount = licenses.filter(l => !l.is_active).length;

    const handleBulkLicense = async () => {
        setBulkLoading(true);
        try {
            const res = await fetch('/api/license/tenant-bulk-license', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                if (data.licensed === 0) {
                    toast.success('All active tenants are already licensed.');
                } else {
                    toast.success(`✅ ${data.licensed} tenant${data.licensed !== 1 ? 's' : ''} licensed successfully`);
                }
                fetchLicenses();
            } else {
                toast.error(data.error || 'Bulk license failed');
            }
        } catch {
            toast.error('Bulk license failed');
        } finally {
            setBulkLoading(false);
        }
    };

    const openRevokeModal = (tenantId: number, tenantName: string) => {
        setRevokeModal({ open: true, tenantId, tenantName });
        setRevokeReason('');
    };

    const handleRevoke = async () => {
        if (!revokeModal.tenantId || !revokeReason.trim()) {
            toast.error('Please enter a revocation reason');
            return;
        }
        setRevoking(true);
        try {
            const res = await fetch('/api/license/tenant-revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId: revokeModal.tenantId, reason: revokeReason.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`License revoked for ${revokeModal.tenantName}`);
                setRevokeModal({ open: false, tenantId: null, tenantName: '' });
                fetchLicenses();
            } else {
                toast.error(data.error || 'Revoke failed');
            }
        } catch {
            toast.error('Revoke failed');
        } finally {
            setRevoking(false);
        }
    };

    const handleReactivate = async (tenantId: number, tenantName: string) => {
        setReactivating(tenantId);
        try {
            const res = await fetch('/api/license/tenant-reactivate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`License re-activated for ${tenantName}`);
                fetchLicenses();
            } else {
                toast.error(data.error || 'Re-activation failed');
            }
        } catch {
            toast.error('Re-activation failed');
        } finally {
            setReactivating(null);
        }
    };

    return (
        <div className="p-4 lg:p-6 min-h-screen" style={{ background: '#f8fafc' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                        <FiShield className="text-white" size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Tenant Licensing</h1>
                        <p className="text-sm text-gray-500">Manage mobile app access for tenants</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchLicenses}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-sm text-gray-600 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                        <FiRefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={handleBulkLicense}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                        <FiZap size={14} className={bulkLoading ? 'animate-spin' : ''} />
                        {bulkLoading ? 'Licensing...' : 'License All Active Tenants'}
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                    <FiUsers size={20} className="text-indigo-500 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-gray-900">{licenses.length}</div>
                    <div className="text-xs text-gray-500">Total Licensed</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                    <FiCheckCircle size={20} className="text-green-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-green-700">{activeCount}</div>
                    <div className="text-xs text-green-600">Active</div>
                </div>
                <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
                    <FiXCircle size={20} className="text-red-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-red-700">{revokedCount}</div>
                    <div className="text-xs text-red-600">Revoked</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-48">
                    <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name or phone..."
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {(['all', 'active', 'revoked'] as FilterStatus[]).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilterStatus(f)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${filterStatus === f ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Phone</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Unit / Location</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Licensed</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Last Seen</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="text-center py-12 text-gray-400">
                                    <FiRefreshCw size={24} className="animate-spin mx-auto mb-2" />
                                    Loading licenses...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="text-center py-12 text-gray-400">
                                    <FiShield size={32} className="mx-auto mb-2 opacity-30" />
                                    <p>No licenses found</p>
                                    {licenses.length === 0 && (
                                        <p className="text-xs mt-1">Click "License All Active Tenants" to get started</p>
                                    )}
                                </td>
                            </tr>
                        ) : filtered.map(l => (
                            <tr key={l.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900">{l.tenant_name || `Tenant #${l.tenant_id}`}</td>
                                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{l.phone || '—'}</td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                    <div>{l.unit_name || '—'}</div>
                                    <div className="text-gray-400">{l.location_name || ''}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">{fmt(l.licensed_at)}</td>
                                <td className="px-4 py-3 text-gray-500 text-xs">{fmtTime(l.last_seen_at)}</td>
                                <td className="px-4 py-3">
                                    {l.is_active ? (
                                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full w-fit">
                                            <FiCheckCircle size={10} /> Active
                                        </span>
                                    ) : (
                                        <div>
                                            <span className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full w-fit">
                                                <FiXCircle size={10} /> Revoked
                                            </span>
                                            {l.revoked_reason && (
                                                <p className="text-[10px] text-gray-400 mt-0.5 max-w-32 truncate" title={l.revoked_reason}>
                                                    {l.revoked_reason}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {l.is_active ? (
                                        <button
                                            onClick={() => openRevokeModal(l.tenant_id, l.tenant_name || `Tenant #${l.tenant_id}`)}
                                            className="text-xs bg-red-50 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-100 font-medium"
                                        >
                                            Revoke
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleReactivate(l.tenant_id, l.tenant_name || `Tenant #${l.tenant_id}`)}
                                            disabled={reactivating === l.tenant_id}
                                            className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-lg hover:bg-green-100 font-medium disabled:opacity-50"
                                        >
                                            {reactivating === l.tenant_id ? '...' : 'Re-activate'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Revoke Modal */}
            {revokeModal.open && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Revoke License</h2>
                                <p className="text-sm text-gray-500 mt-0.5">{revokeModal.tenantName}</p>
                            </div>
                            <button onClick={() => setRevokeModal({ open: false, tenantId: null, tenantName: '' })} className="text-gray-400 hover:text-gray-600">
                                <FiX size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                                <FiAlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700">
                                    This will immediately block <strong>{revokeModal.tenantName}</strong> from logging into the mobile app.
                                </p>
                            </div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                Reason for revocation *
                            </label>
                            <textarea
                                value={revokeReason}
                                onChange={e => setRevokeReason(e.target.value)}
                                placeholder="e.g. Tenant has vacated, Non-payment of rent..."
                                rows={3}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                            />
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
                            <button
                                onClick={() => setRevokeModal({ open: false, tenantId: null, tenantName: '' })}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRevoke}
                                disabled={revoking || !revokeReason.trim()}
                                className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {revoking ? 'Revoking...' : 'Revoke License'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
