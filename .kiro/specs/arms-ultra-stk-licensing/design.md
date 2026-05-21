# Design Document: ARMS Ultra STK Push & Tenant Auto-Licensing

## Overview

This document covers the technical design for two related features in the ARMS (Apartment Rental Management System):

**Feature 1 — Ultra-Fast M-Pesa STK Push Processing**: Replaces the existing M-Pesa Query API polling with a fast DB-based status endpoint that reads directly from `arms_stk_requests`. Introduces adaptive polling (1.5 s for the first 20 s, then 3 s), and adds precise user-facing messages for cancellation (code 1032), insufficient balance (code 1037), receipt display with copy-to-clipboard, and improved timeout messaging.

**Feature 2 — Tenant Auto-Licensing for Mobile APK**: Introduces an `arms_tenant_licenses` table, auto-licensing on first login, per-tenant revocation and reactivation, an admin licensing dashboard at `/dashboard/licensing/tenants`, a bulk-license action, and a full-screen License Gate in the mobile app for revoked tenants.

---

## Architecture

### System Context

```mermaid
graph TD
    subgraph "Next.js Web App (ARMS Admin)"
        A[StkPushSection.tsx] -->|uses| B[useStkPush.ts hook]
        B -->|POST| C[/api/mpesa/stk-push]
        B -->|GET poll| D[/api/mpesa/stk-status NEW]
        E[/dashboard/licensing/tenants NEW] -->|POST| F[/api/license/tenant-check]
        E -->|POST| G[/api/license/tenant-revoke NEW]
        E -->|POST| H[/api/license/tenant-reactivate NEW]
        E -->|POST| I[/api/license/tenant-bulk-license NEW]
    end

    subgraph "Safaricom M-Pesa"
        J[Daraja STK Push API]
        K[STK Callback → /api/mpesa/stk-callback]
    end

    subgraph "Supabase (PostgreSQL)"
        L[(arms_stk_requests)]
        M[(arms_tenant_licenses NEW)]
        N[(arms_tenants)]
    end

    subgraph "React Native Mobile App (arms-mobile)"
        O[LoginScreen.tsx] -->|calls| P[loginTenant]
        O -->|POST after login| F
        O -->|shows if revoked| Q[LicenseGate.tsx NEW]
        P -->|reads| N
    end

    C -->|writes| L
    K -->|writes| L
    D -->|reads| L
    F -->|upserts| M
    G -->|updates| M
    H -->|updates| M
    I -->|bulk inserts| M
    C -->|calls| J
```

### Key Architectural Decisions

1. **DB-first polling**: The new `stk-status` endpoint reads `arms_stk_requests` directly — no outbound M-Pesa API call. The STK callback already writes the result to the DB, so polling the DB is both faster and cheaper than querying Safaricom.

2. **setTimeout chains over setInterval**: Adaptive polling uses chained `setTimeout` calls rather than `setInterval` to avoid timer drift. Each callback schedules the next one, making it trivial to switch intervals at the 20-second boundary.

3. **Fail-open license check**: The mobile app's license check is fail-open — if the API is unreachable or returns an error, login proceeds. This prevents a backend outage from locking out all tenants.

4. **Upsert idempotency**: Auto-licensing uses Supabase `upsert` with `onConflict: 'tenant_id'` so repeated calls for the same tenant are safe. Bulk licensing queries for tenants without existing records before inserting.

5. **Service-role-only table access**: `arms_tenant_licenses` has RLS enabled with no anon access. All reads and writes go through Next.js API routes using the service role key, keeping license data off the client.

---

## Components and Interfaces

### Feature 1: Ultra-Fast STK Push

#### New: `GET /api/mpesa/stk-status`

```typescript
// Request
GET /api/mpesa/stk-status?checkoutRequestId=ws_CO_...

// Response (record found)
{
  status: "Pending" | "Completed" | "Failed" | "Cancelled",
  resultCode: number | null,
  resultDesc: string | null,
  mpesaReceipt: string | null
}

// Response (record not found — treat as still pending)
{
  status: "Pending",
  resultCode: null,
  resultDesc: null,
  mpesaReceipt: null
}

// Error responses
HTTP 400: { error: "checkoutRequestId required" }
HTTP 500: { error: "Status check failed" }
```

The endpoint maps `arms_stk_requests` columns to the response:
- `status` → `status` field
- `result_code` → `resultCode`
- `result_desc` → `resultDesc`
- `mpesa_receipt` → `mpesaReceipt`

#### Modified: `useStkPush.ts` — Adaptive Polling

The hook replaces the single `setInterval` with a `setTimeout` chain. Two timing constants replace the old single constant:

