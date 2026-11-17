'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FiKey, FiLock, FiUnlock, FiEye, FiEyeOff, FiCopy, FiCheck,
    FiSearch, FiFilter, FiRefreshCw, FiPrinter, FiDownload,
    FiShield, FiPhone, FiUsers, FiClock, FiAlertCircle,
    FiCheckCircle, FiEdit3, FiSliders, FiFileText, FiMapPin,
    FiHome, FiChevronLeft, FiChevronRight, FiX
} from 'react-icons/fi';

interface TenantPinRecord {
    tenant_id: number;
    tenant_name: string;
    phone: string;
    id_number: string;
    email: string;
    unit_id: number;
    unit_name: string;
    location_id: number;
    location_name: string;
    monthly_rent: number;
    balance: number;
    mobile_pin: string | null;
    has_pin: boolean;
    updated_at: string;
    pin_changes_count: number;
}

interface PinAuditRecord {
    id: string;
    tenant_id: number;
    tenant_name: string;
    phone: string;
    unit_name: string;
    location_name: string;
    old_pin: string;
    new_pin: string;
    changed_at: string;
    source: 'mobile_apk' | 'web_dashboard' | 'system';
}

interface Metrics {
    totalTenants: number;
    activePinsCount: number;
    missingPinsCount: number;
    totalAuditLogs: number;
}

const PAGE_SIZES = [10, 25, 50, 100];

function formatDateTime(iso: string) {
    if (!iso) return { date: '—', time: '—', full: '—' };
    try {
        const d = new Date(iso);
        const date = d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
        const time = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        return { date, time, full: `${date} at ${time}` };
    } catch {
        return { date: iso, time: '', full: iso };
    }
}

function timeAgo(iso: string) {
    if (!iso) return '';
    try {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    } catch {
        return '';
    }
}

