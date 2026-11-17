'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FiKey, FiLock, FiUnlock, FiEye, FiEyeOff, FiCopy, FiCheck,
    FiSearch, FiFilter, FiRefreshCw, FiPrinter, FiDownload,
    FiShield, FiSmartphone, FiUsers, FiClock, FiAlertCircle,
    FiCheckCircle, FiEdit3, FiSliders, FiFileText
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

    // PIN visibility state: Set of revealed tenant_ids or global reveal
    const [revealedPins, setRevealedPins] = useState<Set<number>>(new Set());
    const [globalReveal, setGlobalReveal] = useState(false);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    // Modal state for changing PIN
    const [editingTenant, setEditingTenant] = useState<TenantPinRecord | null>(null);
    const [newPinInput, setNewPinInput] = useState('');
    const [submittingPin, setSubmittingPin] = useState(false);
    const [pinModalError, setPinModalError] = useState<string | null>(null);
    const [pinModalSuccess, setPinModalSuccess] = useState<string | null>(null);

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
            const matchesSearch =
                !searchQuery ||
                t.tenant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.unit_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.phone.includes(searchQuery) ||
                (t.mobile_pin && t.mobile_pin.includes(searchQuery)) ||
                t.location_name.toLowerCase().includes(searchQuery.toLowerCase());

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
            return (
                a.tenant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                a.unit_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                a.phone.includes(searchQuery) ||
                a.new_pin.includes(searchQuery) ||
                a.old_pin.includes(searchQuery) ||
                a.location_name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        });
    }, [auditLogs, searchQuery]);

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
            // Refresh data in background
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
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-6">
            {/* ── Top Header & Action Controls ── */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                            <FiShield className="w-3.5 h-3.5" /> Enterprise RLS Enforced
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Live Audit Tracking
                        </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                        <FiKey className="text-indigo-400" /> Tenant PIN Management & Security Audit
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">
                        Reveal, audit, configure, and monitor live mobile APK login PINs and tenant self-service PIN changes.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={toggleGlobalReveal}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm ${
                            globalReveal
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                        title="Toggle visibility of all tenant PINs simultaneously"
                    >
                        {globalReveal ? <FiEyeOff className="w-4 h-4 text-amber-400" /> : <FiEye className="w-4 h-4" />}
                        {globalReveal ? 'Mask All PINs' : 'Reveal All PINs'}
                    </button>

                    <button
                        onClick={exportCSV}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <FiDownload className="w-4 h-4 text-indigo-400" /> Export CSV
                    </button>

                    <button
                        onClick={handlePrint}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <FiPrinter className="w-4 h-4 text-slate-400" /> Print Ledger
                    </button>

                    <button
                        onClick={() => fetchData(true)}
                        disabled={refreshing}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                    >
                        <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* ── 4 KPI Summary Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Tenants */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Active Tenants</span>
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <FiUsers className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-white">{metrics.totalTenants}</div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <span className="text-emerald-400 font-bold">100%</span> Active accounts in system
                    </div>
                </div>

                {/* 2. Active Configured PINs */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Configured Login PINs</span>
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <FiKey className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-emerald-400">{metrics.activePinsCount}</div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <FiCheckCircle className="text-emerald-400 w-3.5 h-3.5" /> Can authenticate on Mobile APK
                    </div>
                </div>

                {/* 3. Unset / Missing PINs */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pending / Unset PINs</span>
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <FiLock className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-amber-400">{metrics.missingPinsCount}</div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        {metrics.missingPinsCount > 0 ? (
                            <span className="text-amber-400">Requires 1-click PIN generation</span>
                        ) : (
                            <span className="text-emerald-400">All tenants configured!</span>
                        )}
                    </div>
                </div>

                {/* 4. Total PIN Changes Logged */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Audit Logs</span>
                        <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                            <FiClock className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-purple-400">{metrics.totalAuditLogs}</div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <FiSmartphone className="text-purple-400 w-3.5 h-3.5" /> Mobile self-service events recorded
                    </div>
                </div>
            </div>

            {/* ── Search, Filters & Tab Selection Bar ── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                {/* Dual Tabs */}
                <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800">
                    <button
                        onClick={() => setActiveTab('roster')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'roster'
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <FiKey className="w-3.5 h-3.5" />
                        Tenant PIN Roster ({filteredTenants.length})
                    </button>

                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'audit'
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <FiClock className="w-3.5 h-3.5" />
                        APK Audit Ledger ({filteredAuditLogs.length})
                    </button>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search */}
                    <div className="relative min-w-[240px]">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search tenant, unit, phone, PIN..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>

                    {/* Location Filter */}
                    <select
                        value={locationFilter}
                        onChange={e => setLocationFilter(e.target.value)}
                        className="py-1.5 px-3 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                        <option value="all">All Locations</option>
                        {locationOptions.map(l => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                    </select>

                    {/* Status Filter (Only in Roster view) */}
                    {activeTab === 'roster' && (
                        <select
                            value={pinStatusFilter}
                            onChange={e => setPinStatusFilter(e.target.value as any)}
                            className="py-1.5 px-3 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                        >
                            <option value="all">All PIN Statuses</option>
                            <option value="has_pin">Has Configured PIN</option>
                            <option value="no_pin">Missing / Unset PIN</option>
                        </select>
                    )}
                </div>
            </div>

            {/* ── Tab 1: Tenant PIN Roster (Manage & Reveal) ── */}
            {activeTab === 'roster' && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-bold uppercase tracking-wider">
                                    <th className="py-3.5 px-4">Tenant Name</th>
                                    <th className="py-3.5 px-4">Unit / Room</th>
                                    <th className="py-3.5 px-4">Location</th>
                                    <th className="py-3.5 px-4">Phone Number</th>
                                    <th className="py-3.5 px-4">Current Login PIN</th>
                                    <th className="py-3.5 px-4">Changes Logged</th>
                                    <th className="py-3.5 px-4">Last Updated</th>
                                    <th className="py-3.5 px-4 text-right">Quick Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <FiRefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                                            Loading tenant security profiles...
                                        </td>
                                    </tr>
                                ) : filteredTenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-500">
                                            No matching tenants found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTenants.map(t => {
                                        const isRevealed = globalReveal || revealedPins.has(t.tenant_id);
                                        const isCopied = copiedId === t.tenant_id;

                                        return (
                                            <tr
                                                key={t.tenant_id}
                                                className="hover:bg-slate-800/40 transition-colors group"
                                            >
                                                {/* Tenant Name */}
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-black flex items-center justify-center text-xs">
                                                            {t.tenant_name.slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-white flex items-center gap-1.5">
                                                                {t.tenant_name}
                                                            </div>
                                                            <div className="text-[11px] text-slate-400 font-mono">
                                                                ID: {t.id_number || 'N/A'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Unit */}
                                                <td className="py-3 px-4 font-bold text-slate-200">
                                                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 font-mono text-[11px]">
                                                        {t.unit_name}
                                                    </span>
                                                </td>

                                                {/* Location */}
                                                <td className="py-3 px-4 text-slate-300">
                                                    {t.location_name}
                                                </td>

                                                {/* Phone */}
                                                <td className="py-3 px-4 font-mono text-slate-300">
                                                    {t.phone}
                                                </td>

                                                {/* Current Login PIN with Reveal & Copy */}
                                                <td className="py-3 px-4">
                                                    {t.mobile_pin ? (
                                                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800">
                                                            <span className="font-mono text-sm font-black tracking-widest text-emerald-400 min-w-[55px]">
                                                                {isRevealed ? t.mobile_pin : '••••••'}
                                                            </span>

                                                            {/* Reveal / Mask Single */}
                                                            <button
                                                                onClick={() => toggleReveal(t.tenant_id)}
                                                                className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                                                                title={isRevealed ? 'Mask PIN' : 'Reveal PIN'}
                                                            >
                                                                {isRevealed ? (
                                                                    <FiEyeOff className="w-3.5 h-3.5 text-amber-400" />
                                                                ) : (
                                                                    <FiEye className="w-3.5 h-3.5" />
                                                                )}
                                                            </button>

                                                            {/* 1-Click Copy */}
                                                            <button
                                                                onClick={() => copyPin(t.tenant_id, t.mobile_pin)}
                                                                className="p-1 rounded text-slate-400 hover:text-white transition-colors relative"
                                                                title="Copy PIN to clipboard"
                                                            >
                                                                {isCopied ? (
                                                                    <FiCheck className="w-3.5 h-3.5 text-emerald-400" />
                                                                ) : (
                                                                    <FiCopy className="w-3.5 h-3.5" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[11px]">
                                                            <FiAlertCircle className="w-3 h-3" /> Not Configured
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Changes Logged */}
                                                <td className="py-3 px-4">
                                                    {t.pin_changes_count > 0 ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold text-[11px]">
                                                            {t.pin_changes_count} change{t.pin_changes_count > 1 ? 's' : ''}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-500 text-[11px]">Initial</span>
                                                    )}
                                                </td>

                                                {/* Last Updated */}
                                                <td className="py-3 px-4 text-slate-400 text-[11px]">
                                                    {t.updated_at ? new Date(t.updated_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                                </td>

                                                {/* Actions */}
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => {
                                                                setEditingTenant(t);
                                                                setNewPinInput(t.mobile_pin || '');
                                                                setPinModalError(null);
                                                                setPinModalSuccess(null);
                                                            }}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 transition-all flex items-center gap-1"
                                                        >
                                                            <FiEdit3 className="w-3 h-3" />
                                                            {t.mobile_pin ? 'Change PIN' : 'Set PIN'}
                                                        </button>

                                                        {t.pin_changes_count > 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    setSearchQuery(t.tenant_name);
                                                                    setActiveTab('audit');
                                                                }}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 border border-slate-700 transition-colors"
                                                                title="View full audit log for this tenant"
                                                            >
                                                                <FiClock className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Tab 2: Live PIN Change Audit Ledger (Mobile APK + Web) ── */}
            {activeTab === 'audit' && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
                    <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                        <div>
                            <h2 className="text-sm font-black text-white flex items-center gap-2">
                                <FiSmartphone className="text-purple-400" /> Live Mobile APK & Self-Service PIN Change Audit Trail
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Permanent cryptographic log of every PIN change event, revealing old and new PINs with exact timestamps.
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-bold uppercase tracking-wider">
                                    <th className="py-3.5 px-4">Date & Time</th>
                                    <th className="py-3.5 px-4">Tenant Name</th>
                                    <th className="py-3.5 px-4">Room & Location</th>
                                    <th className="py-3.5 px-4">Phone</th>
                                    <th className="py-3.5 px-4">Previous PIN</th>
                                    <th className="py-3.5 px-4">➡️ Changed New PIN</th>
                                    <th className="py-3.5 px-4">Event Source</th>
                                    <th className="py-3.5 px-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {filteredAuditLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-500">
                                            No PIN change events recorded yet. When a tenant changes their PIN from the Mobile APK, the event will appear here in real-time.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAuditLogs.map(a => (
                                        <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                                            {/* Date */}
                                            <td className="py-3 px-4 font-mono text-slate-300">
                                                {new Date(a.changed_at).toLocaleString('en-KE', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                })}
                                            </td>

                                            {/* Tenant */}
                                            <td className="py-3 px-4 font-bold text-white">
                                                {a.tenant_name}
                                            </td>

                                            {/* Unit & Location */}
                                            <td className="py-3 px-4 text-slate-300">
                                                <span className="font-bold text-slate-200">{a.unit_name}</span>
                                                <span className="text-slate-500 mx-1">•</span>
                                                <span className="text-slate-400">{a.location_name}</span>
                                            </td>

                                            {/* Phone */}
                                            <td className="py-3 px-4 font-mono text-slate-400">
                                                {a.phone}
                                            </td>

                                            {/* Old PIN */}
                                            <td className="py-3 px-4">
                                                <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                                    {a.old_pin}
                                                </span>
                                            </td>

                                            {/* New PIN Prominently Displayed */}
                                            <td className="py-3 px-4">
                                                <span className="font-mono text-sm font-black px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm">
                                                    {a.new_pin}
                                                </span>
                                            </td>

                                            {/* Source */}
                                            <td className="py-3 px-4">
                                                {a.source === 'mobile_apk' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold text-[11px]">
                                                        <FiSmartphone className="w-3 h-3" /> Tenant APK
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[11px]">
                                                        <FiShield className="w-3 h-3" /> Web Admin
                                                    </span>
                                                )}
                                            </td>

                                            {/* Status */}
                                            <td className="py-3 px-4">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[11px]">
                                                    <FiCheckCircle className="w-3 h-3" /> Active & Verified
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Modal: Set / Update Tenant PIN ── */}
            {editingTenant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                            <div>
                                <h3 className="text-lg font-black text-white flex items-center gap-2">
                                    <FiKey className="text-indigo-400" /> Set Tenant Login PIN
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Directly update or regenerate PIN for tenant login.
                                </p>
                            </div>
                            <button
                                onClick={() => setEditingTenant(null)}
                                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Tenant Summary Banner */}
                        <div className="my-4 p-3.5 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                            <div>
                                <div className="text-xs font-bold text-white">{editingTenant.tenant_name}</div>
                                <div className="text-[11px] text-slate-400">
                                    Room: <span className="text-indigo-300 font-bold">{editingTenant.unit_name}</span> • {editingTenant.location_name}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] uppercase font-bold text-slate-500">Current PIN</div>
                                <div className="font-mono font-bold text-xs text-emerald-400">
                                    {editingTenant.mobile_pin || 'Not Configured'}
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleUpdatePinSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                                    New Numeric PIN (4 to 6 Digits)
                                </label>
                                <input
                                    type="text"
                                    maxLength={6}
                                    placeholder="e.g. 874530 or 1234"
                                    value={newPinInput}
                                    onChange={e => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-xl tracking-widest text-emerald-400 text-center placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                                    autoFocus
                                    required
                                />
                            </div>

                            {/* PIN Generator Quick Buttons */}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => generateRandomPin(4)}
                                    className="flex-1 py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all flex items-center justify-center gap-1"
                                >
                                    🎲 Random 4-Digit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => generateRandomPin(6)}
                                    className="flex-1 py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all flex items-center justify-center gap-1"
                                >
                                    🎲 Random 6-Digit
                                </button>
                            </div>

                            {pinModalError && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-medium flex items-center gap-2">
                                    <FiAlertCircle className="w-4 h-4 shrink-0" />
                                    {pinModalError}
                                </div>
                            )}

                            {pinModalSuccess && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-medium flex items-center gap-2">
                                    <FiCheckCircle className="w-4 h-4 shrink-0" />
                                    {pinModalSuccess}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setEditingTenant(null)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingPin || !/^\d{4,6}$/.test(newPinInput.trim())}
                                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                                >
                                    {submittingPin ? 'Saving PIN...' : 'Save & Update PIN'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
