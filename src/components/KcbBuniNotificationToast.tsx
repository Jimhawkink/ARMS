'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getKcbBuniPayments, markPaymentVerified } from '@/lib/supabase';
import { playPaymentSuccessSound } from '@/lib/soundEffects';
import { FiCheck, FiArrowRight, FiCopy, FiClock, FiMapPin } from 'react-icons/fi';
import toast from 'react-hot-toast';

interface KcbToastItem {
    payment_id: number;
    amount: number;
    tenant_name: string;
    unit_name: string;
    location_name: string;
    phone: string;
    receipt: string;
    payment_date: string;
    notes: string;
    is_verified: boolean;
}

const STORAGE_KEY = 'arms_verified_kcb_payments';

function getLocalVerified(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        return new Set(JSON.parse(raw));
    } catch {
        return new Set();
    }
}

function saveLocalVerified(idOrReceipt: string) {
    if (typeof window === 'undefined') return;
    try {
        const set = getLocalVerified();
        set.add(String(idOrReceipt));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch { /* ignore */ }
}

const fmt = (n: number) => `Ksh ${(n || 0).toLocaleString('en-KE')}`;

function formatShortTime(iso: string): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        const todayStr = new Date().toISOString().slice(0, 10);
        const isToday = iso.slice(0, 10) === todayStr;
        const timeStr = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
        if (isToday) return `Today, ${timeStr}`;
        const dateStr = d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short' });
        return `${dateStr}, ${timeStr}`;
    } catch {
        return '';
    }
}

