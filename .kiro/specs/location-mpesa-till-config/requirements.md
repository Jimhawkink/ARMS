# Requirements Document

## Introduction

ARMS (Alpha Rental Management System) manages rental properties across multiple locations (MM, RUNDA, GARDEN, SUNSHINE, AIRVIEW, ELGON 01, HIGHWAY, METIPSO, KABISOGE UPPER, KABISOGE LOWER, KABISOGE MAIN, etc.). Each location collects rent into a **different bank account**, each linked to its own M-Pesa till number and Daraja API credentials.

Currently the STK Push API route (`src/app/api/mpesa/stk-push/route.ts`) uses a single hardcoded till number (`9438697`) for all units. This is wrong — units in METIPSO, KABISOGE UPPER, KABISOGE LOWER, and KABISOGE MAIN must NOT use the MM/RUNDA/GARDEN till because that till belongs to a different bank account.

This feature introduces a **per-unit M-Pesa till configuration** stored in the database. Each unit is explicitly assigned a till. The till assignment is visible and manageable directly from the **Units page** (`/dashboard/units`). When an STK Push is triggered for a tenant, the system looks up the tenant's unit, reads that unit's assigned till credentials, and uses them. **If a unit has no till configured, the STK Push is blocked with a clear error — the system will never silently use another unit's till.** There is no cross-unit fallback and no hardcoded values anywhere in the codebase.

---

## Glossary

- **STK_Push_API**: The Next.js API route at `/api/mpesa/stk-push` that initiates M-Pesa payment prompts.
- **Unit_Till_Config**: A database record that stores the M-Pesa till number and Daraja API credentials assigned to a specific unit.
- **Unit_Till_Config_Table**: The Supabase PostgreSQL table `arms_unit_mpesa_config` that stores per-unit M-Pesa credentials, keyed by `unit_id`.
- **Units_Page**: The admin page at `/dashboard/units` that displays the full CRUD table of all rental units.
- **Till_Column**: The new "📱 Till" column added to the Units_Page table, showing the till number assigned to each unit.
- **Till_Badge**: A clickable badge in the Till_Column that displays the till number for a configured unit, or "⚠️ Till Not Configured" for an unconfigured unit.
- **Quick_Assign_Panel**: A modal panel that opens when an admin clicks a Till_Badge, allowing them to configure or change the till for that specific unit.
- **Settings_UI**: The admin settings page at `/dashboard/settings` with tab-based sections.
- **Unit_Tills_Tab**: The new tab within the Settings_UI labeled "� Unit Tills", providing a full management view for all unit till credentials.
- **Daraja_Credentials**: The set of M-Pesa API credentials required for STK Push: consumer key, consumer secret, shortcode (business shortcode for password generation), passkey, and till number (PartyB).
- **Till_Number**: The M-Pesa till number (PartyB) used in `CustomerBuyGoodsOnline` STK Push transactions.
- **Blocked_STK_Push**: An STK Push request that is rejected with HTTP 400 because the tenant's unit has no Unit_Till_Config. The system will never use another unit's till as a substitute.
- **Tenant**: A record in `arms_tenants` with a `unit_id` foreign key referencing `arms_units`.
- **Unit**: A record in `arms_units` with a `location_id` foreign key referencing `arms_locations`.
- **Admin**: An authenticated user with `user_type = 'admin'` in `arms_users`.
- **Migration_Script**: A SQL file that creates the Unit_Till_Config_Table and seeds default data.

---

## Requirements

### Requirement 1: Unit Till Config Database Table

**User Story:** As a system architect, I want a dedicated database table for per-unit M-Pesa credentials, so that each unit's till is stored independently and can be queried at payment time without any cross-unit sharing.

#### Acceptance Criteria

