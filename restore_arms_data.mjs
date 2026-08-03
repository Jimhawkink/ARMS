// ============================================================
// ARMS DATA RESTORE SCRIPT
// Reads local backup JSON and inserts into new Supabase project
// New Project: zkamuhvrmazozhudbtuw
// ============================================================

import { readFileSync } from 'fs';

const NEW_URL = 'https://zkamuhvrmazozhudbtuw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprYW11aHZybWF6b3podWRidHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDI0MTc5NiwiZXhwIjoyMDk5ODE3Nzk2fQ.1TiRblZHKNcNAJd4j5Oh_xl38Qo0TuaaROIP8iDVpYw';

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
};

// ─── Load Backup ───────────────────────────────────────────
console.log('\n📂 Loading backup file...');
let backup;
try {
  backup = JSON.parse(readFileSync('./ARMS_DATA_BACKUP.json', 'utf-8'));
  console.log('✅ Backup loaded successfully\n');
} catch (e) {
  console.error('❌ Could not read ARMS_DATA_BACKUP.json:', e.message);
  process.exit(1);
}

// ─── Insert Rows ───────────────────────────────────────────
async function insertBatch(table, rows) {
  const res = await fetch(`${NEW_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err };
  }
  return { ok: true };
}

async function insertTable(table, rows) {
  if (!rows || rows.length === 0) {
    console.log(`  ⏭️  ${table}: no rows to insert`);
    return 0;
  }

  let inserted = 0;
  const batchSize = 100;
  const batches = Math.ceil(rows.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const batch = rows.slice(i * batchSize, (i + 1) * batchSize);
    const result = await insertBatch(table, batch);
    if (result.ok) {
      inserted += batch.length;
      process.stdout.write(`\r  📤 ${table}: inserting... ${inserted}/${rows.length}`);
    } else {
      console.log(`\n  ❌ ${table} batch ${i + 1} failed: ${result.error}`);
      return inserted;
    }
  }
  console.log(`\r  ✅ ${table}: ${inserted}/${rows.length} rows inserted             `);
  return inserted;
}

// ─── Test connectivity ──────────────────────────────────────
async function testConnectivity() {
  console.log('📡 Testing new project connectivity...');
  try {
    const res = await fetch(`${NEW_URL}/rest/v1/arms_users?limit=1`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    if (res.ok) {
      console.log('✅ New project is accessible and arms_users table EXISTS!\n');
      return true;
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.code === 'PGRST205' || err.message?.includes('schema cache')) {
        console.log('⚠️  New project accessible but ARMS tables not found.\n');
        console.log('══════════════════════════════════════════════════════════');
        console.log('  ACTION REQUIRED: Create the schema in Supabase first!');
        console.log('══════════════════════════════════════════════════════════');
        console.log('  1. Go to: https://supabase.com/dashboard/project/zkamuhvrmazozhudbtuw/sql/new');
        console.log('  2. Open and run: MASTER_MIGRATION.sql');
        console.log('  3. Re-run this script after the schema is created');
        console.log('══════════════════════════════════════════════════════════\n');
        process.exit(1);
      }
      console.log('❌ Cannot access new project:', JSON.stringify(err));
      return false;
    }
  } catch (e) {
    console.error('❌ Connection failed:', e.message);
    return false;
  }
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('=======================================================');
  console.log('🚀 ARMS DATA RESTORE');
  console.log('=======================================================\n');

  const ok = await testConnectivity();
  if (!ok) process.exit(1);

  // Tables in dependency order
  const TABLE_ORDER = [
    'arms_users',
    'arms_settings',
    'arms_locations',
    'arms_units',
    'arms_tenants',
    'arms_billing',
    'arms_payments',
    'arms_mpesa_transactions',
    'arms_expenses',
    'arms_utility_types',
    'arms_meter_readings',
    'arms_utility_bills',
    'arms_prepaid_tokens',
    'arms_caretakers',
    'arms_demand_letters',
    'arms_stk_requests',
    'arms_licenses',
    'arms_unit_mpesa_config',
    'arms_tenant_licenses',
    'arms_checklist_templates',
    'arms_checklist_items',
  ];

  console.log('📤 Inserting data into new project...\n');
  const summary = [];
  let totalInserted = 0;
  let totalSource = 0;

  for (const table of TABLE_ORDER) {
    const rows = backup[table] || [];
    totalSource += rows.length;
    const inserted = await insertTable(table, rows);
    totalInserted += inserted;
    summary.push({ table, source: rows.length, inserted });
  }

  console.log('\n=======================================================');
  console.log('📊 RESTORE SUMMARY');
  console.log('=======================================================');
  for (const s of summary) {
    if (s.source > 0) {
      const status = s.inserted === s.source ? '✅' : '⚠️ ';
      const pad = ' '.repeat(Math.max(0, 35 - s.table.length));
      console.log(`${status} ${s.table}${pad}${s.source} rows → ${s.inserted} inserted`);
    }
  }
  console.log('-------------------------------------------------------');
  console.log(`TOTAL: ${totalSource} source rows → ${totalInserted} inserted`);

  if (totalInserted === totalSource) {
    console.log('\n🎉 ALL DATA SUCCESSFULLY RESTORED!');
  } else {
    console.log(`\n⚠️  ${totalSource - totalInserted} rows failed. Check errors above.`);
  }
  console.log('=======================================================\n');
}

main().catch(console.error);
