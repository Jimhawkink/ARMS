'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getKcbBuniPayments, markPaymentVerified } from '@/lib/supabase';
import { playPaymentSuccessSound } from '@/lib/soundEffects';
import { FiCreditCard, FiCheck, FiArrowRight, FiCopy, FiMapPin, FiCalendar, FiClock, FiPhone } from 'react-icons/fi';
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

function formatDateTime(iso: string): { dateStr: string; timeStr: string } {
    if (!iso) return { dateStr: 'Today', timeStr: '' };
    try {
        const d = new Date(iso);
        const dateStr = d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true });
        return { dateStr, timeStr };
    } catch {
        return { dateStr: iso, timeStr: '' };
    }
}

export default function KcbBuniNotificationToast() {
    const router = useRouter();
    const [unverifiedToasts, setUnverifiedToasts] = useState<KcbToastItem[]>([]);
    const [verifyingId, setVerifyingId] = useState<number | null>(null);
    const knownIdsRef = useRef<Set<number>>(new Set());
    const isFirstRunRef = useRef(true);

    const checkPayments = useCallback(async () => {
        try {
            const rawPayments = await getKcbBuniPayments(30);
            const localVerified = getLocalVerified();

            const pendingList: KcbToastItem[] = [];

            for (const p of rawPayments) {
                const idStr = String(p.payment_id);
                const receiptStr = String(p.mpesa_receipt || p.reference_no || '');

                // If already marked verified locally or notes contain [VerifiedBy:
                const isVerified = p.is_verified ||
                    localVerified.has(idStr) ||
                    (receiptStr && localVerified.has(receiptStr)) ||
                    (p.notes && p.notes.includes('[VerifiedBy:'));

                if (!isVerified) {
                    const tenant = p.arms_tenants;
                    const unitName = tenant?.arms_units?.unit_name || tenant?.unit_id ? `Room ${tenant.unit_id}` : 'Room —';
                    const locationName = p.arms_locations?.location_name || tenant?.arms_locations?.location_name || 'Property';

                    pendingList.push({
                        payment_id: p.payment_id,
                        amount: p.amount || 0,
                        tenant_name: tenant?.tenant_name || 'Tenant Payment',
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

            // Detect newly arrived payments to play sound alert
            if (!isFirstRunRef.current && pendingList.length > 0) {
                const newArrival = pendingList.some(item => !knownIdsRef.current.has(item.payment_id));
                if (newArrival) {
                    playPaymentSuccessSound();
                }
            }
            isFirstRunRef.current = false;
            knownIdsRef.current = new Set(pendingList.map(item => item.payment_id));

            setUnverifiedToasts(pendingList.slice(0, 5)); // show up to 5 stacked
        } catch (err: any) {
            console.error('KcbBuniNotificationToast check error:', err.message);
        }
    }, []);

    useEffect(() => {
        checkPayments();
        // Check every 15 seconds so new payments from students APK pop up live
        const interval = setInterval(checkPayments, 15000);
        return () => clearInterval(interval);
    }, [checkPayments]);

    const handleVerify = async (item: KcbToastItem) => {
        setVerifyingId(item.payment_id);
        try {
            const userStr = typeof window !== 'undefined' ? localStorage.getItem('arms_user') : null;
            const user = userStr ? JSON.parse(userStr) : null;
            const managerName = user?.name || user?.email || 'Manager';

            // 1. Mark verified in DB
            await markPaymentVerified(item.payment_id, managerName);

            // 2. Mark verified locally
            saveLocalVerified(String(item.payment_id));
            if (item.receipt) saveLocalVerified(item.receipt);

            // 3. Play sound confirmation
            playPaymentSuccessSound();

            toast.success(`Payment by ${item.tenant_name} (${fmt(item.amount)}) verified!`, {
                icon: '✅',
                duration: 4000,
            });

            // 4. Remove immediately from screen
            setUnverifiedToasts(prev => prev.filter(t => t.payment_id !== item.payment_id));
        } catch (err: any) {
            toast.error(`Verification failed: ${err.message}`);
        } finally {
            setVerifyingId(null);
        }
    };

    const handleViewTransactions = (receiptCode?: string) => {
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
            toast.success(`Copied: ${text}`, { duration: 2000 });
        }
    };

    if (unverifiedToasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[999999] flex flex-col gap-3.5 max-w-[460px] w-full pointer-events-none p-2 sm:p-0">
            {unverifiedToasts.map((toastItem) => {
                const { dateStr, timeStr } = formatDateTime(toastItem.payment_date);
                const isVerifying = verifyingId === toastItem.payment_id;

                return (
                    <div
                        key={toastItem.payment_id}
                        className="pointer-events-auto rounded-3xl p-4 sm:p-5 shadow-2xl transition-all duration-300 animate-slideInRight border border-emerald-400/40 relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #022c22 0%, #064e3b 50%, #047857 100%)',
                            boxShadow: '0 20px 40px -15px rgba(6, 78, 59, 0.7), 0 0 25px 2px rgba(16, 185, 129, 0.25)',
                        }}
                    >
                        {/* Decorative background pulse glow */}
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />

                        {/* Top row: Badge, Receipt code & View link */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 shadow-xs">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                                    C2B KCB BUNI RECEIVED
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={(e) => handleCopy(toastItem.receipt, e)}
                                title="Click to copy receipt"
                                className="flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-300/90 hover:text-white bg-black/20 hover:bg-black/40 px-2 py-0.5 rounded-md border border-emerald-500/20 transition cursor-pointer"
                            >
                                <span>{toastItem.receipt}</span>
                                <FiCopy size={11} className="opacity-70" />
                            </button>
                        </div>

                        {/* Middle row: Big Amount & Actions */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                {/* Amount */}
                                <div className="text-3xl font-black text-white tracking-tight drop-shadow-sm font-sans mb-1">
                                    {fmt(toastItem.amount)}
                                </div>

                                {/* Tenant Name */}
                                <p className="text-sm font-black text-emerald-100 truncate flex items-center gap-1.5">
                                    <span>From:</span>
                                    <span className="text-white underline decoration-emerald-400/40 decoration-1 underline-offset-2">
                                        {toastItem.tenant_name}
                                    </span>
                                </p>

                                {/* Room & Location info */}
                                <div className="flex items-center gap-2 mt-1.5 text-xs text-emerald-200/90 font-semibold flex-wrap">
                                    <span className="bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30 text-emerald-100">
                                        {toastItem.unit_name}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1 text-emerald-200">
                                        <FiMapPin size={11} className="text-emerald-400 flex-shrink-0" />
                                        <span>{toastItem.location_name}</span>
                                    </span>
                                    {toastItem.phone && (
                                        <>
                                            <span>•</span>
                                            <span className="flex items-center gap-1 text-emerald-200 font-mono text-[11px]">
                                                <FiPhone size={10} className="text-emerald-400 flex-shrink-0" />
                                                <span>{toastItem.phone}</span>
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Date & Time */}
                                <div className="flex items-center gap-3 mt-2 text-[11px] text-emerald-300/80 font-medium">
                                    <span className="flex items-center gap-1">
                                        <FiCalendar size={11} className="text-emerald-400" />
                                        <span>{dateStr}</span>
                                    </span>
                                    {timeStr && (
                                        <span className="flex items-center gap-1">
                                            <FiClock size={11} className="text-emerald-400" />
                                            <span>{timeStr}</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Right Action Buttons */}
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                {/* View Transactions Link Button */}
                                <button
                                    type="button"
                                    onClick={() => handleViewTransactions(toastItem.receipt)}
                                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 font-black text-xs shadow-lg shadow-black/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1.5 group cursor-pointer"
                                >
                                    <span>View Details</span>
                                    <FiArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform text-emerald-700" />
                                </button>

                                {/* Verified Button (The key requirement: manager clicks verified, toast disappears!) */}
                                <button
                                    type="button"
                                    onClick={() => handleVerify(toastItem)}
                                    disabled={isVerifying}
                                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                    <FiCheck size={14} className="stroke-[3]" />
                                    <span>{isVerifying ? 'Verifying…' : 'Verified ✓'}</span>
                                </button>
                            </div>
                        </div>

                        {/* Bottom hint banner */}
                        <div className="mt-3 pt-2.5 border-t border-emerald-500/20 flex items-center justify-between text-[10px] text-emerald-300/70">
                            <span>Manager verification required</span>
                            <span className="italic">Will stay on dashboard until verified</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
