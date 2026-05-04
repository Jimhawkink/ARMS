# Requirements Document

## Introduction

This feature adds three tightly integrated security and licensing layers to the ARMS (Alpha Rental Management System) web app (Next.js 14 / Supabase / TypeScript) and mobile app (React Native / Expo):

1. **Super Admin & Role-Based Access Control (RBAC)** — A single, immutable Super Admin account (Jimhawkins Korir) that bypasses all restrictions, plus enforced per-role permission gates on every sidebar item, route, and API endpoint.
2. **Ultra Machine-Locked Licensing System (Web)** — Cryptographically signed license keys (HMAC-SHA256, 256-bit entropy) permanently bound to a browser/machine fingerprint, validated on every page load, managed exclusively by the Super Admin.
3. **Ultra Machine-Locked Licensing System (Mobile APK)** — The same licensing model applied to the React Native / Expo app, bound to the Android device ID, validated against Supabase on every app startup.

The system must make unauthorized access, license forgery, and cross-machine license transfer cryptographically infeasible.

---

## Glossary

- **ARMS**: Alpha Rental Management System — the web application at `arms/` and mobile app at `arms-mobile/`.
- **Super_Admin**: The single system owner account (Jimhawkins Korir) with unrestricted access to all features and the ability to generate/manage licenses. Only one Super Admin may exist at any time.
- **Manager**: An `arms_users` role with elevated but restricted access — cannot access Settings, SMS/WhatsApp configuration, Users & Roles, or the Licensing page.
- **Caretaker**: An `arms_users` role with operational access limited to tenants, payments, utilities, and checklists.
- **Viewer**: An `arms_users` role with read-only access to reports and the dashboard.
- **License_Key**: A formatted string `ARMS-XXXX-XXXX-XXXX-XXXX-XXXX` (alphanumeric segments) carrying an HMAC-SHA256 signature, 256-bit entropy payload, client name, expiry date, allowed features, and machine fingerprint hash.
- **Machine_Fingerprint**: A deterministic hash derived from browser attributes (user agent, screen resolution, timezone, language, hardware concurrency, device memory) used to permanently bind a web license to one machine.
- **Device_ID**: The unique Android device identifier used to permanently bind a mobile license to one physical device.
- **License_Validator**: The server-side Next.js API route responsible for verifying license key authenticity, expiry, and machine binding.
- **License_Activator**: The client-side module that collects the Machine_Fingerprint, submits it with a License_Key to the License_Validator, and stores the result.
- **RBAC_Guard**: The client-side and server-side middleware that checks the logged-in user's role permissions before rendering a page or processing an API request.
- **arms_licenses**: The Supabase table storing license records (`license_id`, `license_key`, `client_name`, `expiry_date`, `machine_id`, `is_active`, `features`, `created_at`, `activated_at`).
- **arms_users**: The existing Supabase table storing ARMS staff accounts with `user_type` field (`admin`/`manager`/`caretaker`/`viewer`).
- **arms_role_permissions**: The existing Supabase table storing per-role permission flags.
- **Permission_Matrix**: The visual table on the Users & Access page showing which permissions each role has enabled or disabled.
- **License_Error_Page**: A full-screen page shown when license validation fails, displaying the reason and an activation form.
- **Expiry_Warning**: A dismissible banner shown in the dashboard sidebar when a license expires within 30 days.
- **HMAC_Secret**: A server-side environment variable (`LICENSE_HMAC_SECRET`) used to sign and verify license keys — never exposed to the client.

---

## Requirements

### Requirement 1: Super Admin Role Enforcement

**User Story:** As the system owner (Jimhawkins Korir), I want a Super Admin account that has unrestricted access to every feature in ARMS, so that I can always manage the system regardless of license or permission state.

#### Acceptance Criteria

