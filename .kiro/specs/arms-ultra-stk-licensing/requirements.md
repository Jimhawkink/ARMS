# Requirements Document

## Introduction

This document covers two related features for the ARMS (Apartment Rental Management System):

**Feature 1 — Ultra-Fast M-Pesa STK Push Processing**: The existing STK Push flow polls the M-Pesa Query API directly every 3 seconds, which is slow, rate-limited, and expensive. This feature replaces that with a fast DB-based status endpoint that reads from `arms_stk_requests` directly, introduces an adaptive polling strategy (1.5 s for the first 20 s, then 3 s), and adds precise user-facing messages for cancellation, insufficient balance, receipt display, and timeout.

**Feature 2 — Tenant Auto-Licensing for Mobile APK**: The ARMS mobile app (`arms-mobile/`) currently has no license gate. Any tenant with a valid phone + PIN can log in indefinitely. This feature introduces an `arms_tenant_licenses` table, auto-licensing on first login, per-tenant revocation, an admin licensing dashboard, a bulk-license action, and a full-screen access-revoked gate in the mobile app.

---

## Glossary

- **STK_Status_Endpoint**: The new `GET /api/mpesa/stk-status` route that queries `arms_stk_requests` directly.
- **STK_Push_Hook**: The `useStkPush` React hook in `src/hooks/useStkPush.ts`.
- **STK_Push_Section**: The `StkPushSection` React component in `src/components/StkPushSection.tsx`.
- **STK_Callback**: The existing `POST /api/mpesa/stk-callback` route that receives Safaricom callbacks and writes to `arms_stk_requests`.
- **arms_stk_requests**: The Supabase table that stores STK Push request records including `checkout_request_id`, `status`, `result_code`, `result_desc`, and `mpesa_receipt`.
- **ResultCode**: The numeric code returned by Safaricom in the STK callback. `0` = success, `1032` = user cancelled, `1037` = insufficient balance.
- **Receipt_Card**: The green UI card displayed on payment success showing the M-Pesa receipt code with a copy-to-clipboard button.
- **Tenant_License**: A record in `arms_tenant_licenses` that tracks whether a specific tenant is permitted to use the mobile app.
- **License_Gate**: The full-screen "Access Revoked" screen shown in the mobile app when a tenant's license is inactive.
- **License_Check_Endpoint**: The `POST /api/license/tenant-check` route that validates or auto-creates a tenant license.
- **Admin_Licensing_Page**: The Next.js page at `/dashboard/licensing/tenants` for managing tenant licenses.
- **Bulk_License_Endpoint**: The `POST /api/license/tenant-bulk-license` route that auto-creates licenses for all active tenants without one.
- **arms_tenant_licenses**: The Supabase table storing one license record per tenant.
- **loginTenant**: The function in `arms-mobile/src/lib/supabase.ts` that authenticates a tenant by phone and PIN.
- **Admin**: A user with `user_type = 'admin'` or `user_role = 'admin'` in `arms_users`.
- **Active_Tenant**: A tenant with `status = 'Active'` in `arms_tenants`.

---

## Requirements

---

### Requirement 1: DB-Based STK Push Status Endpoint

**User Story:** As an admin recording a rent payment, I want the payment status to update as fast as possible after the tenant pays, so that I can confirm the payment without waiting for slow M-Pesa API calls.

#### Acceptance Criteria

1. THE STK_Status_Endpoint SHALL accept a `GET` request at `/api/mpesa/stk-status` with a required `checkoutRequestId` query parameter.
2. WHEN a valid `checkoutRequestId` is provided, THE STK_Status_Endpoint SHALL query the `arms_stk_requests` table and return a JSON response containing `{ status, resultCode, resultDesc, mpesaReceipt }`.
3. WHEN the `checkoutRequestId` query parameter is absent or empty, THE STK_Status_Endpoint SHALL return HTTP 400 with `{ error: "checkoutRequestId required" }`.
4. WHEN no matching record exists in `arms_stk_requests`, THE STK_Status_Endpoint SHALL return `{ status: "Pending", resultCode: null, resultDesc: null, mpesaReceipt: null }`.
5. THE STK_Status_Endpoint SHALL NOT make any outbound call to the Safaricom M-Pesa Query API.
6. THE STK_Status_Endpoint SHALL respond within 500 ms under normal Supabase latency conditions.
7. IF a database error occurs during the query, THEN THE STK_Status_Endpoint SHALL return HTTP 500 with `{ error: "Status check failed" }`.

---

### Requirement 2: Adaptive Polling Strategy

