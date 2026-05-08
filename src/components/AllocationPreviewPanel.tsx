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
}

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

/**
 * AllocationPreviewPanel
 *
 * Displays a real-time preview of how the entered payment amount will be
 * allocated across arrears and current rent. All values are computed
 * synchronously from props — no async work.
 *
 * Feature: ultra-rent-payment-modal
 * Requirements: 8.1–8.8, 4.4, 4.7
 */
export default function AllocationPreviewPanel({
    amount,
    arrearsData,
    selectedMonths,
}: AllocationPreviewPanelProps) {
    const nowLocal = new Date();
    const currentMonth = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}`;

    const bills = arrearsData?.bills ?? [];
    const totalDue = arrearsData?.totalDue ?? 0;

    const preview = calculatePreview(amount, bills, selectedMonths, currentMonth, totalDue);

    const hasAmount = amount > 0;
    const isOverpayment = preview.credit > 0;
    const hasBalance = preview.balanceAfter > 0;

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
            <div className="px-4 py-3 border-b border-purple-200 flex items-center gap-2">
                <span className="text-base">⚡</span>
                <div>
                    <p className="text-xs font-extrabold text-purple-900">Live Allocation Preview</p>
                    <p className="text-[10px] text-purple-600 mt-0.5">
                        {selectedMonths.size > 0
                            ? `Allocating to ${selectedMonths.size} selected month${selectedMonths.size !== 1 ? 's' : ''}`
                            : 'FIFO allocation — oldest arrears first'}
                    </p>
                </div>
            </div>

            {/* Allocation grid */}
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
                {/* Arrears Paid */}
                <div className="bg-white rounded-xl p-3 border border-orange-100">
                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">⬇ Arrears Paid</p>
                    <p className="text-sm font-extrabold text-orange-700">
                        {hasAmount ? fmt(preview.arrearsPaid) : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Old balances cleared</p>
                </div>

                {/* Current Rent Paid */}
                <div className="bg-white rounded-xl p-3 border border-blue-100">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">🏠 Current Rent</p>
                    <p className="text-sm font-extrabold text-blue-700">
                        {hasAmount ? fmt(preview.currentRentPaid) : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">This month's rent</p>
                </div>

                {/* Balance After */}
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">⏳ Balance After</p>
                    {hasAmount ? (
                        hasBalance ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-800">
                                {fmt(preview.balanceAfter)} remaining
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
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">💚 Credit</p>
                    {hasAmount && isOverpayment ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-extrabold bg-green-100 text-green-800">
                            +{fmt(preview.credit)} credit
                        </span>
                    ) : (
                        <p className="text-sm font-extrabold text-gray-400">—</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5">Overpayment</p>
                </div>
            </div>

            {/* Total due row */}
            {totalDue > 0 && (
                <div className="px-4 py-2.5 border-t border-purple-200 flex items-center justify-between">
                    <span className="text-[11px] text-purple-700 font-semibold">Total outstanding before payment:</span>
                    <span className="text-xs font-extrabold text-purple-900">{fmt(totalDue)}</span>
                </div>
            )}
        </div>
    );
}
