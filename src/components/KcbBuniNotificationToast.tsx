'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getKcbBuniPayments, markPaymentVerified } from '@/lib/supabase';
import { playPaymentSuccessSound } from '@/lib/soundEffects';
import { FiCheck, FiCopy } from 'react-icons/fi';
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
        const dateStr = d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short' });
        const timeStr = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
        return `${dateStr}, ${timeStr}`;
    } catch {
        return '';
    }
}

export default function KcbBuniNotificationToast() {
    const router = useRouter();
    const [unverifiedToasts, setUnverifiedToasts] = useState<KcbToastItem[]>([]);
    const [verifyingId, setVerifyingId] = useState<number | null>(null);
    const [bulkVerifying, setBulkVerifying] = useState(false);
    const knownIdsRef = useRef<Set<number>>(new Set());
    const isFirstRunRef = useRef(true);

    const checkPayments = useCallback(async () => {
        try {
            const rawPayments = await getKcbBuniPayments(50);
            const localVerified = getLocalVerified();

            const pendingList: KcbToastItem[] = [];

            for (const p of rawPayments) {
                const idStr = String(p.payment_id);
                const receiptStr = String(p.mpesa_receipt || p.reference_no || '');

                const isVerified = p.is_verified ||
                    localVerified.has(idStr) ||
                    (receiptStr && localVerified.has(receiptStr)) ||
                    (p.notes && (p.notes.includes('[VerifiedBy:') || p.notes.includes('[Verified:true]')));

                if (!isVerified) {
                    const tenant = p.arms_tenants;
                    // Clean unit name - avoids "Room undefined" bug
                    let unitName = '';
                    if (tenant?.arms_units?.unit_name) {
                        unitName = tenant.arms_units.unit_name;
                    } else if (tenant?.unit_id) {
                        unitName = `Room ${tenant.unit_id}`;
                    }

                    const locationName = p.arms_locations?.location_name || tenant?.arms_locations?.location_name || '';

                    pendingList.push({
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

            if (!isFirstRunRef.current && pendingList.length > 0) {
                const newArrival = pendingList.some(item => !knownIdsRef.current.has(item.payment_id));
                if (newArrival) {
                    playPaymentSuccessSound();
                }
            }
            isFirstRunRef.current = false;
            knownIdsRef.current = new Set(pendingList.map(item => item.payment_id));

            setUnverifiedToasts(pendingList);
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
            toast.success(`All ${unverifiedToasts.length} payments verified!`, { icon: '🎉' });
            setUnverifiedToasts([]);
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
        /* ── Scrollable Toast Stack: Fixed on Right, max-height 80vh, smooth scrolling, compact width ── */
        <div
            className="fixed top-3 right-3 z-[999999] flex flex-col gap-2 max-w-[325px] w-full max-h-[80vh] overflow-y-auto p-1 pointer-events-auto"
            style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#00e676 rgba(0, 0, 0, 0.3)',
            }}
        >
            {/* Top Compact Summary Pill if more than 1 toast */}
            {unverifiedToasts.length > 1 && (
                <div className="flex items-center justify-between px-2.5 py-1 rounded-xl bg-slate-950/90 backdrop-blur-md border border-emerald-400/50 text-[10px] text-emerald-300 shadow-xl">
                    <span className="font-black flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                        <span>{unverifiedToasts.length} Unverified Payments</span>
                    </span>
                    <button
                        type="button"
                        onClick={handleVerifyAll}
                        disabled={bulkVerifying}
                        className="px-2 py-0.5 rounded-md bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-[9px] transition active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                        {bulkVerifying ? '…' : 'Verify All'}
                    </button>
                </div>
            )}

            {/* Individual Bright Luminous Cyber Emerald Toast Cards */}
            {unverifiedToasts.map((toastItem) => {
                const timeLabel = formatShortTime(toastItem.payment_date);
                const isVerifying = verifyingId === toastItem.payment_id;

                const metaParts = [
                    toastItem.unit_name || null,
                    toastItem.location_name || null,
                    timeLabel || null,
                ].filter(Boolean).join(' • ');

                return (
                    <div
                        key={toastItem.payment_id}
                        onClick={() => handleViewTransactions(toastItem.receipt)}
                        className="rounded-2xl px-3 py-2.5 shadow-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] border relative overflow-hidden cursor-pointer group"
                        style={{
                            /* Bright Luminous Cyber Emerald Theme (Vibrant AlphaPlus Cyber Emerald) */
                            background: 'linear-gradient(135deg, #059669 0%, #10b981 40%, #00e676 100%)',
                            borderColor: '#a7f3d0',
                            boxShadow: '0 8px 20px -3px rgba(16, 185, 129, 0.5), 0 0 12px rgba(0, 230, 118, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.5)',
                        }}
                    >
                        {/* Top luminous gloss reflection */}
                        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/60 pointer-events-none" />

                        {/* Top Line: Badge + Receipt Code */}
                        <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-4 h-4 rounded-md bg-slate-950/30 flex items-center justify-center text-[10px] text-white flex-shrink-0">
                                    💳
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-950/90 truncate">
                                    C2B KCB BUNI RECEIVED
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={(e) => handleCopy(toastItem.receipt, e)}
                                title="Click to copy receipt"
                                className="flex items-center gap-0.5 text-[9px] font-mono font-black text-slate-950 bg-white/40 hover:bg-white/70 px-1.5 py-0.5 rounded transition cursor-pointer flex-shrink-0 shadow-2xs"
                            >
                                <span>{toastItem.receipt}</span>
                                <FiCopy size={9} className="opacity-70" />
                            </button>
                        </div>

                        {/* Middle & Action Row */}
                        <div className="flex items-center justify-between gap-2">
                            {/* Left Details */}
                            <div className="flex-1 min-w-0">
                                {/* Large Bright Bold Amount */}
                                <div className="text-xl font-black text-slate-950 tracking-tight leading-none font-sans drop-shadow-2xs">
                                    {fmt(toastItem.amount)}
                                </div>

                                {/* Tenant Name */}
                                <p className="text-xs font-black text-white truncate leading-tight mt-1 drop-shadow-sm">
                                    From: <span className="underline decoration-white/60 decoration-1 underline-offset-1">{toastItem.tenant_name}</span>
                                </p>

                                {/* Room • Location • Time */}
                                {metaParts && (
                                    <p className="text-[9px] font-extrabold text-slate-950/80 truncate mt-0.5">
                                        {metaParts}
                                    </p>
                                )}
                            </div>

                            {/* Right Compact Action Buttons */}
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                {/* View button */}
                                <button
                                    type="button"
                                    onClick={(e) => handleViewTransactions(toastItem.receipt, e)}
                                    className="px-2.5 py-0.5 rounded-full bg-slate-950 hover:bg-slate-900 text-white font-black text-[9px] shadow-sm hover:scale-[1.03] active:scale-95 transition-all flex items-center gap-0.5 cursor-pointer"
                                >
                                    <span>View →</span>
                                </button>

                                {/* Verified button */}
                                <button
                                    type="button"
                                    onClick={(e) => handleVerify(toastItem, e)}
                                    disabled={isVerifying}
                                    className="px-2.5 py-0.5 rounded-full bg-white hover:bg-emerald-50 text-emerald-950 font-black text-[9px] shadow-sm hover:scale-[1.03] active:scale-95 transition-all flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                                >
                                    <FiCheck size={10} className="stroke-[3] text-emerald-700" />
                                    <span>{isVerifying ? '…' : 'Verified'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