**User Story:** As an admin, I want the payment status to update within 2 seconds of the tenant paying, so that the workflow feels instant rather than sluggish.

#### Acceptance Criteria

1. WHEN an STK Push is accepted by M-Pesa (ResponseCode `"0"`), THE STK_Push_Hook SHALL begin polling the STK_Status_Endpoint.
2. WHILE the elapsed polling time is 20 seconds or less, THE STK_Push_Hook SHALL poll the STK_Status_Endpoint every 1500 milliseconds.
3. WHILE the elapsed polling time exceeds 20 seconds, THE STK_Push_Hook SHALL poll the STK_Status_Endpoint every 3000 milliseconds.
4. WHEN the STK_Status_Endpoint returns a `status` that is not `"Pending"`, THE STK_Push_Hook SHALL stop polling immediately.
5. WHEN the total polling duration reaches 120 seconds without a non-Pending status, THE STK_Push_Hook SHALL stop polling and transition to the `failed` state.
6. THE STK_Push_Hook SHALL NOT poll the existing `GET /api/mpesa/stk-push` M-Pesa Query endpoint during normal payment flows.

---

### Requirement 3: Cancellation Detection and Messaging

**User Story:** As a tenant, I want to see a clear message when I cancel the M-Pesa prompt, so that I know I need to tap Retry to try again.

#### Acceptance Criteria

1. WHEN the STK_Status_Endpoint returns `resultCode` equal to `1032`, THE STK_Push_Hook SHALL transition to the `failed` state with the cancellation error message.
2. WHEN the STK_Push_Section renders in the `failed` state with a cancellation error, THE STK_Push_Section SHALL display the message: `"❌ Payment Cancelled — You cancelled the M-Pesa prompt. Tap Retry to try again."`.
3. WHEN the cancellation message is displayed, THE STK_Push_Section SHALL show the Retry button.
4. THE STK_Push_Section SHALL NOT display the "till is not configured" admin hint when the error is a cancellation.

---

### Requirement 4: Insufficient Balance Detection and Messaging

**User Story:** As a tenant, I want to see a clear message when my M-Pesa balance is too low, so that I know to top up before retrying.

#### Acceptance Criteria

1. WHEN the STK_Status_Endpoint returns `resultCode` equal to `1037`, THE STK_Push_Hook SHALL transition to the `failed` state with the insufficient balance error message.
2. WHEN the STK_Push_Section renders in the `failed` state with an insufficient balance error, THE STK_Push_Section SHALL display the message: `"💸 Insufficient M-Pesa Balance — Please top up your M-Pesa and try again."`.
3. WHEN the insufficient balance message is displayed, THE STK_Push_Section SHALL show the Retry button.

---

### Requirement 5: Receipt Display on Success

**User Story:** As an admin, I want the M-Pesa receipt code to be shown prominently after a successful payment, so that I can verify it and have it auto-filled in the payment form.

#### Acceptance Criteria

1. WHEN the STK_Status_Endpoint returns `status` equal to `"Completed"` with a non-empty `mpesaReceipt`, THE STK_Push_Hook SHALL call `onReceiptReceived` with the receipt code.
2. WHEN `onReceiptReceived` is called, THE STK_Push_Section SHALL display the Receipt_Card.
3. THE Receipt_Card SHALL display the receipt code (e.g. `RCK1AB2CD3`) in a visually prominent style within a green-themed card.
4. THE Receipt_Card SHALL include a copy-to-clipboard button that copies the receipt code to the system clipboard when clicked.
5. WHEN the copy-to-clipboard button is clicked, THE STK_Push_Section SHALL display a brief confirmation (e.g. "Copied!") for at least 1500 milliseconds.
6. WHEN `onReceiptReceived` is called, THE payment form receipt input field SHALL be auto-filled with the receipt code.
7. WHEN the STK_Status_Endpoint returns `status` equal to `"Completed"` but `mpesaReceipt` is null or empty, THE STK_Push_Hook SHALL still transition to the `success` state and call `onReceiptReceived` with an empty string.

---

### Requirement 6: Improved Timeout Message

**User Story:** As an admin, I want a helpful message when M-Pesa does not respond within 2 minutes, so that I know to ask the tenant if they saw a prompt and can enter the receipt manually.

#### Acceptance Criteria