1. THE Migration_Script SHALL create a table named `arms_unit_mpesa_config` with columns: `config_id` (serial primary key), `unit_id` (integer, foreign key to `arms_units.unit_id` with `ON DELETE CASCADE`, unique), `till_number` (varchar 20), `shortcode` (varchar 20), `consumer_key` (text), `consumer_secret` (text), `passkey` (text), `environment` (varchar 20, default `'production'`), `active` (boolean, default true), `created_at` (timestamptz, default now()), `updated_at` (timestamptz, default now()).
2. THE Migration_Script SHALL create a unique index on `arms_unit_mpesa_config(unit_id)` to enforce one config per unit.
3. THE Migration_Script SHALL apply the same permissive RLS policy pattern used by other ARMS tables (`FOR ALL USING (true) WITH CHECK (true)`).
4. THE Migration_Script SHALL seed a default Unit_Till_Config row for every unit whose `location_id` matches the locations MM, RUNDA, GARDEN, SUNSHINE, AIRVIEW, ELGON 01, and HIGHWAY — setting their `till_number` to `9438697` and leaving `consumer_key`, `consumer_secret`, `shortcode`, and `passkey` as empty strings (to be filled by the admin).
5. WHEN the Migration_Script is run on a database where `arms_unit_mpesa_config` already exists, THE Migration_Script SHALL use `CREATE TABLE IF NOT EXISTS` and `INSERT ... ON CONFLICT DO NOTHING` to avoid errors.
6. WHEN the `arms_stk_requests` table does not have a `unit_id` column, THE Migration_Script SHALL add it as a nullable integer column with a foreign key to `arms_units(unit_id)`.

---

### Requirement 2: Unit Till Config API Endpoints

**User Story:** As a frontend developer, I want REST API endpoints to read and write per-unit M-Pesa configurations, so that both the Units page and the Settings page can load and save credentials without direct database access from the browser.

#### Acceptance Criteria

1. THE system SHALL expose a `GET /api/mpesa/unit-config` endpoint that returns all rows from `arms_unit_mpesa_config` joined with `arms_units(unit_name, location_id)` and `arms_locations(location_name)`, ordered by `location_name` then `unit_name`.
2. THE system SHALL expose a `POST /api/mpesa/unit-config` endpoint that accepts a JSON body with fields `unit_id`, `till_number`, `shortcode`, `consumer_key`, `consumer_secret`, `passkey`, and `environment`, and upserts the record into `arms_unit_mpesa_config` using `unit_id` as the conflict key.
3. WHEN a `POST /api/mpesa/unit-config` request is received with a missing `unit_id`, THE system SHALL return HTTP 400 with `{ "error": "unit_id is required" }`.
4. WHEN a `POST /api/mpesa/unit-config` request is received with a missing `till_number`, THE system SHALL return HTTP 400 with `{ "error": "till_number is required" }`.
5. WHEN a database error occurs during upsert, THE system SHALL return HTTP 500 with `{ "error": "<database error message>" }`.
6. THE `GET /api/mpesa/unit-config` endpoint SHALL mask `consumer_key`, `consumer_secret`, and `passkey` values in the response by returning only the first 6 characters followed by `"****"` when the value length exceeds 6 characters, to prevent credential exposure in browser network logs.
7. THE system SHALL expose a `GET /api/mpesa/unit-config/by-unit?unit_id=<id>` endpoint that returns the single config row (with masked credentials) for the given `unit_id`, to support the Quick_Assign_Panel on the Units_Page.

---

### Requirement 3: STK Push Credential Resolution and Blocking

**User Story:** As a system administrator, I want STK Push to use only the till configured for the tenant's specific unit, and to be blocked entirely if that unit has no till configured, so that money never goes to the wrong bank account.

#### Acceptance Criteria

1. WHEN an STK Push is initiated with a `tenantId` in the request body, THE STK_Push_API SHALL query `arms_tenants` to retrieve the tenant's `unit_id`.
2. WHEN a `unit_id` is resolved from the tenant, THE STK_Push_API SHALL query `arms_unit_mpesa_config` for a row matching that `unit_id` where `active = true`.
3. WHEN a matching Unit_Till_Config row is found with non-empty `till_number`, `consumer_key`, `consumer_secret`, `shortcode`, and `passkey`, THE STK_Push_API SHALL use those credentials for the STK Push request.
4. WHEN no matching Unit_Till_Config row is found for the tenant's unit, THE STK_Push_API SHALL return HTTP 400 with `{ "error": "Till not configured for this unit. Please configure a till in Settings → Unit Tills.", "tillNotConfigured": true }` and SHALL NOT fall back to any other unit's till or global credentials.
5. WHEN a Unit_Till_Config row exists but has an empty `till_number`, `consumer_key`, `consumer_secret`, `shortcode`, or `passkey`, THE STK_Push_API SHALL treat it as not configured and return the same HTTP 400 Blocked_STK_Push response.
6. WHEN the request body contains no `tenantId`, THE STK_Push_API SHALL use the global credentials from `arms_settings` (preserving existing test/manual STK Push behavior from the Settings page test panel only).
7. THE STK_Push_API SHALL remove the hardcoded constant `TILL_NUMBER = '9438697'` and derive the till number exclusively from the resolved Unit_Till_Config.
8. WHEN the STK Push is logged to `arms_stk_requests`, THE STK_Push_API SHALL include the `unit_id` of the resolved credentials source in the log row.
9. THE STK_Push_API SHALL log a console message indicating the unit_id and till number used for each STK Push request, to aid debugging.

