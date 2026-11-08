'use client';

import { calculatePreview } from '@/lib/calculatePreview';
import type { PreviewBill } from '@/lib/calculatePreview';

interface AccumulatedArrearsResult {
    bills: PreviewBill[];
    arrearsTotal: number;
    currentMonthDue: number;
    totalDue: number;
}

interface AllocationPreviewPanelProps {
    amount: number;
    arrearsData: AccumulatedArrearsResult | null;
    selectedMonths: Set<string>;
    penaltyAmount?: number;
    penaltyDays?: number;
}

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

/**
 * AllocationPreviewPanel
 *
 * Displays a real-time preview of how the entered payment amount will be
 * allocated across arrears, current rent, and active late penalties.
 * All values are computed synchronously from props — no async work.
 *
 * Feature: ultra-rent-payment-modal
 * Requirements: 8.1–8.8, 4.4, 4.7
 */
export default function AllocationPreviewPanel({
    amount,
    arrearsData,
    selectedMonths,
    penaltyAmount = 0,
    penaltyDays = 0,
}: AllocationPreviewPanelProps) {
    const nowLocal = new Date();
    const currentMonth = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}`;

    const bills = arrearsData?.bills ?? [];
    const totalDue = arrearsData?.totalDue ?? 0;
    const penaltyOwed = penaltyAmount || 0;
    const effectiveTotalDue = totalDue + penaltyOwed;

    const preview = calculatePreview(amount, bills, selectedMonths, currentMonth, totalDue);

    // Any payment remaining after rent covers late rent penalties
    const penaltyPaid = Math.min(preview.credit, penaltyOwed);
    const finalCredit = Math.max(0, Math.round((preview.credit - penaltyPaid) * 100) / 100);
    const balanceAfter = Math.max(0, Math.round((effectiveTotalDue - amount) * 100) / 100);

    const hasAmount = amount > 0;
    const isOverpayment = finalCredit > 0;
    const hasBalance = balanceAfter > 0;
    const penaltyFullyCleared = penaltyOwed > 0 && penaltyPaid >= penaltyOwed;

    return (
        <div
            className="rounded-2xl border overflow-hidden"
            style={{
                background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                borderColor: '#c4b5fd',
                boxShadow: '0 2px 12px rgba(139,92,246,0.10)',
            }}
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-purple-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <div>
                        <p className="text-xs font-extrabold text-purple-900">Live Allocation Preview</p>
                        <p className="text-[10px] text-purple-600 mt-0.5">
                            {selectedMonths.size > 0
                                ? `Allocating to ${selectedMonths.size} selected month${selectedMonths.size !== 1 ? 's' : ''}`
                                : 'FIFO allocation — arrears first, then rent & penalties'}
                        </p>
                    </div>
                </div>
                {penaltyOwed > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                        ⚡ {penaltyDays}d Penalty: +{fmt(penaltyOwed)}
                    </span>
                )}
            </div>

            {/* Allocation grid */}
            <div className={`px-4 py-3 grid ${penaltyOwed > 0 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} gap-2.5`}>
                {/* Arrears Paid */}
                <div className="bg-white rounded-xl p-2.5 border border-orange-100 shadow-2xs">
                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">⬇ Arrears Paid</p>
                    <p className="text-sm font-extrabold text-orange-700">
                        {hasAmount ? fmt(preview.arrearsPaid) : '—'}
                    </p>
                    <p className="text-[9px] text-gray-400 mt-0.5">Old balances cleared</p>
                </div>

                {/* Current Rent Paid */}
                <div className="bg-white rounded-xl p-2.5 border border-blue-100 shadow-2xs">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">🏠 Current Rent</p>
                    <p className="text-sm font-extrabold text-blue-700">
                        {hasAmount ? fmt(preview.currentRentPaid) : '—'}
                    </p>
                    <p className="text-[9px] text-gray-400 mt-0.5">This month's rent</p>
                </div>

                {/* Late Penalty Paid (if tenant has active penalty) */}
                {penaltyOwed > 0 && (
                    <div className="bg-white rounded-xl p-2.5 border border-rose-100 shadow-2xs">
                        <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-1">⚡ Penalty Cleared</p>
                        <p className="text-sm font-extrabold text-rose-700">
                            {hasAmount ? fmt(penaltyPaid) : '—'}
                        </p>
                        <p className="text-[9px] mt-0.5">
                            {penaltyFullyCleared ? (
                                <span className="text-emerald-700 font-bold">✓ Fully cleared</span>
                            ) : penaltyPaid > 0 ? (
                                <span className="text-amber-700 font-bold">{fmt(penaltyOwed - penaltyPaid)} left</span>
                            ) : (
                                <span className="text-rose-500 font-medium">{fmt(penaltyOwed)} pending</span>
                            )}
                        </p>
                    </div>
                )}

                {/* Balance After */}
                <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-2xs">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">⏳ Balance After</p>
                    {hasAmount ? (
                        hasBalance ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-800">
                                {fmt(balanceAfter)} remaining
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-extrabold bg-green-100 text-green-800">
                                ✓ Fully cleared
                            </span>
                        )
                    ) : (
                        <p className="text-sm font-extrabold text-gray-400">—</p>
                    )}
                </div>

                {/* Credit */}
                <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-2xs">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">💚 Credit</p>
                    {hasAmount && isOverpayment ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-extrabold bg-green-100 text-green-800">
                            +{fmt(finalCredit)} credit
                        </span>
                    ) : (
                        <p className="text-sm font-extrabold text-gray-400">—</p>
                    )}
                    <p className="text-[9px] text-gray-400 mt-0.5">Overpayment</p>
                </div>
            </div>

            {/* Total due row */}
            {effectiveTotalDue > 0 && (
                <div className="px-4 py-2 border-t border-purple-200 flex items-center justify-between text-xs">
                    <span className="text-purple-700 font-bold">
                        {penaltyOwed > 0 ? 'Total Due before payment (Rent + Penalty):' : 'Total outstanding before payment:'}
                    </span>
                    <span className="font-black text-purple-950">{fmt(effectiveTotalDue)}</span>
                </div>
            )}
        </div>
    );
}