1. WHEN the STK_Push_Hook polling duration reaches 120 seconds without a non-Pending status, THE STK_Push_Hook SHALL set the error message to: `"⏱ No response from M-Pesa — Did you see a prompt on your phone? You can enter the receipt manually below."`.
2. WHEN the timeout message is displayed, THE STK_Push_Section SHALL show the Retry button.
3. WHEN the timeout message is displayed, THE STK_Push_Section SHALL NOT hide the manual receipt input field in the parent payment form.

---

### Requirement 7: Tenant License Table

**User Story:** As a system administrator, I want a database table that tracks which tenants are licensed to use the mobile app, so that I can control access on a per-tenant basis.

#### Acceptance Criteria

1. THE System SHALL maintain an `arms_tenant_licenses` table in Supabase with columns: `id` (UUID primary key), `tenant_id` (integer, foreign key to `arms_tenants.tenant_id`), `phone` (text, the phone number used at first login), `is_active` (boolean, default `true`), `licensed_at` (timestamptz, set at record creation), `revoked_at` (nullable timestamptz), `revoked_reason` (nullable text), `last_seen_at` (timestamptz, updated on every license check).
2. THE System SHALL enforce a unique constraint on `tenant_id` in `arms_tenant_licenses` so that each tenant has at most one license record.
3. THE System SHALL create an index on `arms_tenant_licenses.tenant_id` for fast lookups.
4. THE System SHALL create an index on `arms_tenant_licenses.phone` for fast lookups.
5. THE System SHALL enable Row Level Security on `arms_tenant_licenses` with no direct anon access; all access SHALL go through the service role via API routes.

---

### Requirement 8: Auto-License on First Login

**User Story:** As a tenant logging in for the first time, I want to be automatically licensed without any admin action, so that I can access the app immediately after my landlord sets up my account.

#### Acceptance Criteria

1. WHEN the License_Check_Endpoint receives a request for a `tenantId` with no existing record in `arms_tenant_licenses`, THE License_Check_Endpoint SHALL INSERT a new record with `is_active = true`, `licensed_at = now()`, `last_seen_at = now()`, and `phone` set to the provided phone value.
2. WHEN a new license record is auto-created, THE License_Check_Endpoint SHALL return `{ licensed: true, autoLicensed: true }`.
3. THE License_Check_Endpoint SHALL complete the auto-license INSERT and return a response within 2000 milliseconds under normal Supabase latency.

---

### Requirement 9: License Check on Every Login

**User Story:** As a landlord, I want every tenant login attempt to be checked against the license table, so that revoked tenants are blocked immediately.

#### Acceptance Criteria

1. THE License_Check_Endpoint SHALL accept `POST` requests at `/api/license/tenant-check` with a JSON body containing `{ tenantId, phone }`.
2. WHEN `tenantId` is absent or not a positive integer, THE License_Check_Endpoint SHALL return HTTP 400 with `{ error: "tenantId required" }`.
3. WHEN a license record exists and `is_active = true`, THE License_Check_Endpoint SHALL return HTTP 200 with `{ licensed: true }` and update `last_seen_at` to the current timestamp.
4. WHEN a license record exists and `is_active = false`, THE License_Check_Endpoint SHALL return HTTP 200 with `{ licensed: false, reason: <revoked_reason> }` and update `last_seen_at` to the current timestamp.
5. WHEN no license record exists, THE License_Check_Endpoint SHALL auto-create one per Requirement 8 and return `{ licensed: true, autoLicensed: true }`.
6. IF a database error occurs, THEN THE License_Check_Endpoint SHALL return HTTP 500 with `{ error: "License check failed" }`.

---

### Requirement 10: Mobile App License Gate

**User Story:** As a landlord, I want revoked tenants to see a clear "Access Revoked" screen instead of the dashboard, so that they cannot use the app after I revoke their license.

#### Acceptance Criteria

1. WHEN `loginTenant()` returns `success: true`, THE Mobile_App SHALL call the License_Check_Endpoint with `{ tenantId, phone }` before navigating to the dashboard.
2. WHEN the License_Check_Endpoint returns `{ licensed: true }`, THE Mobile_App SHALL proceed to the dashboard normally.
3. WHEN the License_Check_Endpoint returns `{ licensed: false }`, THE Mobile_App SHALL display the License_Gate full-screen and SHALL NOT navigate to the dashboard.
4. THE License_Gate SHALL display the message: `"Your access has been revoked. Please contact your landlord."`.
5. THE License_Gate SHALL display a "Contact Landlord" button that opens the device dialer or messaging app.
6. WHEN the License_Check_Endpoint returns an error or is unreachable, THE Mobile_App SHALL allow login to proceed (fail-open) and log the error locally.
7. THE Mobile_App SHALL display a loading indicator while the license check is in progress after successful PIN authentication.