```typescript
const FAST_INTERVAL_MS = 1500;   // first 20 seconds
const SLOW_INTERVAL_MS = 3000;   // after 20 seconds
const FAST_PHASE_DURATION_MS = 20000;
const MAX_POLL_DURATION_MS = 120000;
```

The polling state machine:

```
idle → [send()] → sending → [M-Pesa accepts] → pending
  pending → [poll loop]
    → status "Completed" + receipt → success (call onReceiptReceived)
    → status "Completed" no receipt → success (call onReceiptReceived(""))
    → resultCode 1032 → failed ("❌ Payment Cancelled…")
    → resultCode 1037 → failed ("💸 Insufficient M-Pesa Balance…")
    → other non-zero resultCode → failed (resultDesc or generic)
    → 120s elapsed → failed ("⏱ No response from M-Pesa…")
  failed → [retry()] → sending (restart)
  any → [reset()] → idle
```

ResultCode mapping table:

| ResultCode | State  | Message |
|-----------|--------|---------|
| `0` | `success` | — (receipt auto-filled) |
| `1032` | `failed` | `"❌ Payment Cancelled — You cancelled the M-Pesa prompt. Tap Retry to try again."` |
| `1037` | `failed` | `"💸 Insufficient M-Pesa Balance — Please top up your M-Pesa and try again."` |
| other non-zero | `failed` | `resultDesc` or `"Payment failed (code X)"` |
| timeout | `failed` | `"⏱ No response from M-Pesa — Did you see a prompt on your phone? You can enter the receipt manually below."` |

#### Modified: `StkPushSection.tsx` — Receipt Card

A new `ReceiptCard` sub-component is added inside `StkPushSection`:

```typescript
interface ReceiptCardProps {
  receipt: string;
}
```

The card renders:
- Green-themed card with the receipt code in a monospace/bold style
- A copy-to-clipboard button (using `navigator.clipboard.writeText`)
- A "Copied!" confirmation that appears for 1500 ms after clicking

The `pending` status message is updated to reflect the new 1.5 s fast polling:
> "Checking every 1.5s · Tenant should see a prompt on their phone"

---

### Feature 2: Tenant Auto-Licensing

#### New: `POST /api/license/tenant-check`

```typescript
// Request body
{ tenantId: number, phone: string }

// Responses
HTTP 200: { licensed: true }                          // active license
HTTP 200: { licensed: true, autoLicensed: true }      // newly created
HTTP 200: { licensed: false, reason: string }         // revoked
HTTP 400: { error: "tenantId required" }              // missing/invalid
HTTP 500: { error: "License check failed" }           // DB error
```

Logic flow:
1. Validate `tenantId` is a positive integer
2. Query `arms_tenant_licenses` by `tenant_id`
3. If found: update `last_seen_at = now()`, return `{ licensed: is_active, reason: revoked_reason }`
4. If not found: upsert new record with `is_active = true`, return `{ licensed: true, autoLicensed: true }`

#### New: `POST /api/license/tenant-revoke`

```typescript
// Request body
{ tenantId: number, reason: string }

// Responses
HTTP 200: { success: true }
HTTP 400: { error: "Revocation reason required" }
HTTP 404: { error: "License record not found" }
HTTP 500: { error: "Operation failed" }
```

#### New: `POST /api/license/tenant-reactivate`

```typescript
// Request body
{ tenantId: number }

// Responses
HTTP 200: { success: true }
HTTP 404: { error: "License record not found" }
HTTP 500: { error: "Operation failed" }
```

Sets `is_active = true`, `revoked_at = null`, `revoked_reason = null`.

#### New: `POST /api/license/tenant-bulk-license`

```typescript
// Request body
{} (no body required)

// Responses
HTTP 200: { licensed: number, skipped: number }
HTTP 500: { error: "Bulk license failed" }
```

Logic:
1. Fetch all `arms_tenants` where `status = 'Active'`
2. Fetch all existing `arms_tenant_licenses` tenant_ids
3. Filter active tenants not in existing licenses
4. Bulk insert new license records
5. Return `{ licensed: newCount, skipped: alreadyLicensedCount }`

#### New: `/dashboard/licensing/tenants` Page

Admin page following the existing ARMS dashboard layout pattern. Key UI sections:

- **Summary cards**: Total active licenses, total revoked licenses
- **"License All Active Tenants" button**: Calls bulk-license endpoint, shows toast
- **Filter bar**: Status filter (All / Active / Revoked) + search by name or phone
- **License table**: tenant name, phone, unit, location, licensed date, last seen, status badge, action button