1. THE `arms_users` table SHALL contain exactly one record where `is_super_admin = true` at any given time.
2. WHEN a user logs in and their `arms_users` record has `is_super_admin = true`, THE RBAC_Guard SHALL grant access to all routes, pages, and API endpoints without checking any other permission flags.
3. WHEN a Super_Admin session is active, THE RBAC_Guard SHALL bypass license validation checks entirely, allowing the Super_Admin to log in and operate even when the license is expired or invalid.
4. IF an attempt is made to create a second `arms_users` record with `is_super_admin = true`, THEN THE System SHALL reject the operation and return an error message: "A Super Admin already exists."
5. IF an attempt is made to delete or deactivate the Super_Admin account, THEN THE System SHALL reject the operation and return an error message: "The Super Admin account cannot be deleted or deactivated."
6. THE Super_Admin account SHALL be identified by `user_name = 'jimhawkins'` and SHALL be seeded via a SQL migration that is idempotent (safe to run multiple times).

---

### Requirement 2: Role-Based Sidebar Navigation

**User Story:** As a logged-in user, I want the sidebar to show only the menu items my role is permitted to access, so that I am not confused by links to pages I cannot use.

#### Acceptance Criteria

1. WHEN a user with role `manager` is logged in, THE Sidebar SHALL hide the following menu items: Settings, Users & Access, and Licensing.
2. WHEN a user with role `caretaker` is logged in, THE Sidebar SHALL display only: Dashboard, Tenants, Payments, Utilities, Checklists, and Bulk SMS.
3. WHEN a user with role `viewer` is logged in, THE Sidebar SHALL display only: Dashboard and Reports & Analytics.
4. WHEN a user with role `admin` or `super_admin` is logged in, THE Sidebar SHALL display all menu items including Licensing.
5. THE Sidebar SHALL derive visible items from the `arms_role_permissions` record for the logged-in user's role, loaded once at session start and cached in the React context.
6. WHEN the logged-in user's role permissions change in the database, THE Sidebar SHALL reflect the updated permissions on the next page load or session refresh.

---

### Requirement 3: Route-Level Access Protection

**User Story:** As a system administrator, I want non-authorized users who navigate directly to restricted URLs to be redirected, so that URL manipulation cannot bypass the sidebar restrictions.

#### Acceptance Criteria

1. WHEN a user with role `manager` navigates directly to `/dashboard/settings`, `/dashboard/users`, or `/dashboard/licensing`, THE RBAC_Guard SHALL redirect the user to `/dashboard` and display a toast notification: "Access denied — insufficient permissions."
2. WHEN a user with role `caretaker` navigates to any route not in their permitted set, THE RBAC_Guard SHALL redirect the user to `/dashboard`.
3. WHEN a user with role `viewer` navigates to any route not in their permitted set, THE RBAC_Guard SHALL redirect the user to `/dashboard`.
4. THE RBAC_Guard SHALL execute the permission check inside the `dashboard/layout.tsx` component before rendering any child page, using the user object stored in `localStorage` under key `arms_user`.
5. IF the `arms_user` key is absent from `localStorage`, THEN THE RBAC_Guard SHALL redirect the user to the login page (`/`).
6. THE route permission map SHALL be defined as a static configuration object in a dedicated `lib/rbac.ts` module, mapping each route prefix to the minimum required permission flag from `arms_role_permissions`.

---

### Requirement 4: Users & Access Page — Permission Matrix

**User Story:** As a Super Admin or Admin, I want the Users & Access page to display a clear permission matrix for all roles, so that I can understand and manage what each role can do.

#### Acceptance Criteria

1. THE Users_Page SHALL display a permission matrix table listing all roles as columns and all permission flags as rows, with a checkmark or cross in each cell.
2. WHEN a Super_Admin or Admin clicks a permission toggle for a non-super-admin role, THE System SHALL update the corresponding `arms_role_permissions` record in Supabase and reflect the change immediately in the UI.
3. THE `is_super_admin` permission flag SHALL be displayed as read-only in the matrix and SHALL NOT be togglable via the UI.
4. WHEN a user with role `manager`, `caretaker`, or `viewer` accesses the Users & Access page, THE RBAC_Guard SHALL redirect them to `/dashboard` (enforced by Requirement 3).
5. THE Users_Page SHALL display a role description card for each role explaining its intended use and access level.
6. THE Users_Page SHALL include a user list section showing all `arms_users` records with their assigned role, status, and last login timestamp.

