# Implementation Plan: Ultra Rent Payment Modal

## Overview

Upgrade the existing "Record Rent Payment" modal in `AlphaPlusApp/arms/src/app/dashboard/payments/page.tsx` with vacation month awareness, a searchable tenant selector, a per-month arrears breakdown table with checkboxes, a real-time allocation preview panel, and a working M-Pesa STK Push integration. All new functionality is additive — existing `recordPayment` FIFO logic, `RentReceipt`, and payment notes format are preserved.

The implementation is split into eight sequential groups: test scaffolding → vacation banner → searchable selector → arrears table → allocation preview → STK push → modal refactor → integration.

## Tasks

- [x] 1. Install fast-check and set up the test file scaffold
  - Add `fast-check` and `vitest` (or `jest` + `@types/jest`) as dev dependencies in `AlphaPlusApp/arms/package.json`
  - Create the directory `AlphaPlusApp/arms/src/__tests__/`
  - Create `AlphaPlusApp/arms/src/__tests__/ultra-rent-payment-modal.test.ts` with imports for `fast-check`, `isVacationMonth`, and `getEffectiveRent` from `@/lib/supabase`, and a stub `calculatePreview` helper (to be replaced in task 5)
  - Configure `vitest.config.ts` (or `jest.config.ts`) at the project root if one does not already exist; set `testEnvironment: 'node'` and path alias `@` → `src`
  - _Requirements: 1.1, 2.4, 8.2_

- [x] 2. Implement and test the `VacationBanner` component
  - [x] 2.1 Create `AlphaPlusApp/arms/src/components/VacationBanner.tsx`
    - Stateless component; renders an amber/yellow gradient banner with 🏖️ icon and text "Vacation Month — Student rent is 50% for tenants on vacation"
    - Uses Tailwind classes consistent with the existing design system
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 2.2 Write property test for vacation banner visibility (Property 1)
    - `// Feature: ultra-rent-payment-modal, Property 1: Vacation banner visibility matches vacation month`
    - Generate arbitrary `YYYY-MM` strings with `fc.string()` constrained to valid month format
    - Assert: banner is shown ↔ month component is in `['05','06','07','08']` using `isVacationMonth`
    - **Property 1: Vacation banner visibility matches vacation month**
    - **Validates: Requirements 1.1, 1.4**

  - [x] 2.3 Add vacation detection and `VacationBanner` to `PaymentsPage`
    - In `PaymentsPage`, compute `const currentMonth = new Date().toISOString().slice(0, 7)` on render
    - Call `isVacationMonth(currentMonth)` and conditionally render `<VacationBanner />` in the page header, below the title/subtitle and above the stat cards
    - Import `isVacationMonth` from `@/lib/supabase` (already exported)
    - _Requirements: 1.1, 1.4_

  - [ ]* 2.4 Write property test for `getEffectiveRent` (Property 2)
    - `// Feature: ultra-rent-payment-modal, Property 2: Effective rent is halved for vacation tenants in vacation months`
    - Generate arbitrary positive `monthlyRent` values (`fc.float({ min: 1, max: 1_000_000 })`) and vacation month strings (`fc.constantFrom('2024-05','2024-06','2024-07','2024-08')`)
    - Assert: `getEffectiveRent(rent, vacationMonth, true) === Math.round(rent * 0.5 * 100) / 100`
    - Also assert: for non-vacation months and/or `isOnVacation = false`, result equals full rent
    - **Property 2: Effective rent is halved for vacation tenants in vacation months**
    - **Validates: Requirements 2.4**