The page uses the same auth pattern as other dashboard pages: reads `arms_user` from `localStorage`, redirects to `/` if not found.

#### Modified: `arms-mobile/lib/supabase.ts`

New exported function:

```typescript
export async function checkTenantLicense(
  tenantId: number,
  phone: string
): Promise<{ licensed: boolean; reason?: string; autoLicensed?: boolean }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/license/tenant-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, phone }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    // Fail-open: network error or server error → allow login
    console.warn('License check failed (fail-open):', e);
    return { licensed: true };
  }
}
```

The `API_BASE_URL` constant points to the deployed ARMS web app URL (same Supabase project).

#### Modified: `arms-mobile/src/screens/LoginScreen.tsx`

After `loginTenant()` returns `success: true`:

1. Set `checkingLicense = true` (shows loading indicator)
2. Call `checkTenantLicense(tenant.tenant_id, tenant.phone)`
3. If `licensed: true` → call `onLoginSuccess(tenant)` as before
4. If `licensed: false` → set `licenseRevoked = true` and `revokeReason = reason`
5. If error → proceed (fail-open)
6. Set `checkingLicense = false`

When `licenseRevoked = true`, render `<LicenseGate reason={revokeReason} />` instead of the login form.

#### New: `LicenseGate` Component (inline in LoginScreen or separate file)

```typescript
interface LicenseGateProps {
  reason?: string;
}
```

Full-screen component showing:
- Red/warning icon
- Title: "Access Revoked"
- Message: "Your access has been revoked. Please contact your landlord."
- Revocation reason (if provided)
- "Contact Landlord" button (opens `tel:` or `sms:` link)

---

## Data Models

### New Table: `arms_tenant_licenses`

```sql
CREATE TABLE public.arms_tenant_licenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER NOT NULL REFERENCES public.arms_tenants(tenant_id) ON DELETE CASCADE,
    phone           TEXT NOT NULL DEFAULT '',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    licensed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ DEFAULT NULL,
    revoked_reason  TEXT DEFAULT NULL,
    CONSTRAINT arms_tenant_licenses_tenant_id_unique UNIQUE (tenant_id)
);

CREATE INDEX idx_arms_tenant_licenses_tenant_id ON public.arms_tenant_licenses (tenant_id);
CREATE INDEX idx_arms_tenant_licenses_phone ON public.arms_tenant_licenses (phone);

ALTER TABLE public.arms_tenant_licenses ENABLE ROW LEVEL SECURITY;

-- No anon access — all access via service role through API routes
CREATE POLICY "arms_tenant_licenses_anon_no_access"
    ON public.arms_tenant_licenses FOR ALL TO anon USING (false);

CREATE POLICY "arms_tenant_licenses_service_full_access"
    ON public.arms_tenant_licenses FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
```

### Existing Table: `arms_stk_requests` (no schema changes)

The existing table already has all required columns. The new `stk-status` endpoint reads:

| Column | Type | Used for |
|--------|------|----------|
| `checkout_request_id` | text | lookup key |
| `status` | text | `"Pending"` / `"Completed"` / `"Failed"` / `"Cancelled"` |
| `result_code` | integer | ResultCode from Safaricom callback |
| `result_desc` | text | Human-readable result description |
| `mpesa_receipt` | text | M-Pesa receipt code (e.g. `RCK1AB2CD3`) |

### TypeScript Types