---

### Requirement 5: License Key Generation

**User Story:** As the Super Admin, I want to generate cryptographically strong license keys for clients, so that each client receives a unique, unforgeable key tied to their identity and expiry date.

#### Acceptance Criteria

1. THE License_Key SHALL follow the format `ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX` where each `X` is an uppercase alphanumeric character (A–Z, 0–9), providing a minimum of 256 bits of entropy from a cryptographically secure random number generator (`crypto.getRandomValues` or Node.js `crypto.randomBytes`).
2. WHEN the Super_Admin submits the license generation form with a client name, expiry date, and feature set, THE System SHALL generate a License_Key, sign it with HMAC-SHA256 using the `LICENSE_HMAC_SECRET` environment variable, and insert a new record into `arms_licenses`.
3. THE generated License_Key SHALL embed a base64url-encoded payload containing: `client_name`, `expiry_date` (ISO 8601), `features` (JSON array), and a `nonce` (32 random bytes), followed by a truncated HMAC-SHA256 signature.
4. THE `arms_licenses` table record SHALL store: `license_key` (the full key string), `client_name`, `expiry_date`, `machine_id` (null until activated), `is_active` (false until activated), `features` (JSONB), `created_at`, and `activated_at`.
5. IF the `LICENSE_HMAC_SECRET` environment variable is not set, THEN THE License_Validator SHALL refuse to generate or validate any license and SHALL log an error: "LICENSE_HMAC_SECRET is not configured."
6. THE license generation endpoint (`POST /api/license/generate`) SHALL require a valid Super_Admin session cookie; requests without it SHALL receive HTTP 403.

---

### Requirement 6: Web Machine-Locked License Activation

**User Story:** As a client, I want to activate my license key on my machine, so that the system is permanently bound to my browser/machine and cannot be used on another machine.

#### Acceptance Criteria

1. WHEN a user submits a License_Key on the License_Error_Page, THE License_Activator SHALL compute the Machine_Fingerprint by hashing (SHA-256) the concatenation of: `navigator.userAgent`, `screen.width × screen.height`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `navigator.language`, `navigator.hardwareConcurrency`, and `navigator.deviceMemory`.
2. WHEN the License_Activator submits the License_Key and Machine_Fingerprint hash to `POST /api/license/activate`, THE License_Validator SHALL verify the HMAC signature, check that `expiry_date` is in the future, and confirm that `machine_id` in `arms_licenses` is either null (first activation) or matches the submitted fingerprint hash.
3. WHEN activation succeeds for the first time (machine_id was null), THE License_Validator SHALL update the `arms_licenses` record: set `machine_id` to the fingerprint hash, set `is_active = true`, and set `activated_at` to the current timestamp.
4. IF the submitted Machine_Fingerprint does not match the stored `machine_id` for an already-activated license, THEN THE License_Validator SHALL return HTTP 403 with error: "This license is already activated on a different machine and cannot be transferred."
5. WHEN activation succeeds, THE License_Activator SHALL store the validated license payload in `localStorage` under key `arms_license` and redirect the user to `/dashboard`.
6. THE machine binding SHALL be permanent and irreversible — no API endpoint SHALL allow changing the `machine_id` of an activated license, even for the Super_Admin.

---

### Requirement 7: Web License Validation on Every Page Load

**User Story:** As the system owner, I want the license to be validated on every page load, so that expired or tampered licenses are caught immediately.

#### Acceptance Criteria

