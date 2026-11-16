'use client';

import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    FiX, FiPlus, FiDollarSign, FiCalendar, FiFileText,
    FiCheckCircle, FiAlertTriangle, FiTrash2, FiInfo, FiTag
} from 'react-icons/fi';
import SearchableTenantSelector, { TenantOption } from './SearchableTenantSelector';
import {
    addTenantCharge, parseAdjustmentsFromNotes, removeTenantAdjustment,
    TenantAdjustment
} from '@/lib/supabase';

interface AddChargeModalProps {
    isOpen: boolean;
    onClose: () => void;
    tenants: TenantOption[];
    initialTenantId?: number | null;
    onSuccess?: () => void;
}

const CHARGE_CATEGORIES = [
    { label: '💧 Water Bill', value: 'Water' },
    { label: '⚡ Electricity', value: 'Electricity' },
    { label: '🗑️ Garbage Collection', value: 'Garbage' },
    { label: '🔧 Maintenance & Repairs', value: 'Repairs' },
    { label: '👥 Roommate / Comrade Surcharge', value: 'Roommate' },
    { label: '⚖️ Balance Adjustment / Prior Debt', value: 'Balance Adjustment' },
    { label: '🏷️ Other Extra Charge', value: 'Other' },
    { label: '🎁 Credit / Discount (Deduct)', value: 'Credit' },
];

const QUICK_AMOUNTS = [200, 500, 1000, 1500, 2000, 5000];

