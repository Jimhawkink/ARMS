'use client';

import { isVacationMonth } from '@/lib/supabase';

/**
 * Bill shape — matches the objects returned by getAccumulatedArrearsForTenant.
 */
export interface Bill {
    billing_id: number | null;
    tenant_id: number;
    billing_month: string;   // "YYYY-MM"
    billing_date?: string;
    due_date?: string;
    rent_amount: number;
    amount_paid: number;
    balance: number;
    status?: string;
    notes?: string | null;
    _virtual?: boolean;
}

export interface AccumulatedArrearsResult {
    bills: Bill[];
    arrearsTotal: number;
    currentMonthDue: number;
    totalDue: number;
    arrearsMonths?: string[];
    hasVirtualBills?: boolean;
    virtualMonths?: string[];
}

interface ArrearsBreakdownTableProps {
    arrearsData: AccumulatedArrearsResult;
    selectedMonths: Set<string>;
    onSelectionChange: (months: Set<string>) => void;
    tenantIsOnVacation: boolean;
}

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

function monthLabel(m: string): string {
    try { return new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
    catch { return m; }
}

/**
 * Compute the footer total from a list of bills.
 * Exported for property-based testing (Property 8).
 * Feature: ultra-rent-payment-modal
 * Requirements: 3.7, 4.3
 */
export function computeFooterTotal(bills: Bill[]): number {
    return Math.round(bills.reduce((s, b) => s + (b.balance || 0), 0) * 100) / 100;
}

/**
 * ArrearsBreakdownTable
 *
 * Displays a per-month breakdown of a tenant's unpaid/partially-paid bills.
 * Each row has a checkbox so the user can select which months to pay.
 * Vacation months are flagged with a 🏖️ icon.
 *
 * Feature: ultra-rent-payment-modal
 * Requirements: 3.1–3.8, 4.1–4.3
 */
export default function ArrearsBreakdownTable({
    arrearsData,
    selectedMonths,
    onSelectionChange,
    tenantIsOnVacation,
}: ArrearsBreakdownTableProps) {
    const nowLocal = new Date();
    const currentMonth = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}`;

    const bills = arrearsData.bills.filter(b => b.balance > 0);
    const footerTotal = computeFooterTotal(bills);

    const toggleMonth = (month: string) => {
        const next = new Set(selectedMonths);
        if (next.has(month)) next.delete(month);
        else next.add(month);
        onSelectionChange(next);
    };

    const toggleAll = () => {
        if (selectedMonths.size === bills.length) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(bills.map(b => b.billing_month)));
        }
    };

    if (bills.length === 0) {
        return (
            <div className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-green-50 border border-green-200">
                <span className="text-2xl">✅</span>
                <div>
                    <p className="text-sm font-bold text-green-800">No outstanding balance</p>
                    <p className="text-xs text-green-600 mt-0.5">This tenant is fully paid up.</p>
                </div>
            </div>
        );
    }

    const allSelected = selectedMonths.size === bills.length;
    const someSelected = selectedMonths.size > 0 && !allSelected;

    return (
        <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#faf5ff,#ede9fe)' }}>
                <div className="flex items-center gap-2">
                    <span className="text-base">📋</span>
                    <div>
                        <p className="text-xs font-extrabold text-purple-900">Monthly Arrears Breakdown</p>
                        <p className="text-[10px] text-purple-600 mt-0.5">{bills.length} month{bills.length !== 1 ? 's' : ''} outstanding · Select months to pay</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-purple-500 font-semibold uppercase tracking-wider">Total Due</p>
                    <p className="text-sm font-extrabold text-purple-900">{fmt(footerTotal)}</p>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th className="px-3 py-2.5 text-left w-8">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    ref={el => { if (el) el.indeterminate = someSelected; }}
                                    onChange={toggleAll}
                                    className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                                    title="Select all months"
                                />
                            </th>
                            {['Month', 'Rent Due', 'Paid', 'Balance', ''].map((h, i) => (
                                <th key={i} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {bills.map((bill, idx) => {
                            const isPast = bill.billing_month < currentMonth;
                            const isCurrent = bill.billing_month === currentMonth;
                            const isVac = tenantIsOnVacation && isVacationMonth(bill.billing_month);
                            const isSelected = selectedMonths.has(bill.billing_month);
                            const isPartial = bill.amount_paid > 0 && bill.balance > 0;

                            let rowBg = 'white';
                            if (isSelected) rowBg = '#eef2ff';
                            else if (isPast) rowBg = idx % 2 === 0 ? '#fff7ed' : '#fef3c7';
                            else if (isCurrent) rowBg = '#eff6ff';

                            return (
                                <tr
                                    key={bill.billing_month}
                                    style={{
                                        background: rowBg,
                                        borderBottom: '1px solid #f1f5f9',
                                        borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => toggleMonth(bill.billing_month)}
                                >
                                    {/* Checkbox */}
                                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleMonth(bill.billing_month)}
                                            className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                                        />
                                    </td>

                                    {/* Month */}
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold"
                                                style={
                                                    isPast
                                                        ? { background: '#fee2e2', color: '#b91c1c' }
                                                        : { background: '#dbeafe', color: '#1d4ed8' }
                                                }
                                            >
                                                {isPast ? '⏰' : '🏠'} {monthLabel(bill.billing_month)}
                                            </span>
                                            {bill._virtual && (
                                                <span className="text-[9px] text-gray-400 font-semibold">unbilled</span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Rent Due */}
                                    <td className="px-3 py-2.5">
                                        <span className="text-xs font-semibold text-gray-700">{fmt(bill.rent_amount)}</span>
                                    </td>

                                    {/* Amount Paid */}
                                    <td className="px-3 py-2.5">
                                        {bill.amount_paid > 0 ? (
                                            <span className="text-xs font-semibold text-green-700">{fmt(bill.amount_paid)}</span>
                                        ) : (
                                            <span className="text-[10px] text-gray-300">—</span>
                                        )}
                                    </td>

                                    {/* Balance */}
                                    <td className="px-3 py-2.5">
                                        <span
                                            className="text-xs font-extrabold px-2 py-0.5 rounded-lg"
                                            style={
                                                isSelected
                                                    ? { background: '#e0e7ff', color: '#4338ca' }
                                                    : isPast
                                                        ? { background: '#fee2e2', color: '#b91c1c' }
                                                        : { background: '#dbeafe', color: '#1d4ed8' }
                                            }
                                        >
                                            {fmt(bill.balance)}
                                        </span>
                                        {isPartial && (
                                            <span className="ml-1 text-[9px] text-amber-600 font-bold">partial</span>
                                        )}
                                    </td>

                                    {/* Vacation indicator */}
                                    <td className="px-3 py-2.5 text-center">
                                        {isVac && (
                                            <span title="Vacation month — 50% rent" className="text-sm">🏖️</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>

                    {/* Footer total */}
                    <tfoot>
                        <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                            <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-bold text-gray-600">
                                {selectedMonths.size > 0
                                    ? `Selected (${selectedMonths.size} month${selectedMonths.size !== 1 ? 's' : ''}):`
                                    : 'Total outstanding:'}
                            </td>
                            <td className="px-3 py-2.5">
                                <span className="text-sm font-extrabold text-purple-800">
                                    {selectedMonths.size > 0
                                        ? fmt(bills.filter(b => selectedMonths.has(b.billing_month)).reduce((s, b) => s + b.balance, 0))
                                        : fmt(footerTotal)
                                    }
                                </span>
                            </td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Selection hint */}
            {selectedMonths.size > 0 && (
                <div className="px-4 py-2 border-t border-indigo-100 flex items-center justify-between" style={{ background: '#eef2ff' }}>
                    <span className="text-[11px] text-indigo-700 font-semibold">
                        ✓ {selectedMonths.size} month{selectedMonths.size !== 1 ? 's' : ''} selected for payment
                    </span>
                    <button
                        type="button"
                        onClick={() => onSelectionChange(new Set())}
                        className="text-[11px] text-indigo-500 hover:text-indigo-700 font-bold transition"
                    >
                        Clear selection
                    </button>
                </div>
            )}
        </div>
    );
}
