# Design Document: Per-Unit M-Pesa Till Configuration

## Overview

This feature introduces a `arms_unit_mpesa_config` table that stores M-Pesa Daraja credentials per unit. Each unit is independently assigned a till number. The till assignment is visible on the Units page via a "📱 Till" column. STK Push for a tenant whose unit has no till configured is **blocked** — the system never silently uses another unit's till.

---

## Architecture

### Data Flow

```
STK Push Request (tenantId)
        │
        ▼
  arms_tenants → unit_id
        │
        ▼
  arms_unit_mpesa_config (WHERE unit_id = ? AND active = true)
        │
   ┌────┴────┐
   │         │
Found &    Not found /
complete   incomplete
   │         │
   ▼         ▼
Use unit   HTTP 400
till       tillNotConfigured: true
creds      (BLOCKED — no fallback)
```

No `tenantId` in request (Settings test panel) → use global `arms_settings` credentials.

---

## Database Schema

### New Table: `arms_unit_mpesa_config`

```sql
CREATE TABLE IF NOT EXISTS arms_unit_mpesa_config (
    config_id     SERIAL PRIMARY KEY,
    unit_id       INTEGER UNIQUE NOT NULL
                  REFERENCES arms_units(unit_id) ON DELETE CASCADE,
    till_number   VARCHAR(20)  DEFAULT '',
    shortcode     VARCHAR(20)  DEFAULT '',
    consumer_key  TEXT         DEFAULT '',
    consumer_secret TEXT       DEFAULT '',
    passkey       TEXT         DEFAULT '',
    environment   VARCHAR(20)  DEFAULT 'production',
    active        BOOLEAN      DEFAULT true,
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_mpesa_config_unit
    ON arms_unit_mpesa_config(unit_id);

ALTER TABLE arms_unit_mpesa_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow all arms_unit_mpesa_config"
        ON arms_unit_mpesa_config FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

### Migration: Add `unit_id` to `arms_stk_requests`

```sql
ALTER TABLE arms_stk_requests
    ADD COLUMN IF NOT EXISTS unit_id INTEGER
    REFERENCES arms_units(unit_id);
```

### Seed Data

```sql
-- Seed till 9438697 for all units in MM, RUNDA, GARDEN, SUNSHINE, AIRVIEW, ELGON 01, HIGHWAY
INSERT INTO arms_unit_mpesa_config (unit_id, till_number, environment)
SELECT u.unit_id, '9438697', 'production'
FROM arms_units u
JOIN arms_locations l ON l.location_id = u.location_id
WHERE l.location_name IN ('MM','RUNDA','GARDEN','SUNSHINE','AIRVIEW','ELGON 01','HIGHWAY')
  AND u.active = true
ON CONFLICT (unit_id) DO NOTHING;
```

---

## API Routes

### `GET /api/mpesa/unit-config`

Returns all unit configs joined with unit and location names. Credentials are masked.

**Response:**
```json
[
  {
    "config_id": 1,
    "unit_id": 12,
    "unit_name": "Room A1",
    "location_name": "MM",
    "till_number": "9438697",
    "shortcode": "603***",
    "consumer_key": "abc123****",
    "consumer_secret": "xyz789****",
    "passkey": "bfb279****",
    "environment": "production",
    "active": true,
    "is_configured": true
  }
]
```

`is_configured` = `true` when `till_number`, `shortcode`, `consumer_key`, `consumer_secret`, and `passkey` are all non-empty.

### `POST /api/mpesa/unit-config`

Upserts a unit's till config.

**Request body:**
```json
{
  "unit_id": 12,
  "till_number": "9438697",
  "shortcode": "603123",
  "consumer_key": "...",
  "consumer_secret": "...",
  "passkey": "...",
  "environment": "production"
}
```

**Validation errors (HTTP 400):**
- Missing `unit_id` → `{ "error": "unit_id is required" }`
- Missing `till_number` → `{ "error": "till_number is required" }`

### `GET /api/mpesa/unit-config/by-unit?unit_id=<id>`

Returns single unit config (masked) for the Quick-Assign Panel.

---

## STK Push Route Changes (`/api/mpesa/stk-push`)

### Before (hardcoded)
```typescript
const TILL_NUMBER = '9438697'; // ❌ hardcoded
```

### After (dynamic per-unit)
```typescript
// 1. Resolve unit config when tenantId is provided
let tillNumber: string;
let consumerKey: string;
let consumerSecret: string;
let shortcode: string;
let passkey: string;