export default function AddChargeModal({
    isOpen,
    onClose,
    tenants,
    initialTenantId = null,
    onSuccess
}: AddChargeModalProps) {
    const [selectedTenantId, setSelectedTenantId] = useState<number | null>(initialTenantId);
    const [category, setCategory] = useState<string>('Water');
    const [amount, setAmount] = useState<string>('200');
    const [description, setDescription] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [deletingTag, setDeletingTag] = useState<string | null>(null);

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [targetMonth, setTargetMonth] = useState<string>(defaultMonth);

    useEffect(() => {
        if (initialTenantId) {
            setSelectedTenantId(initialTenantId);
        }
    }, [initialTenantId]);

    const selectedTenant = useMemo(() => {
        if (!selectedTenantId) return null;
        return tenants.find(t => t.tenant_id === selectedTenantId) || null;
    }, [tenants, selectedTenantId]);

    const existingAdjustments: TenantAdjustment[] = useMemo(() => {
        if (!selectedTenant) return [];
        // Extract from notes
        return parseAdjustmentsFromNotes((selectedTenant as any).notes);
    }, [selectedTenant]);

    if (!isOpen) return null;

    const numAmount = parseFloat(amount) || 0;
    const finalAmount = category === 'Credit' ? -Math.abs(numAmount) : Math.abs(numAmount);
    const currentBalance = Number(selectedTenant?.balance || 0);
    const calculatedNewBalance = Math.max(0, currentBalance + finalAmount);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenantId) {
            toast.error('Please select a tenant.');
            return;
        }
        if (!numAmount || numAmount <= 0) {
            toast.error('Please enter a valid amount.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await addTenantCharge({
                tenantId: selectedTenantId,
                amount: finalAmount,
                type: category,
                month: targetMonth,
                description: description.trim() || `${category} Charge`,
                recordedBy: 'Admin'
            });

            toast.success(res.message || 'Charge applied successfully!');
            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error adding charge:', err);
            toast.error(err.message || 'Failed to apply charge.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveAdjustment = async (rawTag?: string) => {
        if (!selectedTenantId || !rawTag) return;
        if (!confirm('Are you sure you want to remove this adjustment? The tenant balance will be decreased accordingly.')) return;

        setDeletingTag(rawTag);
        try {
            await removeTenantAdjustment(selectedTenantId, rawTag);
            toast.success('Adjustment removed successfully.');
            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            toast.error(err.message || 'Failed to remove adjustment.');
        } finally {
            setDeletingTag(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
                
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner">
                            <FiPlus className="text-xl" />
                        </div>
                        <div>
                            <h2 className="text-base font-extrabold tracking-tight">Add Charge / Adjust Balance</h2>
                            <p className="text-[11px] text-amber-100 font-medium">Add extra fees (water, repairs, garbage, balance adjustments)</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
                    >
                        <FiX size={16} />
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                    
                    {/* 1. Tenant Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            👤 Select Tenant <span className="text-red-500">*</span>
                        </label>
                        <SearchableTenantSelector
                            tenants={tenants}
                            selectedTenantId={selectedTenantId}
                            onSelect={(id) => setSelectedTenantId(id)}
                            placeholder="Type tenant name, phone, or unit..."
                        />
                    </div>

                    {/* Tenant Info Card (if selected) */}
                    {selectedTenant && (
                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                            <div>
                                <p className="font-extrabold text-slate-900 text-sm">{selectedTenant.tenant_name}</p>
                                <p className="text-slate-500 text-[11px] font-medium mt-0.5">
                                    🏠 {selectedTenant.arms_units?.unit_name || 'Unit'} · {selectedTenant.arms_locations?.location_name || 'Estate'}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Current Balance</span>
                                <span className="text-sm font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                                    KES {Number(selectedTenant.balance || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* 2. Category & Month */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                🏷️ Charge Type
                            </label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                            >
                                {CHARGE_CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                📅 Target Month
                            </label>
                            <input
                                type="month"
                                value={targetMonth}
                                onChange={(e) => setTargetMonth(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                            />
                        </div>
                    </div>

                    {/* 3. Amount & Quick Buttons */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                                💰 Amount (KES) <span className="text-red-500">*</span>
                            </label>
                            <span className="text-[10px] text-slate-400 font-semibold">
                                {category === 'Credit' ? 'Will deduct from balance' : 'Will add to balance'}
                            </span>
                        </div>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                                KES
                            </span>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="e.g. 200"
                                className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                            />
                        </div>

                        {/* Quick Amount Chips */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick:</span>
                            {QUICK_AMOUNTS.map(a => (
                                <button
                                    key={a}
                                    type="button"
                                    onClick={() => setAmount(String(a))}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition border ${
                                        amount === String(a)
                                            ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:bg-amber-50'
                                    }`}
                                >
                                    +{a.toLocaleString()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 4. Description / Reason */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            📝 Note / Reason (Optional)
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Broken window repair, October water bill, extra roommate..."
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                        />
                    </div>

                    {/* 5. Live Calculation Preview Box */}
                    {selectedTenant && numAmount > 0 && (
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 shadow-sm space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-slate-600">
                                <span>Current Tenant Balance:</span>
                                <span className="font-bold text-slate-800">KES {currentBalance.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs font-bold text-amber-700">
                                <span>
                                    {category === 'Credit' ? '➖ Credit / Deduction:' : '➕ Charge to Apply:'}
                                </span>
                                <span>
                                    {finalAmount >= 0 ? '+' : ''}KES {finalAmount.toLocaleString()}
                                </span>
                            </div>
                            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between">
                                <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                                    New Balance After Charge:
                                </span>
                                <span className="text-base font-black text-rose-600 bg-white px-2.5 py-0.5 rounded-xl border border-amber-300 shadow-sm">
                                    KES {calculatedNewBalance.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* 6. Existing Adjustments History for this Tenant */}
                    {existingAdjustments.length > 0 && (
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Existing Adjustments on this Account:
                            </span>
                            <div className="space-y-1.5 max-h-28 overflow-y-auto">
                                {existingAdjustments.map((adj, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
                                        <div className="min-w-0 flex-1 pr-2">
                                            <span className="font-bold text-slate-800">
                                                {adj.amount >= 0 ? '+' : ''}KES {adj.amount.toLocaleString()}
                                            </span>
                                            <span className="text-slate-500 ml-1.5 text-[11px] truncate">
                                                {adj.reason} {adj.month ? `(${adj.month})` : ''}
                                            </span>
                                        </div>
                                        {adj.rawTag && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAdjustment(adj.rawTag)}
                                                disabled={deletingTag === adj.rawTag}
                                                className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 transition"
                                                title="Remove this adjustment"
                                            >
                                                <FiTrash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="pt-2 flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !selectedTenantId || !numAmount}
                            className="flex-2 py-2.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-extrabold shadow-md shadow-amber-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>Applying...</>
                            ) : (
                                <>
                                    <FiCheckCircle size={14} />
                                    Apply {finalAmount >= 0 ? '+' : ''}KES {numAmount.toLocaleString()} Charge
                                </>
                            )}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