1. WHEN any dashboard page loads, THE License_Activator SHALL call `GET /api/license/validate` with the license key stored in `localStorage`, before rendering any page content.
2. THE License_Validator SHALL verify: (a) the HMAC signature is valid, (b) `expiry_date` is in the future, (c) `machine_id` matches the current Machine_Fingerprint, and (d) `is_active = true` in `arms_licenses`.
3. IF any validation check fails, THEN THE System SHALL redirect the user to the License_Error_Page (`/license-error`) displaying the specific failure reason.
4. WHEN a Super_Admin session is active, THE License_Activator SHALL skip license validation entirely and proceed directly to the dashboard.
5. WHEN the license expiry date is within 30 days of the current date and the license is otherwise valid, THE Sidebar SHALL display a dismissible Expiry_Warning banner below the ARMS logo showing: "⚠️ License expires in X days."
6. THE license validation call SHALL complete within 2 seconds; IF it times out, THE System SHALL display the License_Error_Page with error: "License validation timed out. Check your connection."

---

### Requirement 8: Licensing Management Page (Web)

**User Story:** As the Super Admin, I want a dedicated Licensing page in the dashboard, so that I can generate, view, and manage all client licenses from one place.

#### Acceptance Criteria

1. THE Licensing_Page SHALL be accessible only to users with `is_super_admin = true`; all other roles SHALL be redirected by the RBAC_Guard.
2. THE Licensing_Page SHALL display a list of all records in `arms_licenses` showing: client name, license key (partially masked), expiry date, activation status, machine ID (partially masked), and creation date.
3. WHEN the Super_Admin fills in the license generation form (client name, expiry date, features) and clicks "Generate License", THE System SHALL call `POST /api/license/generate`, display the generated key in a copyable text field, and add the new record to the list.
4. THE Licensing_Page SHALL display the currently active license for the current machine, highlighted with its "Licensed To" name and expiry date.
5. WHEN the Super_Admin clicks "Revoke" on a license record, THE System SHALL set `is_active = false` in `arms_licenses` and the next validation call from that machine SHALL redirect to the License_Error_Page.
6. THE "Licensed To" client name from the active license SHALL appear in the sidebar below the "ARMS+" text and on printed/PDF receipts.

---

### Requirement 9: "Licensed To" Branding Display

**User Story:** As a client, I want to see my company name displayed in the ARMS sidebar and on receipts, so that the system feels personalized to my business.

#### Acceptance Criteria

1. WHEN a valid license is active, THE Sidebar SHALL display the `client_name` from the license payload below the "ARMS+" logo text, in a smaller muted font.
2. WHEN no valid license is active and the user is not a Super_Admin, THE Sidebar SHALL display "Unlicensed" in place of the client name, styled in amber/warning color.
3. WHEN a receipt or demand letter is generated, THE System SHALL include the `client_name` from the active license in the document header as the "Licensed To" field.
4. THE `client_name` SHALL be read from the validated license payload stored in `localStorage` under `arms_license`, not fetched from the database on every render.

---

### Requirement 10: Mobile App License Activation

**User Story:** As a mobile app user, I want the ARMS mobile app to require a valid license tied to my Android device, so that the app cannot be used on unauthorized devices.

#### Acceptance Criteria

1. WHEN the ARMS mobile app starts, THE Mobile_License_Validator SHALL read the Android device ID using `expo-device` or `expo-application` (`Application.androidId`) as the Device_ID.
2. WHEN no license is stored in `AsyncStorage` under key `arms_mobile_license`, THE Mobile_License_Validator SHALL display the License_Activation_Screen before showing the login screen.
3. WHEN the user submits a License_Key on the License_Activation_Screen, THE Mobile_License_Validator SHALL call `POST /api/license/activate` on the ARMS web API (`ARMS_API_BASE`) with the License_Key and Device_ID hash.
4. WHEN mobile activation succeeds, THE Mobile_License_Validator SHALL store the license payload in `AsyncStorage` under `arms_mobile_license` and proceed to the login screen.
5. WHEN the app starts and a stored license exists, THE Mobile_License_Validator SHALL call `GET /api/license/validate` to re-validate the license against the server; IF validation fails, THE Mobile_License_Validator SHALL clear `AsyncStorage` and show the License_Activation_Screen.
6. THE Login_Screen SHALL display "Licensed To: [client_name]" below the "ARMS" logo badge, reading from the stored license payload.
7. IF no valid license is found after validation, THEN THE Mobile_License_Validator SHALL display the License_Activation_Screen with error: "License invalid or expired. Contact your system administrator."

