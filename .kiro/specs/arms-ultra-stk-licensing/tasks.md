# Implementation Plan: ARMS Ultra STK Push & Tenant Auto-Licensing

## Overview

Implement two related features: (1) replace the M-Pesa Query API polling with a fast DB-based status endpoint and adaptive polling in `useStkPush.ts`, with improved UI messages and a receipt card; (2) introduce `arms_tenant_licenses`, auto-licensing on first mobile login, admin licensing dashboard, and a full-screen License Gate in the mobile app.

All code is TypeScript. Web app: Next.js 14 App Router at `AlphaPlusApp/arms/`. Mobile app: React Native (Expo) at `AlphaPlusApp/arms/arms-mobile/`. API base URL for mobile: `https://arms-opal.vercel.app`.

---

## Tasks

- [x] 1. Database migration — create `arms_tenant_licenses` table
  - Create `AlphaPlusApp/arms/sql/arms_tenant_licenses_migration.sql`
  - Define `arms_tenant_licenses` with columns: `id` (UUID PK), `tenant_id` (integer FK → `arms_tenants.tenant_id` ON DELETE CASCADE), `phone` (text NOT NULL DEFAULT ''), `is_active` (boolean NOT NULL DEFAULT true), `licensed_at` (timestamptz NOT NULL DEFAULT now()), `last_seen_at` (timestamptz NOT NULL DEFAULT now()), `revoked_at` (nullable timestamptz), `revoked_reason` (nullable text)
  - Add UNIQUE constraint on `tenant_id`
  - Add index on `tenant_id` and index on `phone`
  - Enable RLS; add policy denying all anon access; add policy granting full access to `authenticated` role (service role)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 2. Feature 1 — DB-based STK status endpoint
  - [x] 2.1 Create `GET /api/mpesa/stk-status` route
    - Create `AlphaPlusApp/arms/src/app/api/mpesa/stk-status/route.ts`
    - Accept `checkoutRequestId` query param; return HTTP 400 if missing
    - Query `arms_stk_requests` by `checkout_request_id`; map columns to `{ status, resultCode, resultDesc, mpesaReceipt }`
    - Return `{ status: "Pending", resultCode: null, resultDesc: null, mpesaReceipt: null }` when no record found
    - Return HTTP 500 `{ error: "Status check failed" }` on DB error
    - Do NOT make any outbound M-Pesa API call
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

  - [ ]* 2.2 Write property test for STK status response shape (Property 1)
    - **Property 1: STK Status Response Shape**
    - Use `fast-check` to generate random `arms_stk_requests` rows with arbitrary status/resultCode/resultDesc/mpesaReceipt values
    - Verify response always contains all four fields matching DB values exactly
    - File: `AlphaPlusApp/arms/src/__tests__/api/mpesa/stk-status.test.ts`
    - **Validates: Requirements 1.2**

- [ ] 3. Feature 1 — Adaptive polling in `useStkPush.ts`
  - [x] 3.1 Rewrite polling logic with `setTimeout` chains and new `stk-status` endpoint
    - Modify `AlphaPlusApp/arms/src/hooks/useStkPush.ts`
    - Replace `setInterval` with chained `setTimeout` calls
    - Add constants: `FAST_INTERVAL_MS = 1500`, `SLOW_INTERVAL_MS = 3000`, `FAST_PHASE_DURATION_MS = 20000`, `MAX_POLL_DURATION_MS = 120000`
    - Poll `GET /api/mpesa/stk-status?checkoutRequestId=...` (not the old M-Pesa Query endpoint)
    - Switch from 1500 ms to 3000 ms after 20 s elapsed
    - Stop polling when status is not `"Pending"`
    - Transition to `failed` with timeout message after 120 s
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Map ResultCodes to correct states and messages
    - In the polling callback, map `resultCode`:
      - `0` → `success`, call `onReceiptReceived(mpesaReceipt ?? '')`
      - `1032` → `failed`, error: `"❌ Payment Cancelled — You cancelled the M-Pesa prompt. Tap Retry to try again."`
      - `1037` → `failed`, error: `"💸 Insufficient M-Pesa Balance — Please top up your M-Pesa and try again."`
      - other non-zero → `failed`, error: `resultDesc` or `"Payment failed (code X)"`
      - timeout → `failed`, error: `"⏱ No response from M-Pesa — Did you see a prompt on your phone? You can enter the receipt manually below."`
    - _Requirements: 3.1, 4.1, 5.1, 5.7, 6.1_

  - [ ]* 3.3 Write property test for adaptive polling interval (Property 2)
    - **Property 2: Adaptive Polling Interval**
    - Use `fast-check` to generate random elapsed times; verify interval is 1500 ms when `t ≤ 20000`, 3000 ms when `t > 20000`
    - File: `AlphaPlusApp/arms/src/__tests__/hooks/useStkPush.test.ts`
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 3.4 Write property test for polling stops on non-Pending status (Property 3)
    - **Property 3: Polling Stops on Non-Pending Status**
    - Use `fast-check` to generate random non-Pending status strings; verify no further poll is scheduled after receiving them
    - File: `AlphaPlusApp/arms/src/__tests__/hooks/useStkPush.test.ts`
    - **Validates: Requirements 2.4**

  - [ ]* 3.5 Write property test for ResultCode to state mapping (Property 4)
    - **Property 4: ResultCode to State Mapping**
    - Use `fast-check` to generate arbitrary result codes; verify hook transitions to correct state and message for each
    - File: `AlphaPlusApp/arms/src/__tests__/hooks/useStkPush.test.ts`
    - **Validates: Requirements 3.1, 4.1**

  - [ ]* 3.6 Write property test for receipt round-trip (Property 5)
    - **Property 5: Receipt Round-Trip**
    - Use `fast-check` to generate random alphanumeric receipt strings; verify `onReceiptReceived` is called with the exact same string unchanged
    - File: `AlphaPlusApp/arms/src/__tests__/hooks/useStkPush.test.ts`
    - **Validates: Requirements 5.1**