```typescript
// arms_tenant_licenses row
interface TenantLicense {
  id: string;
  tenant_id: number;
  phone: string;
  is_active: boolean;
  licensed_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

// Admin page row (joined with arms_tenants, arms_units, arms_locations)
interface TenantLicenseRow extends TenantLicense {
  tenant_name: string;
  unit_name: string | null;
  location_name: string | null;
}

// STK status response
interface StkStatusResponse {
  status: 'Pending' | 'Completed' | 'Failed' | 'Cancelled';
  resultCode: number | null;
  resultDesc: string | null;
  mpesaReceipt: string | null;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: STK Status Response Shape

*For any* `arms_stk_requests` record with any combination of `status`, `result_code`, `result_desc`, and `mpesa_receipt` values, the `stk-status` endpoint response always contains all four fields (`status`, `resultCode`, `resultDesc`, `mpesaReceipt`) with values that exactly match the corresponding DB columns.

**Validates: Requirements 1.2**

---

### Property 2: Adaptive Polling Interval

*For any* elapsed polling time `t`, the next scheduled poll interval is exactly 1500 ms when `t ≤ 20000 ms`, and exactly 3000 ms when `t > 20000 ms`. No other interval value is ever used.

**Validates: Requirements 2.2, 2.3**

---

### Property 3: Polling Stops on Non-Pending Status

*For any* status value returned by the `stk-status` endpoint that is not `"Pending"`, the polling loop terminates immediately after processing that response — no further poll is scheduled.

**Validates: Requirements 2.4**

---

### Property 4: ResultCode to State Mapping

*For any* `resultCode` value returned by the `stk-status` endpoint, the `useStkPush` hook transitions to exactly the correct state: `success` for code `0`, `failed` with the cancellation message for code `1032`, `failed` with the insufficient balance message for code `1037`, and `failed` with the result description (or generic message) for any other non-zero code.

**Validates: Requirements 3.1, 4.1**

---

### Property 5: Receipt Round-Trip

*For any* non-empty `mpesaReceipt` string returned by the `stk-status` endpoint when `status = "Completed"`, the `useStkPush` hook calls `onReceiptReceived` with exactly that string — unchanged, untruncated, and without any transformation.

**Validates: Requirements 5.1**

---

### Property 6: Invalid tenantId Rejected

*For any* value of `tenantId` that is not a positive integer (including `null`, `undefined`, `0`, negative numbers, non-numeric strings, and floats), the `tenant-check` endpoint returns HTTP 400 with `{ error: "tenantId required" }`.

**Validates: Requirements 9.2**

---

### Property 7: Auto-License on First Login

*For any* `tenantId` that has no existing record in `arms_tenant_licenses`, a call to `tenant-check` always creates a new record with `is_active = true`, `licensed_at` set to the current timestamp, `last_seen_at` set to the current timestamp, and returns `{ licensed: true, autoLicensed: true }`.

**Validates: Requirements 8.1, 8.2, 9.5**

---

### Property 8: License Check Always Called After Successful Login

*For any* successful `loginTenant()` result (any tenant, any phone number), the mobile app always calls `checkTenantLicense` with the correct `tenantId` and `phone` before navigating to the dashboard or showing the License Gate.

**Validates: Requirements 10.1**

---

### Property 9: Fail-Open License Check

*For any* error condition from the license check (network error, HTTP 4xx, HTTP 5xx, timeout, malformed response), the mobile app proceeds to the dashboard as if the tenant were licensed — it never blocks login due to a license check failure.

**Validates: Requirements 10.6**

---

### Property 10: Revocation Round-Trip

*For any* `tenantId` with an existing active license, calling `tenant-revoke` followed by `tenant-reactivate` restores the license to `is_active = true` with `revoked_at = null` and `revoked_reason = null` — the license is indistinguishable from its pre-revocation state (except for `last_seen_at`).

**Validates: Requirements 13.2, 13.5**

---

### Property 11: Revocation Requires Non-Empty Reason

*For any* revocation request where `reason` is absent, an empty string, or a string composed entirely of whitespace, the `tenant-revoke` endpoint returns HTTP 400 with `{ error: "Revocation reason required" }` and makes no changes to the database.

**Validates: Requirements 13.3**

---

### Property 12: Bulk License Count Invariant

*For any* set of active tenants where `N` have no existing license record and `K` already have one, calling `tenant-bulk-license` returns `{ licensed: N, skipped: K }` where `N + K` equals the total number of active tenants. After the call, every active tenant has exactly one license record.

**Validates: Requirements 12.4, 12.5**

---

### Property 13: Admin Page Filter Correctness

*For any* combination of status filter (All / Active / Revoked) and search query (by name or phone), every row displayed in the admin licensing table satisfies both the filter condition and the search condition simultaneously — no row that fails either condition is ever shown.

**Validates: Requirements 11.9**

---

### Property 14: Admin Page Count Invariant

*For any* set of license records, the "Active" summary card count plus the "Revoked" summary card count always equals the total number of license records displayed in the table (before any filtering).

**Validates: Requirements 11.8**

---

## Error Handling

### STK Push Errors

| Scenario | Handling |
|----------|----------|
| `checkoutRequestId` missing | HTTP 400 immediately |
| DB query error in `stk-status` | HTTP 500 with `{ error: "Status check failed" }` |
| Network error during poll | Silently retry on next interval (do not transition to failed) |
| Poll timeout (120 s) | Transition to `failed` with timeout message |
| ResultCode 1032 | Transition to `failed` with cancellation message |
| ResultCode 1037 | Transition to `failed` with insufficient balance message |
| Other non-zero ResultCode | Transition to `failed` with `resultDesc` or generic message |

### License API Errors

| Scenario | Handling |
|----------|----------|
| Missing/invalid `tenantId` | HTTP 400 |
| Missing/empty `reason` (revoke) | HTTP 400 |
| License record not found (revoke/reactivate) | HTTP 404 |
| DB error in any license endpoint | HTTP 500 |
| License check unreachable (mobile) | Fail-open: proceed to dashboard |
| License check returns error (mobile) | Fail-open: proceed to dashboard, log warning |

### Admin Page Errors

| Scenario | Handling |
|----------|----------|
| Revoke without entering reason | Client-side validation: disable submit button, show inline error |
| API call fails during revoke/reactivate | `react-hot-toast` error toast, table not refreshed |
| Bulk license API fails | `react-hot-toast` error toast |
| Page load fails | Loading spinner with retry button |

---

## Testing Strategy

### Unit Tests

Unit tests cover specific examples, edge cases, and error conditions:

- `stk-status` endpoint: missing param → 400, DB error → 500, record not found → Pending response
- `useStkPush`: ResultCode 1032 → cancellation message, ResultCode 1037 → balance message, timeout → timeout message
- `StkPushSection`: Receipt_Card renders with receipt code, copy button shows "Copied!" for 1500 ms
- `tenant-check`: missing tenantId → 400, active license → `{ licensed: true }`, revoked license → `{ licensed: false, reason }`
- `tenant-revoke`: empty reason → 400, non-existent license → 404
- `tenant-reactivate`: non-existent license → 404
- `checkTenantLicense` (mobile): network error → `{ licensed: true }` (fail-open)
- `LicenseGate`: renders revocation message and "Contact Landlord" button

### Property-Based Tests

Property-based tests use [fast-check](https://github.com/dubzzz/fast-check) (TypeScript/JavaScript PBT library). Each test runs a minimum of 100 iterations.

**Configuration:**
```typescript
import fc from 'fast-check';
// Minimum 100 runs per property
fc.configureGlobal({ numRuns: 100 });
```

Each property test is tagged with a comment referencing the design property:
```typescript
// Feature: arms-ultra-stk-licensing, Property 1: STK Status Response Shape
```

**Property tests to implement:**

1. **Property 1** — Generate random `arms_stk_requests` rows with arbitrary status/resultCode/resultDesc/mpesaReceipt values. Verify response shape matches DB values exactly.

2. **Property 2** — Generate random elapsed times. Verify interval selection: `t ≤ 20000` → 1500 ms, `t > 20000` → 3000 ms.

3. **Property 3** — Generate random non-Pending status strings. Verify polling stops after receiving them.

4. **Property 4** — Generate arbitrary result codes. Verify the hook maps each to the correct state and message.

5. **Property 5** — Generate random receipt strings (alphanumeric, varying length). Verify `onReceiptReceived` is called with the exact same string.

6. **Property 6** — Generate invalid tenantId values (null, 0, -1, strings, floats). Verify HTTP 400 response.

7. **Property 7** — Generate random tenantIds not in the license table. Verify auto-license creates correct record and returns correct response.

8. **Property 8** — Generate random successful login results with varying tenant data. Verify `checkTenantLicense` is always called with correct params.

9. **Property 9** — Generate random error conditions (network errors, HTTP status codes 400–599). Verify mobile app always proceeds to dashboard.

10. **Property 10** — Generate random tenantIds with active licenses. Verify revoke→reactivate round-trip restores original state.

11. **Property 11** — Generate empty/whitespace-only reason strings. Verify HTTP 400 with no DB changes.

12. **Property 12** — Generate random sets of active tenants with varying license coverage. Verify `licensed + skipped = total active tenants` and all tenants have licenses after the call.

13. **Property 13** — Generate random license record sets and filter/search combinations. Verify all displayed rows satisfy both conditions.

14. **Property 14** — Generate random license record sets. Verify `activeCount + revokedCount = totalCount`.

### Integration Tests

Integration tests verify end-to-end flows against a test Supabase instance:

- Full STK Push flow: initiate → callback writes to DB → stk-status returns Completed
- License check flow: first login auto-creates license, second login returns existing license
- Revoke → mobile login shows License Gate
- Bulk license: creates records for all unlicensed active tenants

### Test File Locations

```
AlphaPlusApp/arms/src/
  __tests__/
    api/
      mpesa/
        stk-status.test.ts
      license/
        tenant-check.test.ts
        tenant-revoke.test.ts
        tenant-reactivate.test.ts
        tenant-bulk-license.test.ts
    hooks/
      useStkPush.test.ts
    components/
      StkPushSection.test.tsx

AlphaPlusApp/arms/arms-mobile/
  __tests__/
    lib/
      supabase.license.test.ts
    screens/
      LoginScreen.license.test.tsx
```