---

### Requirement 11: Security Hardening

**User Story:** As the system owner, I want all API routes and the application to follow security best practices, so that the system is resistant to common web attacks.

#### Acceptance Criteria

1. WHEN any API route under `/api/` receives a request, THE API_Route SHALL verify that a valid `arms_user` session exists (via a session token or signed cookie) before processing the request; requests without a valid session SHALL receive HTTP 401.
2. THE `next.config.js` SHALL include HTTP security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, and `Referrer-Policy: strict-origin-when-cross-origin`.
3. WHEN a login attempt fails 5 consecutive times from the same IP address within 15 minutes, THE Login_Page SHALL lock that IP for 15 minutes and return HTTP 429 with message: "Too many login attempts. Try again in 15 minutes."
4. THE System SHALL use the Supabase client's parameterized query interface for all database operations; raw SQL string interpolation with user-supplied values SHALL NOT be used anywhere in the codebase.
5. THE `LICENSE_HMAC_SECRET` environment variable SHALL be a minimum of 32 random bytes (256 bits), stored only in server-side environment variables, and SHALL NOT be included in any client-side bundle or `NEXT_PUBLIC_` prefixed variable.
6. WHEN the license key generation endpoint is called, THE License_Validator SHALL use `crypto.randomBytes(32)` (Node.js) to generate the nonce, ensuring cryptographically secure randomness.

---

### Requirement 12: Database Schema — arms_licenses Table

**User Story:** As a developer, I want a well-defined `arms_licenses` table in Supabase, so that license data is stored securely and consistently.

#### Acceptance Criteria

1. THE `arms_licenses` table SHALL have the following columns: `license_id` (UUID, primary key, default `gen_random_uuid()`), `license_key` (TEXT, unique, not null), `client_name` (TEXT, not null), `expiry_date` (DATE, not null), `machine_id` (TEXT, nullable — null until first activation), `is_active` (BOOLEAN, default false), `features` (JSONB, default `'[]'`), `created_at` (TIMESTAMPTZ, default `now()`), `activated_at` (TIMESTAMPTZ, nullable).
2. THE `arms_licenses` table SHALL have a unique index on `license_key`.
3. THE `arms_licenses` table SHALL have Row Level Security (RLS) enabled; only the Supabase service role key (used server-side) SHALL have INSERT, UPDATE, and SELECT permissions; the anon key SHALL have no direct access.
4. THE `arms_users` table SHALL have an `is_super_admin` BOOLEAN column (default false) added via a migration if it does not already exist.
5. THE migration SQL file SHALL be idempotent, using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` patterns.

---

### Requirement 13: License Key Format and Entropy

**User Story:** As the system owner, I want license keys to be impossible to guess or brute-force, so that unauthorized users cannot generate valid keys.

#### Acceptance Criteria

1. THE License_Key SHALL be generated from a minimum of 32 cryptographically random bytes (256 bits of entropy) before encoding.
2. THE License_Key payload SHALL be encoded as base64url and split into groups of 8 alphanumeric characters separated by hyphens, prefixed with `ARMS-`, resulting in the format `ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX` (4 groups of 8 = 32 characters of payload).
3. THE HMAC-SHA256 signature SHALL be computed over the full payload string using the `LICENSE_HMAC_SECRET` and appended as the final segment, making the total key format: `ARMS-[payload-group-1]-[payload-group-2]-[payload-group-3]-[payload-group-4]-[hmac-truncated-8-chars]`.
4. THE License_Validator SHALL reject any key where the HMAC verification fails, returning HTTP 400 with error: "Invalid license key — signature verification failed."
5. FOR ALL valid license keys generated by the system, decoding the payload and re-signing with the same `LICENSE_HMAC_SECRET` SHALL produce the same HMAC signature (round-trip integrity property).