- [ ] 4. Feature 1 — Update `StkPushSection.tsx` with ReceiptCard and improved messages
  - [x] 4.1 Add `ReceiptCard` sub-component and update pending message
    - Modify `AlphaPlusApp/arms/src/components/StkPushSection.tsx`
    - Add `ReceiptCard` sub-component: green-themed card, receipt code in monospace/bold, copy-to-clipboard button using `navigator.clipboard.writeText`, "Copied!" confirmation visible for 1500 ms
    - Render `ReceiptCard` when `status === 'success'` and a receipt code is available (pass receipt as prop or read from parent)
    - Update `pending` status message to: `"Checking every 1.5s · Tenant should see a prompt on their phone"`
    - Display specific messages for 1032 (cancellation) and 1037 (insufficient balance) in the `failed` state
    - _Requirements: 3.2, 3.3, 4.2, 4.3, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 4.2 Write unit tests for `StkPushSection` ReceiptCard
    - Verify `ReceiptCard` renders receipt code, copy button shows "Copied!" for 1500 ms
    - File: `AlphaPlusApp/arms/src/__tests__/components/StkPushSection.test.tsx`
    - **Validates: Requirements 5.3, 5.4, 5.5**

- [ ] 5. Checkpoint — STK Push feature complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Feature 2 — Tenant licensing API routes
  - [x] 6.1 Create `POST /api/license/tenant-check` route
    - Create `AlphaPlusApp/arms/src/app/api/license/tenant-check/route.ts`
    - Validate `tenantId` is a positive integer; return HTTP 400 `{ error: "tenantId required" }` if not
    - Query `arms_tenant_licenses` by `tenant_id`
    - If found: update `last_seen_at = now()`, return `{ licensed: is_active, reason: revoked_reason }`
    - If not found: upsert new record (`is_active: true`, `licensed_at: now()`, `last_seen_at: now()`, `phone`), return `{ licensed: true, autoLicensed: true }`
    - Return HTTP 500 `{ error: "License check failed" }` on DB error
    - Use service role Supabase client (not anon)
    - _Requirements: 8.1, 8.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 6.2 Write property test for invalid tenantId rejection (Property 6)
    - **Property 6: Invalid tenantId Rejected**
    - Use `fast-check` to generate invalid tenantId values (null, 0, -1, strings, floats); verify HTTP 400 response
    - File: `AlphaPlusApp/arms/src/__tests__/api/license/tenant-check.test.ts`
    - **Validates: Requirements 9.2**

  - [ ]* 6.3 Write property test for auto-license on first login (Property 7)
    - **Property 7: Auto-License on First Login**
    - Use `fast-check` to generate tenantIds not in the license table; verify new record created with correct fields and `{ licensed: true, autoLicensed: true }` returned
    - File: `AlphaPlusApp/arms/src/__tests__/api/license/tenant-check.test.ts`
    - **Validates: Requirements 8.1, 8.2, 9.5**

  - [x] 6.4 Create `POST /api/license/tenant-revoke` route
    - Create `AlphaPlusApp/arms/src/app/api/license/tenant-revoke/route.ts`
    - Validate `reason` is non-empty (not blank/whitespace); return HTTP 400 `{ error: "Revocation reason required" }` if not
    - Look up license by `tenant_id`; return HTTP 404 `{ error: "License record not found" }` if missing
    - Set `is_active = false`, `revoked_at = now()`, `revoked_reason = reason`; return `{ success: true }`
    - Return HTTP 500 `{ error: "Operation failed" }` on DB error
    - _Requirements: 13.1, 13.2, 13.3, 13.6, 13.7_

  - [ ]* 6.5 Write property test for revocation requires non-empty reason (Property 11)
    - **Property 11: Revocation Requires Non-Empty Reason**
    - Use `fast-check` to generate empty/whitespace-only reason strings; verify HTTP 400 with no DB changes
    - File: `AlphaPlusApp/arms/src/__tests__/api/license/tenant-revoke.test.ts`
    - **Validates: Requirements 13.3**

  - [x] 6.6 Create `POST /api/license/tenant-reactivate` route
    - Create `AlphaPlusApp/arms/src/app/api/license/tenant-reactivate/route.ts`
    - Look up license by `tenant_id`; return HTTP 404 `{ error: "License record not found" }` if missing
    - Set `is_active = true`, `revoked_at = null`, `revoked_reason = null`; return `{ success: true }`
    - Return HTTP 500 `{ error: "Operation failed" }` on DB error
    - _Requirements: 13.4, 13.5, 13.6, 13.7_

  - [ ]* 6.7 Write property test for revocation round-trip (Property 10)
    - **Property 10: Revocation Round-Trip**
    - Use `fast-check` to generate tenantIds with active licenses; verify revoke→reactivate restores `is_active = true`, `revoked_at = null`, `revoked_reason = null`
    - File: `AlphaPlusApp/arms/src/__tests__/api/license/tenant-reactivate.test.ts`
    - **Validates: Requirements 13.2, 13.5**

  - [x] 6.8 Create `POST /api/license/tenant-bulk-license` route
    - Create `AlphaPlusApp/arms/src/app/api/license/tenant-bulk-license/route.ts`
    - Fetch all `arms_tenants` where `status = 'Active'`
    - Fetch all existing `arms_tenant_licenses` tenant_ids
    - Filter active tenants not already licensed; bulk insert new license records
    - Return `{ licensed: newCount, skipped: alreadyLicensedCount }`
    - Return HTTP 500 `{ error: "Bulk license failed" }` on DB error
    - _Requirements: 12.3, 12.4, 12.5, 12.7, 12.8_

  - [ ]* 6.9 Write property test for bulk license count invariant (Property 12)
    - **Property 12: Bulk License Count Invariant**
    - Use `fast-check` to generate random sets of active tenants with varying license coverage; verify `licensed + skipped = total active tenants` and all tenants have licenses after the call
    - File: `AlphaPlusApp/arms/src/__tests__/api/license/tenant-bulk-license.test.ts`
    - **Validates: Requirements 12.4, 12.5**