---

### Requirement 4: Till Column on Units Page

**User Story:** As an admin, I want to see which M-Pesa till each unit is configured to pay to directly on the Units page, so that I can immediately identify unconfigured units and fix them.

#### Acceptance Criteria

1. THE Units_Page SHALL display a new "📱 Till" column in the units data table, positioned after the "✅ Status" column and before the "⚙️ Actions" column.
2. WHEN a unit has a configured `till_number` in `arms_unit_mpesa_config`, THE Till_Column SHALL display a green badge showing the till number (e.g., `📱 9438697`).
3. WHEN a unit has no row in `arms_unit_mpesa_config`, or its `till_number` is empty, THE Till_Column SHALL display a red badge labeled `⚠️ Till Not Configured`.
4. THE Units_Page SHALL fetch till configuration data from `GET /api/mpesa/unit-config` on page load and join it client-side with the units list by `unit_id`.
5. WHEN an admin clicks a Till_Badge in the Till_Column, THE Units_Page SHALL open the Quick_Assign_Panel for that specific unit.
6. THE Till_Column header SHALL be styled consistently with the existing column header color scheme defined in the `C` color map on the Units_Page.
7. WHEN the `GET /api/mpesa/unit-config` request fails or the table does not exist, THE Units_Page SHALL render `⚠️ Till Not Configured` badges for all units and SHALL NOT throw an unhandled error.

---

### Requirement 5: Quick-Assign Panel on Units Page

**User Story:** As an admin, I want to configure the till for a specific unit directly from the Units page, so that I can fix payment routing for individual units without leaving the units management workflow.

#### Acceptance Criteria

1. WHEN an admin clicks a Till_Badge, THE Quick_Assign_Panel SHALL open as a modal showing the unit name and its current till configuration fields: Till Number, Business Shortcode, Consumer Key (masked), Consumer Secret (masked), Passkey (masked), and Environment (dropdown: `sandbox` / `production`).
2. WHEN the Quick_Assign_Panel opens, THE Quick_Assign_Panel SHALL pre-populate fields with the current saved values fetched from `GET /api/mpesa/unit-config/by-unit?unit_id=<id>`.
3. WHEN an admin enters a till number and clicks "Save", THE Quick_Assign_Panel SHALL POST the updated values to `POST /api/mpesa/unit-config` and display a success toast on HTTP 200.
4. WHEN the save succeeds, THE Quick_Assign_Panel SHALL close and THE Units_Page SHALL refresh the till badges to reflect the updated configuration without a full page reload.
5. IF the save request returns an error, THEN THE Quick_Assign_Panel SHALL display an error toast with the error message returned by the API and SHALL remain open.
6. THE Quick_Assign_Panel SHALL display a note: "This till is specific to unit [Unit Name] only. Other units are not affected." to make clear that the configuration is per-unit.
7. THE Quick_Assign_Panel SHALL include a "Copy from Location" button that pre-fills the panel's fields with the till credentials of any other already-configured unit in the same location, as a convenience shortcut for the admin.

---

### Requirement 6: Unit Tills Settings Tab

**User Story:** As an admin, I want a dedicated settings tab to manage M-Pesa till credentials for all units in one place, so that I have a full overview and can configure any unit without going through the Units page.

#### Acceptance Criteria