export default function KcbBuniNotificationToast() {
    const router = useRouter();
    const [unverifiedToasts, setUnverifiedToasts] = useState<KcbToastItem[]>([]);
    const [totalUnverifiedCount, setTotalUnverifiedCount] = useState(0);
    const [verifyingId, setVerifyingId] = useState<number | null>(null);
    const [bulkVerifying, setBulkVerifying] = useState(false);
    const knownIdsRef = useRef<Set<number>>(new Set());
    const isFirstRunRef = useRef(true);

    const checkPayments = useCallback(async () => {
        try {
            const rawPayments = await getKcbBuniPayments(50);
            const localVerified = getLocalVerified();
            const now = Date.now();
            // Recent cutoff: payments within the last 48 hours
            const fortyEightHoursAgo = now - 48 * 60 * 60 * 1000;

            const pendingRecent: KcbToastItem[] = [];
            let totalUnverified = 0;

            for (const p of rawPayments) {
                const idStr = String(p.payment_id);
                const receiptStr = String(p.mpesa_receipt || p.reference_no || '');

                const isVerified = p.is_verified ||
                    localVerified.has(idStr) ||
                    (receiptStr && localVerified.has(receiptStr)) ||
                    (p.notes && (p.notes.includes('[VerifiedBy:') || p.notes.includes('[Verified:true]')));

                if (!isVerified) {
                    totalUnverified++;

                    const pTime = new Date(p.payment_date || p.created_at || now).getTime();
                    // Only show pop-up toasts for recent payments (last 48h) to avoid bombarding with months-old records
                    if (pTime >= fortyEightHoursAgo) {
                        const tenant = p.arms_tenants;
                        let unitName = '';
                        if (tenant?.arms_units?.unit_name) {
                            unitName = tenant.arms_units.unit_name;
                        } else if (tenant?.unit_id) {
                            unitName = `Room ${tenant.unit_id}`;
                        }

                        const locationName = p.arms_locations?.location_name || tenant?.arms_locations?.location_name || '';

                        pendingRecent.push({
                            payment_id: p.payment_id,
                            amount: p.amount || 0,
                            tenant_name: tenant?.tenant_name || 'Tenant',
                            unit_name: unitName,
                            location_name: locationName,
                            phone: p.mpesa_phone || tenant?.phone || '',
                            receipt: p.mpesa_receipt || p.reference_no || `KCB-${p.payment_id}`,
                            payment_date: p.payment_date || p.created_at || new Date().toISOString(),
                            notes: p.notes || '',
                            is_verified: false,
                        });
                    }
                }
            }

            // Sound alert for new arrivals
            if (!isFirstRunRef.current && pendingRecent.length > 0) {
                const newArrival = pendingRecent.some(item => !knownIdsRef.current.has(item.payment_id));
                if (newArrival) {
                    playPaymentSuccessSound();
                }
            }
            isFirstRunRef.current = false;
            knownIdsRef.current = new Set(pendingRecent.map(item => item.payment_id));

            setTotalUnverifiedCount(totalUnverified);
            // Cap to at most 3 toasts so they never crowd the screen
            setUnverifiedToasts(pendingRecent.slice(0, 3));
        } catch (err: any) {
            console.error('KcbBuniNotificationToast error:', err.message);
        }
    }, []);

    useEffect(() => {
        checkPayments();
        const interval = setInterval(checkPayments, 15000);
        return () => clearInterval(interval);
    }, [checkPayments]);

    const handleVerify = async (item: KcbToastItem, e: React.MouseEvent) => {
        e.stopPropagation();
        setVerifyingId(item.payment_id);
        try {
            const userStr = typeof window !== 'undefined' ? localStorage.getItem('arms_user') : null;
            const user = userStr ? JSON.parse(userStr) : null;
            const managerName = user?.name || user?.email || 'Manager';

            await markPaymentVerified(item.payment_id, managerName);
            saveLocalVerified(String(item.payment_id));
            if (item.receipt) saveLocalVerified(item.receipt);

            playPaymentSuccessSound();

            toast.success(`Verified: ${item.tenant_name} (${fmt(item.amount)})`, {
                icon: '✅',
                duration: 3000,
            });

            setUnverifiedToasts(prev => prev.filter(t => t.payment_id !== item.payment_id));
            setTotalUnverifiedCount(prev => Math.max(0, prev - 1));
        } catch (err: any) {
            toast.error(`Verification error: ${err.message}`);
        } finally {
            setVerifyingId(null);
        }
    };

    const handleVerifyAll = async () => {
        if (!unverifiedToasts.length) return;
        setBulkVerifying(true);
        try {
            const userStr = typeof window !== 'undefined' ? localStorage.getItem('arms_user') : null;
            const user = userStr ? JSON.parse(userStr) : null;
            const managerName = user?.name || user?.email || 'Manager';

            for (const item of unverifiedToasts) {
                await markPaymentVerified(item.payment_id, managerName);
                saveLocalVerified(String(item.payment_id));
                if (item.receipt) saveLocalVerified(item.receipt);
            }

            playPaymentSuccessSound();
            toast.success(`Verified payments!`, { icon: '🎉' });
            setUnverifiedToasts([]);
            setTotalUnverifiedCount(0);
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setBulkVerifying(false);
        }
    };

    const handleViewTransactions = (receiptCode?: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (receiptCode) {
            router.push(`/dashboard/kcb-transactions?search=${encodeURIComponent(receiptCode)}`);
        } else {
            router.push('/dashboard/kcb-transactions');
        }
    };

    const handleCopy = (text: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            toast.success(`Copied: ${text}`, { duration: 1500 });
        }
    };

    if (unverifiedToasts.length === 0) return null;

    return (
        /* ── Bright Theme Toast Stack: Clean white cards with crisp emerald accents, fixed height items, never squished ── */
        <div
            className="fixed top-4 right-4 z-[999999] flex flex-col gap-2.5 max-w-[340px] w-full max-h-[82vh] overflow-y-auto p-1 pointer-events-auto"
            style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#10b981 #f1f5f9',
            }}
        >
            {/* Top Compact Summary Pill if more than 1 toast */}
            {totalUnverifiedCount > 1 && (
                <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs shadow-md">
                    <span className="font-extrabold text-slate-800 flex items-center gap-1.5 text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                        <span>{totalUnverifiedCount} Unverified KCB Payments</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => handleViewTransactions()}
                            className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline"
                        >
                            Ledger →
                        </button>
                        <button
                            type="button"
                            onClick={handleVerifyAll}
                            disabled={bulkVerifying}
                            className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] transition active:scale-95 disabled:opacity-50"
                        >
                            {bulkVerifying ? '…' : 'Verify All'}
                        </button>
                    </div>
                </div>
            )}

            {/* Individual Bright Clean White Cards with Crisp Emerald Accents */}
            {unverifiedToasts.map((toastItem) => {
                const timeLabel = formatShortTime(toastItem.payment_date);
                const isVerifying = verifyingId === toastItem.payment_id;

                return (
                    <div
                        key={toastItem.payment_id}
                        onClick={() => handleViewTransactions(toastItem.receipt)}
                        className="flex-shrink-0 bg-white/95 backdrop-blur-md rounded-2xl p-3.5 shadow-xl border border-emerald-400/50 hover:border-emerald-500 hover:shadow-2xl transition-all duration-200 cursor-pointer relative overflow-hidden"
                        style={{
                            boxShadow: '0 12px 28px -6px rgba(16, 185, 129, 0.2), 0 4px 12px -2px rgba(0, 0, 0, 0.06)',
                        }}
                    >
                        {/* Left Emerald Accent Border Strip */}
                        <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-gradient-to-b from-emerald-500 to-teal-600" />

                        {/* Top Line: Badge + Receipt Code + Date */}
                        <div className="flex items-center justify-between gap-1.5 pl-1.5 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span>💳</span>
                                    <span>C2B KCB BUNI</span>
                                </span>
                                {timeLabel && (
                                    <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-0.5 truncate">
                                        <FiClock size={9} />
                                        <span>{timeLabel}</span>
                                    </span>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={(e) => handleCopy(toastItem.receipt, e)}
                                title="Click to copy receipt"
                                className="flex items-center gap-1 text-[9px] font-mono font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 transition cursor-pointer flex-shrink-0"
                            >
                                <span>{toastItem.receipt}</span>
                                <FiCopy size={9} className="opacity-70 text-slate-500" />
                            </button>
                        </div>

                        {/* Middle: Amount & Tenant Info */}
                        <div className="pl-1.5">
                            {/* Prominent Amount */}
                            <div className="text-2xl font-black text-slate-900 tracking-tight leading-tight font-sans">
                                {fmt(toastItem.amount)}
                            </div>

                            {/* Tenant Name */}
                            <p className="text-xs font-black text-slate-800 truncate mt-1">
                                From: <span className="text-emerald-700">{toastItem.tenant_name}</span>
                            </p>

                            {/* Unit & Property Location */}
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-semibold truncate">
                                {toastItem.unit_name && (
                                    <span className="bg-slate-100 px-1.5 py-0.2 rounded font-bold text-slate-700">
                                        {toastItem.unit_name}
                                    </span>
                                )}
                                {toastItem.location_name && (
                                    <span className="flex items-center gap-0.5 text-slate-600">
                                        <FiMapPin size={9} className="text-emerald-600" />
                                        <span>{toastItem.location_name}</span>
                                    </span>
                                )}
                                {toastItem.phone && (
                                    <span className="text-slate-400 font-mono text-[9px]">
                                        • {toastItem.phone}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Bottom Action Buttons */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 pl-1.5">
                            <button
                                type="button"
                                onClick={(e) => handleViewTransactions(toastItem.receipt, e)}
                                className="text-[11px] font-black text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition"
                            >
                                <span>View Details</span>
                                <FiArrowRight size={11} />
                            </button>

                            <button
                                type="button"
                                onClick={(e) => handleVerify(toastItem, e)}
                                disabled={isVerifying}
                                className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] shadow-sm hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                                <FiCheck size={12} className="stroke-[3]" />
                                <span>{isVerifying ? 'Verifying…' : 'Verified ✓'}</span>
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