- [x] 3. Implement the `SearchableTenantSelector` component
  - [x] 3.1 Create `AlphaPlusApp/arms/src/components/SearchableTenantSelector.tsx`
    - Props: `{ tenants: Tenant[], selectedTenantId: number | null, onSelect: (id: number | null) => void }`
    - Renders a text input that filters the tenant list client-side by `tenant_name` or `phone` (case-insensitive)
    - Dropdown list shows each tenant as: `{tenant_name} — {unit_name} · {location_name}` with an arrears badge (red/amber pill showing balance) when `balance > 0`
    - Keyboard navigation: `ArrowDown`/`ArrowUp` moves highlight, `Enter` selects, `Escape` closes dropdown
    - On select, calls `onSelect(tenant.tenant_id)` and closes the dropdown
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 3.2 Write property test for tenant search filter (Property 3)
    - `// Feature: ultra-rent-payment-modal, Property 3: Tenant search filter returns only matching tenants`
    - Generate arbitrary tenant arrays and query strings using `fc.array(fc.record({...}))` and `fc.string()`
    - Assert: every item in the filtered result has `tenant_name` or `phone` containing the query (case-insensitive)
    - Assert: no tenant absent from the original list appears in the result
    - **Property 3: Tenant search filter returns only matching tenants**
    - **Validates: Requirements 5.3**

  - [ ]* 3.3 Write property test for tenant selector option display (Property 4)
    - `// Feature: ultra-rent-payment-modal, Property 4: Tenant selector option renders all required display fields`
    - Generate arbitrary tenant objects with `tenant_name`, `arms_units.unit_name`, `arms_locations.location_name`
    - Assert: the rendered option string contains all three values
    - **Property 4: Tenant selector option renders all required display fields**
    - **Validates: Requirements 5.4**

  - [ ]* 3.4 Write property test for arrears badge visibility (Property 5)
    - `// Feature: ultra-rent-payment-modal, Property 5: Arrears badge shown if and only if tenant has outstanding balance`
    - Generate arbitrary tenant objects with `balance: fc.float({ min: -100, max: 100_000 })`
    - Assert: arrears badge is rendered ↔ `balance > 0`
    - **Property 5: Arrears badge shown if and only if tenant has outstanding balance**
    - **Validates: Requirements 5.5**

- [x] 4. Implement the `ArrearsBreakdownTable` component
  - [x] 4.1 Create `AlphaPlusApp/arms/src/components/ArrearsBreakdownTable.tsx`
    - Props: `{ arrearsData: AccumulatedArrearsResult, selectedMonths: Set<string>, onSelectionChange: (months: Set<string>) => void, tenantIsOnVacation: boolean }`
    - Renders a table with columns: ☐ (checkbox), Month, Rent Due, Amount Paid, Balance, 🏖️ (vacation indicator)
    - Checkboxes only shown for rows where `balance > 0` (Unpaid or Partial)
    - Row color coding: amber/red background for past months with balance > 0, light blue for current month
    - 🏖️ icon shown when `isVacationMonth(bill.billing_month) && tenantIsOnVacation`
    - Footer row shows running total of all displayed balances
    - When `arrearsData.bills` is empty, renders "✓ No outstanding balance" message
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2_

  - [ ]* 4.2 Write property test for arrears table footer total (Property 8)
    - `// Feature: ultra-rent-payment-modal, Property 8: Arrears table footer total equals sum of displayed balances`
    - Generate arbitrary arrays of bill objects with `balance: fc.float({ min: 0, max: 100_000 })`
    - Assert: footer total equals `bills.reduce((s, b) => s + b.balance, 0)` rounded to two decimal places
    - **Property 8: Arrears table footer total equals sum of displayed balances**
    - **Validates: Requirements 3.7, 4.3**

- [x] 5. Implement the `AllocationPreviewPanel` component and `calculatePreview` helper
  - [x] 5.1 Create `AlphaPlusApp/arms/src/lib/calculatePreview.ts`
    - Export `calculatePreview(amount: number, bills: Bill[], selectedMonths: Set<string>, currentMonth: string): AllocationPreview`
    - Mirrors the FIFO logic from `recordPayment`: sort bills chronologically, allocate `remaining` to each bill's `balance` in order
    - When `selectedMonths.size > 0`, only allocate to bills whose `billing_month` is in `selectedMonths`
    - Returns `{ arrearsPaid, currentRentPaid, credit: Math.max(0, remaining), balanceAfter: Math.max(0, totalDue - amount) }`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 4.5, 4.6_

  - [ ]* 5.2 Write property test for allocation amount conservation (Property 6)
    - `// Feature: ultra-rent-payment-modal, Property 6: Allocation preview conserves the payment amount`
    - Generate arbitrary `amount` (`fc.float({ min: 0, max: 1_000_000 })`) and bill arrays
    - Assert: `arrearsPaid + currentRentPaid + credit === amount` within ±0.01
    - Assert: `balanceAfter === Math.max(0, totalDue - amount)` and `balanceAfter >= 0`
    - **Property 6: Allocation preview conserves the payment amount**
    - **Validates: Requirements 8.2, 8.4, 8.6, 8.7**

  - [ ]* 5.3 Write property test for selected-month allocation isolation (Property 7)
    - `// Feature: ultra-rent-payment-modal, Property 7: Selected-month allocation only touches selected months`
    - Generate arbitrary amounts, bill arrays, and non-empty `selectedMonths` sets
    - Assert: every bill that receives a non-zero allocation has its `billing_month` in `selectedMonths`
    - **Property 7: Selected-month allocation only touches selected months**
    - **Validates: Requirements 4.6**

  - [x] 5.4 Create `AlphaPlusApp/arms/src/components/AllocationPreviewPanel.tsx`
    - Props: `{ amount: number, arrearsData: AccumulatedArrearsResult | null, selectedMonths: Set<string> }`
    - Calls `calculatePreview` synchronously and renders: Arrears Paid, Current Rent Paid, Credit (green badge when > 0), Balance After (amber badge when > 0)
    - All amounts formatted as `KES {n.toLocaleString()}` (e.g., "KES 15,000")
    - Panel uses a highlighted card style (light indigo/purple background) to stand out
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 8.8_

  - [ ]* 5.5 Write property test for KES currency formatting (Property 10)
    - `// Feature: ultra-rent-payment-modal, Property 10: KES currency formatting matches expected pattern`
    - Generate arbitrary non-negative numbers with `fc.nat({ max: 10_000_000 })`
    - Assert: formatted output matches `/^KES \d{1,3}(,\d{3})*$/`
    - **Property 10: KES currency formatting matches expected pattern**
    - **Validates: Requirements 8.5**