if (tenantId) {
    // Fetch tenant's unit_id
    const { data: tenant } = await supabase
        .from('arms_tenants')
        .select('unit_id')
        .eq('tenant_id', tenantId)
        .single();

    if (!tenant?.unit_id) {
        return NextResponse.json(
            { error: 'Tenant unit not found', tillNotConfigured: true },
            { status: 400 }
        );
    }

    // Fetch unit's till config
    const { data: unitConfig } = await supabase
        .from('arms_unit_mpesa_config')
        .select('*')
        .eq('unit_id', tenant.unit_id)
        .eq('active', true)
        .single();

    const isComplete = unitConfig?.till_number && unitConfig?.consumer_key
        && unitConfig?.consumer_secret && unitConfig?.shortcode && unitConfig?.passkey;

    if (!isComplete) {
        return NextResponse.json(
            {
                error: 'Till not configured for this unit. Please configure a till in Settings → Unit Tills.',
                tillNotConfigured: true
            },
            { status: 400 }
        );
    }

    tillNumber   = unitConfig.till_number;
    consumerKey  = unitConfig.consumer_key;
    consumerSecret = unitConfig.consumer_secret;
    shortcode    = unitConfig.shortcode;
    passkey      = unitConfig.passkey;
    console.log(`📱 STK Push → Unit: ${tenant.unit_id}, Till: ${tillNumber}`);

} else {
    // No tenantId = Settings test panel → use global credentials
    [consumerKey, consumerSecret, shortcode, passkey] = await Promise.all([
        getSetting('mpesa_consumer_key'),
        getSetting('mpesa_consumer_secret'),
        getSetting('mpesa_shortcode'),
        getSetting('mpesa_passkey'),
    ]);
    tillNumber = shortcode; // For test panel, PartyB = shortcode
    console.log(`📱 STK Push (test) → Global credentials`);
}
```

---

## Units Page Changes

### New "📱 Till" Column

Added to the `C` color map:
```typescript
till: { bg: '#fdf4ff', text: '#7e22ce', head: '#f3e8ff' },
```

Column header added after "✅ Status":
```tsx
{ label: '📱 Till', col: C.till }
```

### Till Badge Component

```tsx
function TillBadge({ unitId, tillConfigs, onClick }: {
    unitId: number;
    tillConfigs: Record<number, any>;
    onClick: () => void;
}) {
    const config = tillConfigs[unitId];
    const configured = config?.till_number && config.till_number.length > 0;

    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap transition hover:opacity-80 ${
                configured
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-red-50 text-red-700 border-red-200'
            }`}
        >
            {configured ? `📱 ${config.till_number}` : '⚠️ Till Not Configured'}
        </button>
    );
}
```

### Quick-Assign Panel

A modal that opens when an admin clicks a Till Badge:

```tsx
interface QuickAssignPanelProps {
    unit: any;
    onClose: () => void;
    onSaved: () => void;
}

function QuickAssignPanel({ unit, onClose, onSaved }: QuickAssignPanelProps) {
    const [form, setForm] = useState({
        till_number: '', shortcode: '', consumer_key: '',
        consumer_secret: '', passkey: '', environment: 'production'
    });
    const [saving, setSaving] = useState(false);
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

    useEffect(() => {
        // Load existing config (masked)
        fetch(`/api/mpesa/unit-config/by-unit?unit_id=${unit.unit_id}`)
            .then(r => r.json())
            .then(d => {
                if (d.config_id) {
                    setForm({
                        till_number: d.till_number || '',
                        shortcode: d.shortcode || '',
                        consumer_key: '',   // never pre-fill masked secrets
                        consumer_secret: '',
                        passkey: '',
                        environment: d.environment || 'production',
                    });
                }
            });
    }, [unit.unit_id]);

    const handleSave = async () => {
        setSaving(true);
        const res = await fetch('/api/mpesa/unit-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unit_id: unit.unit_id, ...form }),
        });
        const data = await res.json();
        if (res.ok) {
            toast.success(`✅ Till configured for ${unit.unit_name}`);
            onSaved();
            onClose();
        } else {
            toast.error(data.error || 'Failed to save');
        }
        setSaving(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
                    <div>
                        <h2 className="text-base font-bold text-white">📱 Configure Till</h2>
                        <p className="text-xs text-purple-200 mt-0.5">{unit.unit_name} · {unit.arms_locations?.location_name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-white/20 text-white"><FiX size={16} /></button>
                </div>

                {/* Note */}
                <div className="mx-6 mt-4 px-3 py-2 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-700">
                    ℹ️ This till is specific to <strong>{unit.unit_name}</strong> only. Other units are not affected.
                </div>

                {/* Fields */}
                <div className="p-6 space-y-4">
                    {/* Till Number, Shortcode, Environment, Consumer Key, Consumer Secret, Passkey */}
                    {/* ... standard input fields with show/hide for secrets ... */}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t flex justify-between">
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button onClick={handleSave} disabled={saving} className="btn-primary">
                        {saving ? 'Saving…' : 'Save Till Config'}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

---

## Settings Page Changes

### New "📱 Unit Tills" Tab

Added to `settingGroups` array:
```typescript
{
    key: 'unit_tills',
    title: 'Unit Tills',
    emoji: '📱',
    color: '#7c3aed',
    description: 'Configure M-Pesa till credentials per unit. STK Push is blocked for unconfigured units.',
}
```

The tab renders a custom `UnitTillsPanel` component (not the standard field grid) that:
1. Fetches `GET /api/mpesa/unit-config` on mount
2. Groups unit cards by location name
3. Shows summary banner: "X of Y units configured"
4. Each unit card shows: unit name, status badge (✅ Configured / ⚠️ Till Not Configured), editable fields
5. Per-card "Save" button POSTs to `/api/mpesa/unit-config`
6. "Copy from Location" button pre-fills from another configured unit in the same location

---

## PaymentModal Error Handling

When STK Push returns `tillNotConfigured: true`, the `useStkPush` hook surfaces a user-friendly message:

```typescript
if (data.tillNotConfigured) {
    setError('This unit\'s till is not configured yet. Please contact your administrator.');
    return;
}
```

The `StkPushSection` component displays this error prominently so the tenant/admin knows why the push failed.

---

## File Changes Summary

| File | Change |
|------|--------|
| `sql/arms_unit_mpesa_config_migration.sql` | New — creates table, seeds data |
| `src/app/api/mpesa/unit-config/route.ts` | New — GET all, POST upsert |
| `src/app/api/mpesa/unit-config/by-unit/route.ts` | New — GET single by unit_id |
| `src/app/api/mpesa/stk-push/route.ts` | Modified — remove hardcoded till, add unit config resolution |
| `src/app/dashboard/units/page.tsx` | Modified — add Till column, TillBadge, QuickAssignPanel |
| `src/app/dashboard/settings/page.tsx` | Modified — add Unit Tills tab with UnitTillsPanel |
| `src/hooks/useStkPush.ts` | Modified — handle tillNotConfigured error |

---

## Correctness Properties

1. **No cross-unit till leakage**: For any STK Push with a `tenantId`, the till used MUST match `arms_unit_mpesa_config.till_number` for that tenant's `unit_id`. It MUST NOT equal any other unit's till number.

2. **Block on missing config**: For any STK Push where `arms_unit_mpesa_config` has no row for the tenant's `unit_id`, the API MUST return HTTP 400 with `tillNotConfigured: true`.

3. **Block on incomplete config**: For any STK Push where the unit's config row has an empty `till_number`, `consumer_key`, `consumer_secret`, `shortcode`, or `passkey`, the API MUST return HTTP 400 with `tillNotConfigured: true`.

4. **Badge accuracy**: For any unit displayed on the Units page, the Till badge MUST show green with the till number if and only if `arms_unit_mpesa_config` has a complete row for that `unit_id`. Otherwise it MUST show red "⚠️ Till Not Configured".

5. **Idempotent migration**: Running the migration SQL multiple times MUST produce the same database state as running it once.