export default function PinManagementPage() {
    const [tenants, setTenants] = useState<TenantPinRecord[]>([]);
    const [auditLogs, setAuditLogs] = useState<PinAuditRecord[]>([]);
    const [metrics, setMetrics] = useState<Metrics>({
        totalTenants: 0,
        activePinsCount: 0,
        missingPinsCount: 0,
        totalAuditLogs: 0,
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'roster' | 'audit'>('roster');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [locationFilter, setLocationFilter] = useState('all');
    const [pinStatusFilter, setPinStatusFilter] = useState<'all' | 'has_pin' | 'no_pin'>('all');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // PIN visibility state
    const [revealedPins, setRevealedPins] = useState<Set<number>>(new Set());
    const [globalReveal, setGlobalReveal] = useState(false);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    // Modal state for changing PIN
    const [editingTenant, setEditingTenant] = useState<TenantPinRecord | null>(null);
    const [newPinInput, setNewPinInput] = useState('');
    const [submittingPin, setSubmittingPin] = useState(false);
    const [pinModalError, setPinModalError] = useState<string | null>(null);
    const [pinModalSuccess, setPinModalSuccess] = useState<string | null>(null);

    // Reset pagination when filters change
    useEffect(() => {
        setPage(1);
    }, [searchQuery, locationFilter, pinStatusFilter, activeTab]);

    // Fetch data
    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const url = locationFilter !== 'all'
                ? `/api/tenants/pin-management?locationId=${locationFilter}`
                : '/api/tenants/pin-management';

            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                setTenants(data.tenants || []);
                setAuditLogs(data.auditLogs || []);
                if (data.metrics) setMetrics(data.metrics);
            }
        } catch (err: any) {
            console.error('Failed to load PIN management data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [locationFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Unique locations for filter dropdown
    const locationOptions = useMemo(() => {
        const map = new Map<number, string>();
        tenants.forEach(t => {
            if (t.location_id && t.location_name) {
                map.set(t.location_id, t.location_name);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [tenants]);

    // Filtered Tenants Roster
    const filteredTenants = useMemo(() => {
        return tenants.filter(t => {
            const q = searchQuery.toLowerCase().trim();
            const matchesSearch =
                !q ||
                t.tenant_name.toLowerCase().includes(q) ||
                t.unit_name.toLowerCase().includes(q) ||
                t.phone.includes(q) ||
                (t.mobile_pin && t.mobile_pin.includes(q)) ||
                t.location_name.toLowerCase().includes(q);

            const matchesStatus =
                pinStatusFilter === 'all' ||
                (pinStatusFilter === 'has_pin' && t.has_pin) ||
                (pinStatusFilter === 'no_pin' && !t.has_pin);

            return matchesSearch && matchesStatus;
        });
    }, [tenants, searchQuery, pinStatusFilter]);

    // Filtered Audit Logs
    const filteredAuditLogs = useMemo(() => {
        return auditLogs.filter(a => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                a.tenant_name.toLowerCase().includes(q) ||
                a.unit_name.toLowerCase().includes(q) ||
                a.phone.includes(q) ||
                a.new_pin.includes(q) ||
                a.old_pin.includes(q) ||
                a.location_name.toLowerCase().includes(q)
            );
        });
    }, [auditLogs, searchQuery]);

    // Pagination calculations
    const totalRosterPages = Math.ceil(filteredTenants.length / pageSize) || 1;
    const paginatedTenants = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredTenants.slice(start, start + pageSize);
    }, [filteredTenants, page, pageSize]);

    const totalAuditPages = Math.ceil(filteredAuditLogs.length / pageSize) || 1;
    const paginatedAuditLogs = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAuditLogs.slice(start, start + pageSize);
    }, [filteredAuditLogs, page, pageSize]);

    // Toggle reveal for single tenant
    const toggleReveal = (tenantId: number) => {
        setRevealedPins(prev => {
            const next = new Set(prev);
            if (next.has(tenantId)) next.delete(tenantId);
            else next.add(tenantId);
            return next;
        });
    };

    // Toggle global reveal
    const toggleGlobalReveal = () => {
        if (globalReveal) {
            setGlobalReveal(false);
            setRevealedPins(new Set());
        } else {
            setGlobalReveal(true);
            const allIds = new Set(tenants.map(t => t.tenant_id));
            setRevealedPins(allIds);
        }
    };

    // 1-Click Copy PIN
    const copyPin = (tenantId: number, pin: string | null) => {
        if (!pin) return;
        navigator.clipboard.writeText(pin);
        setCopiedId(tenantId);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Generate random numeric PIN
    const generateRandomPin = (digits = 4) => {
        const min = Math.pow(10, digits - 1);
        const max = Math.pow(10, digits) - 1;
        const code = Math.floor(min + Math.random() * (max - min + 1));
        setNewPinInput(String(code));
    };

    // Submit PIN update from Web Dashboard
    const handleUpdatePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTenant) return;
        setSubmittingPin(true);
        setPinModalError(null);
        setPinModalSuccess(null);

        try {
            const res = await fetch('/api/tenants/pin-management', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: editingTenant.tenant_id,
                    newPin: newPinInput.trim(),
                    reason: 'Admin Set via Web Dashboard',
                }),
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to update PIN');
            }

            setPinModalSuccess(`PIN successfully updated to ${newPinInput.trim()}!`);
            fetchData(true);
            setTimeout(() => {
                setEditingTenant(null);
                setNewPinInput('');
                setPinModalSuccess(null);
            }, 1200);
        } catch (err: any) {
            setPinModalError(err.message || 'Error updating PIN');
        } finally {
            setSubmittingPin(false);
        }
    };

    // Export CSV
    const exportCSV = () => {
        if (activeTab === 'roster') {
            const headers = ['Tenant ID', 'Tenant Name', 'Room / Unit', 'Location', 'Phone', 'Login PIN', 'Last Updated', 'Changes Logged'];
            const rows = filteredTenants.map(t => [
                t.tenant_id,
                `"${t.tenant_name.replace(/"/g, '""')}"`,
                `"${t.unit_name.replace(/"/g, '""')}"`,
                `"${t.location_name.replace(/"/g, '""')}"`,
                `"${t.phone}"`,
                `"${t.mobile_pin || 'NOT_SET'}"`,
                `"${t.updated_at ? new Date(t.updated_at).toLocaleString() : ''}"`,
                t.pin_changes_count,
            ]);
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tenant-pins-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
        } else {
            const headers = ['Audit ID', 'Date & Time', 'Tenant Name', 'Room', 'Location', 'Phone', 'Old PIN', 'New Changed PIN', 'Source'];
            const rows = filteredAuditLogs.map(a => [
                a.id,
                `"${new Date(a.changed_at).toLocaleString()}"`,
                `"${a.tenant_name.replace(/"/g, '""')}"`,
                `"${a.unit_name.replace(/"/g, '""')}"`,
                `"${a.location_name.replace(/"/g, '""')}"`,
                `"${a.phone}"`,
                `"${a.old_pin}"`,
                `"${a.new_pin}"`,
                a.source,
            ]);
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tenant-pin-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
        }
    };

    // Print
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 pb-12 font-sans">
            {/* ── Top Header Banner (Matching KCB Inflow Ledger) ── */}
            <div className="rounded-3xl p-6 bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white shadow-xl border border-emerald-500/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-3xl shadow-inner">
                        🔐
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl font-black tracking-tight text-white">
                                Tenant PIN & Security Management
                            </h1>
                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 shadow-xs">
                                Live Mobile Credentials
                            </span>
                        </div>
                        <p className="text-xs text-emerald-200/80 mt-1">
                            View, reveal, reset and audit mobile app login PINs and self-service credential changes in real time
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={toggleGlobalReveal}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition active:scale-95 shadow-sm ${
                            globalReveal
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 font-black'
                                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                        }`}
                    >
                        {globalReveal ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                        <span>{globalReveal ? 'Mask All PINs' : 'Reveal All PINs'}</span>
                    </button>

                    <button
                        onClick={exportCSV}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition active:scale-95 shadow-sm"
                    >
                        <FiDownload size={14} />
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition active:scale-95 shadow-sm"
                    >
                        <FiPrinter size={14} />
                        <span>Print</span>
                    </button>

                    <button
                        onClick={() => fetchData(true)}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-lg transition active:scale-95 disabled:opacity-50"
                    >
                        <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* ── KPI Metric Cards (Clean Light Theme) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Total Tenants */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider">Total Tenants</span>
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <FiUsers size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-slate-900 font-mono">
                        {metrics.totalTenants}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        Registered tenant accounts
                    </p>
                </div>

                {/* 2. Active PINs */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider">Active PINs</span>
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <FiCheckCircle size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-emerald-600 font-mono">
                        {metrics.activePinsCount}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        Configured for mobile app login
                    </p>
                </div>

                {/* 3. Missing PINs */}
                <div className={`rounded-2xl p-4 border shadow-xs transition-all ${
                    metrics.missingPinsCount > 0
                        ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/20'
                        : 'bg-white border-slate-200/80'
                }`}>
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                            {metrics.missingPinsCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />}
                            Missing PINs
                        </span>
                        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                            <FiAlertCircle size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-amber-700 font-mono">
                        {metrics.missingPinsCount}
                    </div>
                    <p className="text-[11px] text-amber-800/80 mt-1 font-medium">
                        Require initial PIN setup
                    </p>
                </div>

                {/* 4. Security Events */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider">Audit Records</span>
                        <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                            <FiClock size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-slate-900 font-mono">
                        {metrics.totalAuditLogs}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        Logged security credential changes
                    </p>
                </div>
            </div>

            {/* ── Tab Switcher (Matching Theme) ── */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                    type="button"
                    onClick={() => setActiveTab('roster')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition ${
                        activeTab === 'roster'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                >
                    <FiKey size={14} />
                    <span>Tenant PIN Roster</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        activeTab === 'roster' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                        {filteredTenants.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('audit')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition ${
                        activeTab === 'audit'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                >
                    <FiShield size={14} />
                    <span>Security Audit Ledger</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        activeTab === 'audit' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                        {filteredAuditLogs.length}
                    </span>
                </button>
            </div>

            {/* ── Filter Suite (Matching KCB Inflow Ledger) ── */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <FiFilter size={16} className="text-emerald-600" />
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                            Credential & Tenant Filters
                        </h2>
                        <span className="text-xs text-slate-400 font-semibold">
                            ({activeTab === 'roster' ? filteredTenants.length : filteredAuditLogs.length} matching)
                        </span>
                    </div>

                    {/* Page Size Selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Rows per page:</span>
                        <div className="flex items-center gap-1">
                            {PAGE_SIZES.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => { setPageSize(s); setPage(1); }}
                                    className={`px-2 py-1 rounded-lg text-xs font-bold transition ${
                                        pageSize === s
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Filter Controls Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* 1. Global Search */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiSearch size={11} className="text-emerald-600" />
                            <span>Search (Name, Phone, Unit, PIN)</span>
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search tenant name, phone, room, PIN..."
                                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                            />
                            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <FiX size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 2. Location / Property Filter */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiMapPin size={11} className="text-indigo-600" />
                            <span>Location / Property</span>
                        </label>
                        <select
                            value={locationFilter}
                            onChange={e => setLocationFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="all">🏢 All Properties & Locations</option>
                            {locationOptions.map(loc => (
                                <option key={loc.id} value={String(loc.id)}>
                                    {loc.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 3. PIN Status Filter (for Roster tab) */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiLock size={11} className="text-rose-600" />
                            <span>PIN Status</span>
                        </label>
                        <select
                            value={pinStatusFilter}
                            onChange={e => setPinStatusFilter(e.target.value as any)}
                            disabled={activeTab === 'audit'}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer disabled:opacity-50"
                        >
                            <option value="all">🔑 All PIN Statuses</option>
                            <option value="has_pin">✅ Configured PINs Only</option>
                            <option value="no_pin">⚠️ Missing / Unset PINs</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Table Section (Clean Light Theme) ── */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    {activeTab === 'roster' ? (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="py-3.5 px-4"># Tenant</th>
                                    <th className="py-3.5 px-4">Room & Property</th>
                                    <th className="py-3.5 px-4">Phone Number</th>
                                    <th className="py-3.5 px-4 text-center">Mobile Login PIN</th>
                                    <th className="py-3.5 px-4 text-center">Status</th>
                                    <th className="py-3.5 px-4 text-center">Changes</th>
                                    <th className="py-3.5 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <FiRefreshCw className="animate-spin text-emerald-600 text-2xl" />
                                                <p className="font-bold text-sm text-slate-600">Loading tenant credentials...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedTenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="text-3xl">🔍</span>
                                                <p className="font-bold text-sm text-slate-600">No matching tenants found</p>
                                                <p className="text-xs text-slate-400">Try adjusting your search query or filters above</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedTenants.map((t, idx) => {
                                        const isRevealed = revealedPins.has(t.tenant_id);
                                        const isCopied = copiedId === t.tenant_id;

                                        return (
                                            <tr key={t.tenant_id} className="hover:bg-emerald-50/30 transition-colors">
                                                {/* 1. Tenant Name */}
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center flex-shrink-0">
                                                            {t.tenant_name.slice(0, 1)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-extrabold text-slate-900 truncate max-w-[180px]" title={t.tenant_name}>
                                                                {t.tenant_name}
                                                            </p>
                                                            <span className="text-[10px] text-slate-400 font-mono">
                                                                ID: #{t.tenant_id}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 2. Room & Property */}
                                                <td className="py-3.5 px-4">
                                                    <div className="leading-tight">
                                                        <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 text-[11px]">
                                                            {t.unit_name || `Room ${t.unit_id}`}
                                                        </span>
                                                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                                            <FiMapPin size={10} className="text-slate-400" />
                                                            <span>{t.location_name}</span>
                                                        </p>
                                                    </div>
                                                </td>

                                                {/* 3. Phone */}
                                                <td className="py-3.5 px-4 font-mono">
                                                    <a
                                                        href={`tel:${t.phone}`}
                                                        className="text-slate-700 hover:text-emerald-600 font-bold flex items-center gap-1 transition"
                                                    >
                                                        <FiPhone size={11} className="text-slate-400" />
                                                        <span>{t.phone}</span>
                                                    </a>
                                                </td>

                                                {/* 4. PIN Box */}
                                                <td className="py-3.5 px-4 text-center">
                                                    {t.has_pin ? (
                                                        <div className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200/90 rounded-lg px-2.5 py-1 shadow-2xs">
                                                            <span className="font-mono font-black text-xs text-slate-900 tracking-widest min-w-[50px] text-center">
                                                                {isRevealed ? t.mobile_pin : '••••••'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleReveal(t.tenant_id)}
                                                                className="text-slate-400 hover:text-slate-700 transition"
                                                                title={isRevealed ? 'Hide PIN' : 'Reveal PIN'}
                                                            >
                                                                {isRevealed ? <FiEyeOff size={13} /> : <FiEye size={13} />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyPin(t.tenant_id, t.mobile_pin)}
                                                                className="text-slate-400 hover:text-emerald-600 transition"
                                                                title="Copy PIN"
                                                            >
                                                                {isCopied ? <FiCheck size={13} className="text-emerald-600" /> : <FiCopy size={13} />}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                            No PIN Set
                                                        </span>
                                                    )}
                                                </td>

                                                {/* 5. Status */}
                                                <td className="py-3.5 px-4 text-center">
                                                    {t.has_pin ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                            <FiCheck size={11} className="stroke-[3]" />
                                                            <span>Active</span>
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block" />
                                                            <span>Pending</span>
                                                        </span>
                                                    )}
                                                </td>

                                                {/* 6. Changes count */}
                                                <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-500">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] ${
                                                        t.pin_changes_count > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-400'
                                                    }`}>
                                                        {t.pin_changes_count} {t.pin_changes_count === 1 ? 'event' : 'events'}
                                                    </span>
                                                </td>

                                                {/* 7. Action */}
                                                <td className="py-3.5 px-4 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingTenant(t);
                                                            setNewPinInput(t.mobile_pin || '');
                                                            setPinModalError(null);
                                                            setPinModalSuccess(null);
                                                        }}
                                                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] shadow-xs transition active:scale-95 inline-flex items-center gap-1"
                                                    >
                                                        <FiEdit3 size={11} />
                                                        <span>{t.has_pin ? 'Reset PIN' : 'Set PIN'}</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="py-3.5 px-4">Date & Time</th>
                                    <th className="py-3.5 px-4">Tenant & Room</th>
                                    <th className="py-3.5 px-4">Location</th>
                                    <th className="py-3.5 px-4 text-center">Previous PIN</th>
                                    <th className="py-3.5 px-4 text-center">New Changed PIN</th>
                                    <th className="py-3.5 px-4 text-right">Channel / Source</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <FiRefreshCw className="animate-spin text-emerald-600 text-2xl" />
                                                <p className="font-bold text-sm text-slate-600">Loading audit ledger...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedAuditLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="text-3xl">🛡️</span>
                                                <p className="font-bold text-sm text-slate-600">No security audit records logged</p>
                                                <p className="text-xs text-slate-400">All credential modifications are captured in real-time</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedAuditLogs.map(a => {
                                        const { date, time } = formatDateTime(a.changed_at);
                                        return (
                                            <tr key={a.id} className="hover:bg-emerald-50/30 transition-colors">
                                                <td className="py-3.5 px-4">
                                                    <div className="leading-tight">
                                                        <p className="font-bold text-slate-900">{date}</p>
                                                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                            <span>{time}</span>
                                                            <span className="text-emerald-600 font-semibold">• {timeAgo(a.changed_at)}</span>
                                                        </p>
                                                    </div>
                                                </td>

                                                <td className="py-3.5 px-4">
                                                    <p className="font-extrabold text-slate-900">{a.tenant_name}</p>
                                                    <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded font-bold">
                                                        {a.unit_name}
                                                    </span>
                                                </td>

                                                <td className="py-3.5 px-4 text-slate-600 font-medium">
                                                    <span className="flex items-center gap-1 text-[11px]">
                                                        <FiMapPin size={11} className="text-slate-400" />
                                                        <span>{a.location_name}</span>
                                                    </span>
                                                </td>

                                                <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-500">
                                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                                                        {a.old_pin}
                                                    </span>
                                                </td>

                                                <td className="py-3.5 px-4 text-center font-mono font-extrabold text-emerald-700">
                                                    <span className="bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                                                        {a.new_pin}
                                                    </span>
                                                </td>

                                                <td className="py-3.5 px-4 text-right">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                        a.source === 'mobile_apk'
                                                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                                            : a.source === 'web_dashboard'
                                                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                                                    }`}>
                                                        {a.source === 'mobile_apk' ? '📱 Mobile App' : a.source === 'web_dashboard' ? '💻 Web Admin' : '⚙️ System'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Pagination Footer (Matching KCB Inflow Ledger) ── */}
                <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                    <p className="text-xs text-slate-500 font-medium">
                        Showing Page <b className="text-slate-800">{page}</b> of{' '}
                        <b className="text-slate-800">
                            {activeTab === 'roster' ? totalRosterPages : totalAuditPages}
                        </b>{' '}
                        ({activeTab === 'roster' ? filteredTenants.length : filteredAuditLogs.length} records)
                    </p>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition"
                        >
                            <FiChevronLeft size={16} />
                        </button>

                        {Array.from(
                            { length: Math.min(5, activeTab === 'roster' ? totalRosterPages : totalAuditPages) },
                            (_, i) => {
                                const totalP = activeTab === 'roster' ? totalRosterPages : totalAuditPages;
                                let pNum = i + 1;
                                if (totalP > 5 && page > 3) {
                                    pNum = page - 2 + i;
                                    if (pNum > totalP) pNum = totalP - 4 + i;
                                }
                                return (
                                    <button
                                        key={pNum}
                                        type="button"
                                        onClick={() => setPage(pNum)}
                                        className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                                            page === pNum
                                                ? 'bg-emerald-600 text-white shadow-xs'
                                                : 'border border-slate-200 hover:bg-slate-50 text-slate-700'
                                        }`}
                                    >
                                        {pNum}
                                    </button>
                                );
                            }
                        )}

                        <button
                            type="button"
                            onClick={() => setPage(p => Math.min(activeTab === 'roster' ? totalRosterPages : totalAuditPages, p + 1))}
                            disabled={page >= (activeTab === 'roster' ? totalRosterPages : totalAuditPages)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition"
                        >
                            <FiChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── PIN Configuration Modal (Clean Light Theme) ── */}
            {editingTenant && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                                    <FiKey size={16} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-900 text-sm">
                                        Configure Mobile Login PIN
                                    </h3>
                                    <p className="text-[11px] text-slate-400">
                                        {editingTenant.tenant_name} • {editingTenant.unit_name}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingTenant(null)}
                                className="text-slate-400 hover:text-slate-600 p-1"
                            >
                                <FiX size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdatePinSubmit} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">
                                    New Numeric PIN (4 to 6 digits)
                                </label>
                                <input
                                    type="text"
                                    value={newPinInput}
                                    onChange={e => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="e.g. 1234 or 123456"
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-xl font-mono font-black text-slate-900 tracking-widest focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                                    maxLength={6}
                                    required
                                    autoFocus
                                />
                            </div>

                            {/* Quick Random Generators */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400">Quick Generate:</span>
                                <button
                                    type="button"
                                    onClick={() => generateRandomPin(4)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                                >
                                    Random 4-Digit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => generateRandomPin(6)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                                >
                                    Random 6-Digit
                                </button>
                            </div>

                            {pinModalError && (
                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                                    <FiAlertCircle className="flex-shrink-0" />
                                    <span>{pinModalError}</span>
                                </div>
                            )}

                            {pinModalSuccess && (
                                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                                    <FiCheckCircle className="flex-shrink-0" />
                                    <span>{pinModalSuccess}</span>
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingTenant(null)}
                                    className="w-1/2 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingPin || newPinInput.trim().length < 4}
                                    className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition active:scale-95 disabled:opacity-50"
                                >
                                    {submittingPin ? 'Saving...' : 'Save & Enforce PIN'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
