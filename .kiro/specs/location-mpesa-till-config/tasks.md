# Implementation Tasks

## Tasks

- [x] 1. Create SQL migration for arms_unit_mpesa_config table
  - Create `AlphaPlusApp/arms/sql/arms_unit_mpesa_config_migration.sql`
  - Create table `arms_unit_mpesa_config` with columns: config_id, unit_id (FK → arms_units ON DELETE CASCADE, UNIQUE), till_number, shortcode, consumer_key, consumer_secret, passkey, environment (default 'production'), active (default true), created_at, updated_at
  - Create unique index on unit_id
  - Enable RLS with permissive policy (FOR ALL USING (true) WITH CHECK (true))
  - Add nullable unit_id column to arms_stk_requests (FK → arms_units)
  - Seed till_number = '9438697' for all active units in locations MM, RUNDA, GARDEN, SUNSHINE, AIRVIEW, ELGON 01, HIGHWAY using INSERT ... SELECT ... ON CONFLICT DO NOTHING
  - Make entire script idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)

- [x] 2. Create GET and POST API routes for unit till config
  - Create `AlphaPlusApp/arms/src/app/api/mpesa/unit-config/route.ts`
  - GET handler: query arms_unit_mpesa_config joined with arms_units(unit_name, location_id) and arms_locations(location_name), ordered by location_name then unit_name, only active units; mask consumer_key, consumer_secret, passkey (first 6 chars + '****'); add is_configured boolean field (true when till_number, shortcode, consumer_key, consumer_secret, passkey all non-empty)
  - POST handler: accept { unit_id, till_number, shortcode, consumer_key, consumer_secret, passkey, environment }; validate unit_id (400 if missing) and till_number (400 if missing); upsert into arms_unit_mpesa_config on conflict(unit_id); set updated_at = NOW()
  - Create `AlphaPlusApp/arms/src/app/api/mpesa/unit-config/by-unit/route.ts`
  - GET handler: accept unit_id query param; return single config row with masked credentials; return 404 if not found

- [x] 3. Update STK Push route to use per-unit till config
  - Edit `AlphaPlusApp/arms/src/app/api/mpesa/stk-push/route.ts`
  - Remove the hardcoded constant `const TILL_NUMBER = '9438697'`
  - When tenantId is present in request body: query arms_tenants for unit_id; query arms_unit_mpesa_config for that unit_id where active=true; if no row found OR any of till_number/consumer_key/consumer_secret/shortcode/passkey is empty → return HTTP 400 { error: 'Till not configured for this unit. Please configure a till in Settings → Unit Tills.', tillNotConfigured: true }; otherwise use unit config credentials
  - When tenantId is NOT present (Settings test panel): use global arms_settings credentials as before
  - Update arms_stk_requests insert to include unit_id from resolved tenant
  - Add console.log showing unit_id and till number used (or 'global test' when no tenantId)

- [x] 4. Add Till column and Quick-Assign Panel to Units page
  - Edit `AlphaPlusApp/arms/src/app/dashboard/units/page.tsx`
  - Add till color entry to the C color map: `till: { bg: '#fdf4ff', text: '#7e22ce', head: '#f3e8ff' }`
  - Add state: `tillConfigs` (Record<number, any>), `quickAssignUnit` (any | null)
  - On page load, fetch GET /api/mpesa/unit-config and build a map keyed by unit_id; handle fetch errors gracefully (empty map, no crash)
  - Add "📱 Till" column header after "✅ Status" column using C.till colors
  - In each table row, add Till cell with TillBadge: green badge showing till number if configured, red "⚠️ Till Not Configured" badge if not; clicking badge sets quickAssignUnit to that unit
  - Create QuickAssignPanel component (modal): shows unit name + location, note "This till is specific to [unit] only. Other units are not affected.", fields for till_number, shortcode, consumer_key (password input + show/hide), consumer_secret (password input + show/hide), passkey (password input + show/hide), environment dropdown; on open fetch by-unit endpoint to pre-populate till_number/shortcode/environment (never pre-fill masked secrets); Save button POSTs to /api/mpesa/unit-config; on success refresh tillConfigs and close panel; "Copy from Location" button pre-fills from first configured unit in same location
  - Render QuickAssignPanel when quickAssignUnit is not null

- [x] 5. Add Unit Tills tab to Settings page
  - Edit `AlphaPlusApp/arms/src/app/dashboard/settings/page.tsx`
  - Add new entry to settingGroups array: key 'unit_tills', title 'Unit Tills', emoji '📱', color '#7c3aed', description 'Configure M-Pesa till per unit. STK Push is blocked for unconfigured units.'
  - Create UnitTillsPanel component that renders when activeTab === 'unit_tills' (instead of the standard field grid)
  - UnitTillsPanel: fetch GET /api/mpesa/unit-config on mount; show summary banner "X of Y units configured"; group unit cards by location_name; each card shows unit name, status badge (✅ Configured / ⚠️ Till Not Configured in red), editable fields (till_number, shortcode, consumer_key/secret/passkey as password inputs with show/hide, environment dropdown); per-card Save button POSTs to /api/mpesa/unit-config with success/error toast; warning on unconfigured cards: "⚠️ STK Push is blocked for this unit until a till is configured."
  - Render UnitTillsPanel in the settings panel area when activeTab === 'unit_tills'

- [x] 6. Handle tillNotConfigured error in useStkPush hook and PaymentModal
  - Edit `AlphaPlusApp/arms/src/hooks/useStkPush.ts`
  - When STK Push API returns tillNotConfigured: true in the response body, set error state to 'This unit\'s till is not configured yet. Please contact your administrator to configure it in Settings → Unit Tills.'
  - Edit `AlphaPlusApp/arms/src/components/StkPushSection.tsx` (or PaymentModal if StkPushSection doesn't exist)
  - Display the tillNotConfigured error prominently with a red alert box and a link/note directing admin to Settings → Unit Tills