- [x] 6. Implement the `StkPushSection` component
  - [x] 6.1 Create `AlphaPlusApp/arms/src/components/StkPushSection.tsx`
    - Props: `{ tenantId: number | null, amount: string, phone: string, onPhoneChange: (phone: string) => void, onReceiptReceived: (receipt: string) => void, status: 'idle'|'sending'|'pending'|'success'|'failed', error: string | null, onSend: () => void, onRetry: () => void }`
    - Renders phone input (pre-filled from tenant), "Send M-Pesa Payment Prompt" button, and status display
    - Status display: idle → button; sending → spinner + "Sending payment prompt…"; pending → spinner + "Waiting for payment… (checking every 3s)"; success → ✓ green badge + "Payment received! Receipt auto-filled."; failed → ✗ red badge + error + Retry button
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.7, 6.9, 6.10, 6.11_

  - [ ]* 6.2 Write property test for STK Push request payload completeness (Property 9)
    - `// Feature: ultra-rent-payment-modal, Property 9: STK Push request payload contains all required fields`
    - Generate arbitrary valid tenant IDs and positive amounts
    - Assert: the constructed request body object has non-empty `phone`, `amount`, `tenantId`, `accountReference`, `transactionDesc`
    - **Property 9: STK Push request payload contains all required fields**
    - **Validates: Requirements 6.3**

  - [x] 6.3 Implement STK Push send and polling logic in `PaymentModal` (or a custom hook `useStkPush`)
    - Create `AlphaPlusApp/arms/src/hooks/useStkPush.ts`
    - `POST /api/mpesa/stk-push` with `{ phone, amount, tenantId, accountReference: 'ARMS-RENT', transactionDesc: 'Rent Payment - {tenantName}' }`
    - On success (`CheckoutRequestID` present), set status to `'pending'` and start a `setInterval` polling `GET /api/mpesa/stk-push?checkoutRequestId=...` every 3 seconds
    - On poll result `ResultCode === '0'`, set status to `'success'`, extract `mpesa_receipt` from `arms_stk_requests` via Supabase query, call `onReceiptReceived`
    - On poll result `ResultCode !== '0'` (e.g., `'1032'` = cancelled), set status to `'failed'` with `ResultDesc` as error
    - Stop polling after 40 iterations (2 minutes); set status to `'failed'` with message "No response — enter receipt manually"
    - Clear interval on unmount or modal close
    - _Requirements: 6.2, 6.3, 6.8, 6.9, 6.10, 6.11_