1. THE Settings_UI SHALL display a new tab labeled "� Unit Tills" in the sidebar navigation alongside the existing settings tabs.
2. WHEN the "� Unit Tills" tab is selected, THE Unit_Tills_Tab SHALL load and display a configuration card for every active unit in `arms_units`, grouped by location.
3. WHEN the Unit_Tills_Tab loads, THE Unit_Tills_Tab SHALL fetch all rows from `GET /api/mpesa/unit-config` and pre-populate each unit card with its saved values.
4. THE Unit_Tills_Tab SHALL display the following editable fields for each unit card: Till Number, Business Shortcode, Consumer Key (masked), Consumer Secret (masked), Passkey (masked), and Environment (dropdown: `sandbox` / `production`).
5. WHEN an admin modifies a field in a unit card and clicks "Save" for that card, THE Unit_Tills_Tab SHALL POST the updated values to `/api/mpesa/unit-config` and display a success toast on HTTP 200.
6. IF the save request returns an error, THEN THE Unit_Tills_Tab SHALL display an error toast with the error message returned by the API.
7. THE Unit_Tills_Tab SHALL display a status badge on each unit card: "✅ Configured" when `till_number`, `consumer_key`, `consumer_secret`, `shortcode`, and `passkey` are all non-empty; "⚠️ Till Not Configured" otherwise.
8. THE Unit_Tills_Tab SHALL display a summary banner at the top showing the count of configured units out of total units (e.g., "42 of 87 units configured").
9. WHERE the admin has not yet saved credentials for a unit, THE Unit_Tills_Tab SHALL show a warning: "⚠️ STK Push is blocked for this unit until a till is configured."

---

### Requirement 7: Credential Security

**User Story:** As a system administrator, I want M-Pesa credentials stored and transmitted securely, so that API keys are not exposed in browser logs or client-side code.

#### Acceptance Criteria

1. THE Unit_Tills_Tab and THE Quick_Assign_Panel SHALL render Consumer Key, Consumer Secret, and Passkey fields as password-type inputs with show/hide toggle buttons, matching the pattern used in the existing M-Pesa STK Push settings section.
2. WHEN the admin clicks the show/hide toggle on a masked credential field, THE Unit_Tills_Tab or Quick_Assign_Panel SHALL toggle the input type between `password` and `text` for that field only.
3. THE `GET /api/mpesa/unit-config` endpoint SHALL mask credential values in the response as specified in Requirement 2.6, so that full credential values are never sent to the browser after initial save.
4. WHEN the admin opens a unit card or Quick_Assign_Panel after credentials have been saved, THE UI SHALL show an empty input with a placeholder "Enter new value to update" rather than pre-filling with the masked value.
5. THE STK_Push_API SHALL read credentials directly from the database server-side and SHALL NOT expose raw credential values in any API response.

---

### Requirement 8: Migration and Backward Compatibility

**User Story:** As a developer deploying this feature, I want the migration to be safe, so that existing STK Push test functionality from the Settings page continues to work while per-unit enforcement is applied to all tenant payments.

#### Acceptance Criteria

1. THE Migration_Script SHALL be idempotent — running it multiple times SHALL produce the same database state without errors.
2. WHEN an STK Push is triggered from the Settings page test panel (no `tenantId` in the request), THE STK_Push_API SHALL continue to use the global credentials from `arms_settings`, so that admins can still test the connection.
3. WHEN an STK Push is triggered for a tenant whose unit has no till configured, THE STK_Push_API SHALL return a clear `tillNotConfigured: true` error that the PaymentModal can display as a user-friendly message: "This unit's till is not configured yet. Please contact your administrator."

---

### Requirement 9: Data Integrity

**User Story:** As a system administrator, I want the per-unit config to stay consistent with the units table, so that deleting a unit does not leave orphaned credentials or broken till badges.

#### Acceptance Criteria

1. THE Migration_Script SHALL define the `unit_id` foreign key in `arms_unit_mpesa_config` with `ON DELETE CASCADE`, so that deleting a unit automatically removes its M-Pesa config.
2. WHEN a unit is deactivated (set `active = false` in `arms_units`), THE STK_Push_API SHALL treat that unit's config as absent and return the Blocked_STK_Push response.
3. THE `GET /api/mpesa/unit-config` endpoint SHALL only return config rows for units where `arms_units.active = true`.
4. WHEN a unit is deleted from `arms_units`, THE Units_Page SHALL no longer display that unit's row or its till badge.