- [ ] 7. Feature 2 — Admin licensing page
  - [ ] 7.1 Create `/dashboard/licensing/tenants` page
    - Create `AlphaPlusApp/arms/src/app/dashboard/licensing/tenants/page.tsx`
    - Use existing ARMS dashboard auth pattern (read `arms_user` from `localStorage`, redirect to `/` if not found)
    - Fetch license records joined with `arms_tenants`, `arms_units`, `arms_locations`
    - Render summary cards: total active licenses count (green), total revoked licenses count (red)
    - Render "License All Active Tenants" button that calls `POST /api/license/tenant-bulk-license` and shows `react-hot-toast` with result count
    - Render filter bar: status tabs (All / Active / Revoked) + search input (by tenant name or phone)
    - Render table with columns: tenant name, phone, unit name, location name, licensed date, last seen date, status badge (`Active` green / `Revoked` red), action button
    - Active rows: show "Revoke" button → opens modal with required reason text input → calls `POST /api/license/tenant-revoke` → refreshes table
    - Revoked rows: show "Re-activate" button → calls `POST /api/license/tenant-reactivate` → refreshes table
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 12.1, 12.2, 12.6, 12.7_

  - [ ]* 7.2 Write property test for admin page filter correctness (Property 13)
    - **Property 13: Admin Page Filter Correctness**
    - Use `fast-check` to generate random license record sets and filter/search combinations; verify all displayed rows satisfy both filter and search conditions
    - File: `AlphaPlusApp/arms/src/__tests__/components/LicensingPage.test.tsx`
    - **Validates: Requirements 11.9**

  - [ ]* 7.3 Write property test for admin page count invariant (Property 14)
    - **Property 14: Admin Page Count Invariant**
    - Use `fast-check` to generate random license record sets; verify `activeCount + revokedCount = totalCount`
    - File: `AlphaPlusApp/arms/src/__tests__/components/LicensingPage.test.tsx`
    - **Validates: Requirements 11.8**