- [x] 7. Refactor `PaymentModal` to wire all new components together
  - [x] 7.1 Extract the modal JSX from `PaymentsPage` into a dedicated `PaymentModal` component
    - Create `AlphaPlusApp/arms/src/components/PaymentModal.tsx`
    - Props: `{ isOpen: boolean, onClose: () => void, tenants: Tenant[], locationId: number | null, onPaymentRecorded: () => void }`
    - Move all modal-related state (`payForm`, `tenantArrearData`, `loadingArrears`, `selectedMonths`, `stkStatus`, etc.) into `PaymentModal`
    - Keep `PaymentsPage` responsible only for loading tenants/payments and passing them as props
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6_

  - [x] 7.2 Integrate `SearchableTenantSelector` into `PaymentModal`
    - Replace the existing plain `<select>` for tenant selection with `<SearchableTenantSelector>`
    - On tenant select: auto-populate `mpesaPhone` from `tenant.phone`, fetch arrears via `getAccumulatedArrearsForTenant`, initialize `selectedMonths` to empty set
    - _Requirements: 5.1, 5.2, 5.7, 5.8, 3.1, 3.4_

  - [x] 7.3 Integrate `ArrearsBreakdownTable` into `PaymentModal`
    - Render `<ArrearsBreakdownTable>` below the tenant selector when `arrearsData` is loaded
    - Pass `selectedMonths` state and `onSelectionChange` callback; update `selectedMonths` on checkbox toggle
    - Show loading spinner while `loadingArrears` is true; show fallback message on fetch error
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3_

  - [x] 7.4 Integrate `AllocationPreviewPanel` into `PaymentModal`
    - Render `<AllocationPreviewPanel>` below the amount input, passing `amount`, `arrearsData`, and `selectedMonths`
    - Panel updates in real-time as user types in the amount field or toggles month checkboxes
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 4.4, 4.7_

  - [x] 7.5 Integrate `StkPushSection` and `useStkPush` into `PaymentModal`
    - Replace the existing Jenga STK Push section with `<StkPushSection>` wired to `useStkPush`
    - Add an "M-Pesa STK Push" tab/option in the payment source selector (alongside Cash, M-Pesa manual, Bank Transfer, Cheque)
    - When STK Push succeeds, auto-fill `mpesaReceipt` field and set `paymentMethod` to `'M-Pesa'`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [x] 7.6 Add payment month selector with vacation month indicators to `PaymentModal`
    - Render a `<select>` or custom dropdown for `paymentMonth` (YYYY-MM)
    - For each month option that is a vacation month (05–08), append a 🏖️ icon to the label
    - When selected tenant has `is_on_vacation = true` and selected month is a vacation month, display effective rent (50% of `monthly_rent`) in the UI
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 7.7 Add inline validation and error handling to `PaymentModal`
    - Before calling `recordPayment`, validate: tenant selected, amount entered, amount > 0, phone present when STK Push is active
    - Use `toast.error(...)` for all validation failures and API errors
    - On `recordPayment` failure, keep modal open and show error toast; do not generate receipt
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integration and backward compatibility
  - [x] 9.1 Update `PaymentsPage` to use the new `PaymentModal` component
    - Replace the inline modal JSX in `PaymentsPage` with `<PaymentModal isOpen={showPayModal} onClose={() => setShowPayModal(false)} tenants={tenants} locationId={locationId} onPaymentRecorded={() => loadData(locationId)} />`
    - Ensure `tenants` is still loaded on mount via `getTenants` and filtered to `status === 'Active'`
    - Verify the "Record Payment" button and `openPayModal` function still work correctly
    - _Requirements: 10.7, 10.8_

  - [x] 9.2 Verify backward compatibility of `recordPayment` call signature
    - Confirm `PaymentModal` calls `recordPayment` with the same argument shape as before: `{ tenant_id, amount, payment_method, mpesa_receipt, mpesa_phone, reference_no, notes, recorded_by, location_id }`
    - Confirm notes still include meta tags: `[Month: ...]`, `[Time: ...]`, `[ArrearsPaid: ...]`, `[CurrentRentPaid: ...]`, `[Credit: ...]`
    - Confirm `RentReceipt` is still generated on successful payment with correct props
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 9.3 Verify callback-linked payment flow still works
    - Confirm the M-Pesa C2B callback tab and Jenga IPN tab in the payment source selector still function
    - Confirm `selectCallback` auto-fill logic (phone matching, amount, receipt code) is preserved in the refactored modal
    - _Requirements: 10.8_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- `fast-check` must be installed before any property tests can run (`npm install --save-dev fast-check vitest`)
- The `calculatePreview` helper in task 5.1 is the single source of truth for allocation logic — both `AllocationPreviewPanel` and the property tests import it from `@/lib/calculatePreview`
- The `useStkPush` hook in task 6.3 encapsulates all polling state so `PaymentModal` stays clean
- No new API routes or DB schema changes are required — all infrastructure already exists
- Property tests run a minimum of 100 iterations each (fast-check default)
