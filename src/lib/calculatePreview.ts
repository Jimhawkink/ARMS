/**
 * calculatePreview
 *
 * Pure function that mirrors the FIFO allocation logic from recordPayment.
 * Used by AllocationPreviewPanel for real-time display and by property-based tests.
 *
 * Feature: ultra-rent-payment-modal
 * Requirements: 8.1–8.4, 4.5, 4.6
 */

export interface PreviewBill {
    billing_month: string;  // "YYYY-MM"
    balance: number;
}

export interface AllocationPreview {
    arrearsPaid: number;
    currentRentPaid: number;
    credit: number;
    balanceAfter: number;
    totalDue: number;
}

/**
 * Calculate how a payment amount will be allocated across bills.
 *
 * @param amount        - The payment amount entered by the user (≥ 0)
 * @param bills         - Array of bills with outstanding balance > 0
 * @param selectedMonths - If non-empty, only allocate to bills in this set
 * @param currentMonth  - "YYYY-MM" string for the current month (used to split arrears vs current)
 * @param totalDue      - Total outstanding balance (used to compute balanceAfter)
 *
 * Correctness properties:
 *   Property 6: arrearsPaid + currentRentPaid + credit === amount  (±0.01 float tolerance)
 *   Property 7: when selectedMonths is non-empty, only bills in selectedMonths receive allocation
 */
export function calculatePreview(
    amount: number,
    bills: PreviewBill[],
    selectedMonths: Set<string>,
    currentMonth: string,
    totalDue?: number,
): AllocationPreview {
    // Determine which bills to allocate to
    const billsToAllocate = (
        selectedMonths.size > 0
            ? bills.filter(b => selectedMonths.has(b.billing_month))
            : [...bills]
    ).sort((a, b) => a.billing_month.localeCompare(b.billing_month));

    let remaining = Math.max(0, amount);
    let arrearsPaid = 0;
    let currentRentPaid = 0;

    for (const bill of billsToAllocate) {
        if (remaining <= 0) break;
        const alloc = Math.min(remaining, bill.balance);
        if (bill.billing_month < currentMonth) {
            arrearsPaid += alloc;
        } else {
            currentRentPaid += alloc;
        }
        remaining -= alloc;
    }

    // Round to 2 decimal places to avoid floating-point drift
    arrearsPaid = Math.round(arrearsPaid * 100) / 100;
    currentRentPaid = Math.round(currentRentPaid * 100) / 100;
    const credit = Math.round(Math.max(0, remaining) * 100) / 100;

    // totalDue: use provided value or sum of all bills (not just selected)
    const effectiveTotalDue = totalDue !== undefined
        ? totalDue
        : Math.round(bills.reduce((s, b) => s + b.balance, 0) * 100) / 100;

    const balanceAfter = Math.round(Math.max(0, effectiveTotalDue - amount) * 100) / 100;

    return { arrearsPaid, currentRentPaid, credit, balanceAfter, totalDue: effectiveTotalDue };
}