- [ ] 8. Checkpoint — Web app features complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Feature 2 — Mobile app license check and License Gate
  - [x] 9.1 Add `checkTenantLicense` to `arms-mobile/lib/supabase.ts`
    - Modify `AlphaPlusApp/arms/arms-mobile/lib/supabase.ts`
    - Add `API_BASE_URL` constant: `'https://arms-opal.vercel.app'`
    - Add exported `checkTenantLicense(tenantId: number, phone: string)` function
    - POST to `${API_BASE_URL}/api/license/tenant-check` with `{ tenantId, phone }`
    - Return `{ licensed: boolean; reason?: string; autoLicensed?: boolean }`
    - On any error (network, HTTP 4xx/5xx, malformed response): fail-open, return `{ licensed: true }` and log warning
    - _Requirements: 10.1, 10.6_

  - [ ]* 9.2 Write property test for fail-open license check (Property 9)
    - **Property 9: Fail-Open License Check**
    - Use `fast-check` to generate random error conditions (network errors, HTTP 400–599); verify mobile app always returns `{ licensed: true }` on error
    - File: `AlphaPlusApp/arms/arms-mobile/__tests__/lib/supabase.license.test.ts`
    - **Validates: Requirements 10.6**

  - [x] 9.3 Update `LoginScreen.tsx` — call license check after successful login
    - Modify `AlphaPlusApp/arms/arms-mobile/src/screens/LoginScreen.tsx`
    - After `loginTenant()` returns `success: true`, set `checkingLicense = true`
    - Call `checkTenantLicense(tenant.tenant_id, tenant.phone ?? '')`
    - If `licensed: true` → call `onLoginSuccess(tenant)` as before
    - If `licensed: false` → set `licenseRevoked = true` and `revokeReason = reason`
    - On error → proceed (fail-open)
    - Set `checkingLicense = false` after check completes
    - Show `ActivityIndicator` while `checkingLicense = true`
    - _Requirements: 10.1, 10.2, 10.3, 10.7_

  - [x] 9.4 Add `LicenseGate` component to `LoginScreen.tsx`
    - Add `LicenseGate` component (inline in `LoginScreen.tsx` or as a separate file imported by it)
    - Full-screen layout with red/warning icon, title "Access Revoked", message "Your access has been revoked. Please contact your landlord.", revocation reason (if provided)
    - "Contact Landlord" button that opens `tel:` or `sms:` link
    - Render `<LicenseGate reason={revokeReason} />` when `licenseRevoked = true` instead of the login form
    - _Requirements: 10.3, 10.4, 10.5_

  - [ ]* 9.5 Write property test for license check always called after login (Property 8)
    - **Property 8: License Check Always Called After Successful Login**
    - Use `fast-check` to generate random successful login results with varying tenant data; verify `checkTenantLicense` is always called with correct `tenantId` and `phone`
    - File: `AlphaPlusApp/arms/arms-mobile/__tests__/screens/LoginScreen.license.test.tsx`
    - **Validates: Requirements 10.1**

- [ ] 10. Checkpoint — Mobile app features complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Git commit and push
  - [x] 11.1 Stage all new and modified files
    - Stage: `AlphaPlusApp/arms/sql/arms_tenant_licenses_migration.sql`
    - Stage: `AlphaPlusApp/arms/src/app/api/mpesa/stk-status/route.ts`
    - Stage: `AlphaPlusApp/arms/src/hooks/useStkPush.ts`
    - Stage: `AlphaPlusApp/arms/src/components/StkPushSection.tsx`
    - Stage: `AlphaPlusApp/arms/src/app/api/license/tenant-check/route.ts`
    - Stage: `AlphaPlusApp/arms/src/app/api/license/tenant-revoke/route.ts`
    - Stage: `AlphaPlusApp/arms/src/app/api/license/tenant-reactivate/route.ts`
    - Stage: `AlphaPlusApp/arms/src/app/api/license/tenant-bulk-license/route.ts`
    - Stage: `AlphaPlusApp/arms/src/app/dashboard/licensing/tenants/page.tsx`
    - Stage: `AlphaPlusApp/arms/arms-mobile/lib/supabase.ts`
    - Stage: `AlphaPlusApp/arms/arms-mobile/src/screens/LoginScreen.tsx`
    - Stage any test files created under `__tests__/`

  - [ ] 11.2 Commit and push to new branch
    - Commit with message: `feat: ultra-fast STK push + tenant auto-licensing for mobile APK`
    - Push to new branch `feature/ultra-stk-tenant-licensing` on `https://github.com/Jimhawkink/ARMS`
    - Use `git push -u origin feature/ultra-stk-tenant-licensing`

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests use `fast-check` (already a common choice in the TS ecosystem); install with `npm install --save-dev fast-check` if not present
- The `stk-status` endpoint must use the service role Supabase client (same pattern as other API routes in this project)
- The mobile `checkTenantLicense` is fail-open by design — a backend outage must never lock out tenants
- The `loginTenant` function in `arms-mobile/lib/supabase.ts` already exists; do not replace it, only add `checkTenantLicense` alongside it
- The admin licensing page follows the same auth and layout pattern as `AlphaPlusApp/arms/src/app/dashboard/tenants/page.tsx`