---

### Requirement 11: Admin Tenant Licensing Page

**User Story:** As an admin, I want a dedicated page to view and manage all tenant licenses, so that I can see who is active, revoke access, and re-activate tenants from one place.

#### Acceptance Criteria

1. THE Admin_Licensing_Page SHALL be accessible at `/dashboard/licensing/tenants` and SHALL be protected by the existing ARMS admin authentication.
2. THE Admin_Licensing_Page SHALL display a table with one row per tenant license record, showing: tenant name, phone, unit name, location name, licensed date, last seen date, and a status badge (`Active` in green or `Revoked` in red).
3. WHEN a license record has `is_active = true`, THE Admin_Licensing_Page SHALL show a "Revoke" action button for that row.
4. WHEN the admin clicks "Revoke", THE Admin_Licensing_Page SHALL prompt for a revocation reason (required text input) before submitting.
5. WHEN the admin submits a revocation, THE Admin_Licensing_Page SHALL call the License_Check_Endpoint or a dedicated revoke endpoint, set `is_active = false`, `revoked_at = now()`, and `revoked_reason` to the entered reason.
6. WHEN a license record has `is_active = false`, THE Admin_Licensing_Page SHALL show a "Re-activate" action button for that row.
7. WHEN the admin clicks "Re-activate", THE Admin_Licensing_Page SHALL set `is_active = true`, clear `revoked_at` and `revoked_reason`, and refresh the table.
8. THE Admin_Licensing_Page SHALL display the total count of active licenses and revoked licenses as summary cards at the top of the page.
9. THE Admin_Licensing_Page SHALL support filtering the table by status (All / Active / Revoked) and searching by tenant name or phone.

---

### Requirement 12: Bulk Auto-License Button

**User Story:** As an admin, I want to license all existing active tenants in one click, so that I don't have to wait for each tenant to log in before they appear in the licensing table.

#### Acceptance Criteria

1. THE Admin_Licensing_Page SHALL display a "License All Active Tenants" button.
2. WHEN the admin clicks "License All Active Tenants", THE Admin_Licensing_Page SHALL call the Bulk_License_Endpoint.
3. THE Bulk_License_Endpoint SHALL accept `POST` requests at `/api/license/tenant-bulk-license`.
4. WHEN called, THE Bulk_License_Endpoint SHALL query all tenants with `status = 'Active'` in `arms_tenants` that do not yet have a record in `arms_tenant_licenses`, and INSERT a new active license record for each.
5. THE Bulk_License_Endpoint SHALL return `{ licensed: <count of newly created records>, skipped: <count already licensed> }`.
6. WHEN the Bulk_License_Endpoint completes, THE Admin_Licensing_Page SHALL display a toast notification showing the count of newly licensed tenants (e.g. "✅ 12 tenants licensed successfully").
7. WHEN all active tenants already have license records, THE Bulk_License_Endpoint SHALL return `{ licensed: 0, skipped: <total active tenant count> }` and THE Admin_Licensing_Page SHALL display "All active tenants are already licensed."
8. IF a database error occurs during bulk licensing, THEN THE Bulk_License_Endpoint SHALL return HTTP 500 with `{ error: "Bulk license failed" }`.

---

### Requirement 13: License Revoke and Re-activate API

**User Story:** As an admin, I want dedicated API endpoints for revoking and re-activating tenant licenses, so that the admin UI has a clean, secure interface for license management.

#### Acceptance Criteria

1. THE System SHALL expose a `POST /api/license/tenant-revoke` endpoint that accepts `{ tenantId, reason }`.
2. WHEN `tenantId` is valid and a license record exists, THE System SHALL set `is_active = false`, `revoked_at = now()`, and `revoked_reason` to the provided reason, then return `{ success: true }`.
3. WHEN `reason` is absent or empty, THE System SHALL return HTTP 400 with `{ error: "Revocation reason required" }`.
4. THE System SHALL expose a `POST /api/license/tenant-reactivate` endpoint that accepts `{ tenantId }`.
5. WHEN `tenantId` is valid and a license record exists with `is_active = false`, THE System SHALL set `is_active = true`, `revoked_at = null`, `revoked_reason = null`, and return `{ success: true }`.
6. WHEN `tenantId` does not correspond to an existing license record for either endpoint, THE System SHALL return HTTP 404 with `{ error: "License record not found" }`.
7. IF a database error occurs in either endpoint, THEN THE System SHALL return HTTP 500 with `{ error: "Operation failed" }`.
