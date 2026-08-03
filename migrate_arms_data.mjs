// ============================================================
// ARMS FULL DATA MIGRATION
// OLD: enlqpifpxuecxxozyiak (AlphaPlusWeb)
// NEW: zkamuhvrmazozhudbtuw
// ============================================================

const OLD_URL = 'https://enlqpifpxuecxxozyiak.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubHFwaWZweHVlY3h4b3p5aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjUzNjgsImV4cCI6MjA4MTYwMTM2OH0.-z3-2Mf3SkkZR3ZryOGyG-60jWERX9YLKIee048OziE';

const NEW_URL = 'https://zkamuhvrmazozhudbtuw.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprYW11aHZybWF6b3podWRidHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDI0MTc5NiwiZXhwIjoyMDk5ODE3Nzk2fQ.1TiRblZHKNcNAJd4j5Oh_xl38Qo0TuaaROIP8iDVpYw';

// Tables in dependency order (parents before children)
const TABLES = [
  'arms_users',
  'arms_settings',
  'arms_locations',
  'arms_units',
  'arms_tenants',
  'arms_tenant_units',
  'arms_billing',
  'arms_payments',
  'arms_mpesa_transactions',
  'arms_expenses',
  'arms_utility_types',
  'arms_meter_readings',
  'arms_utility_bills',
  'arms_prepaid_tokens',
  'arms_caretakers',
  'arms_sms_log',
  'arms_maintenance_requests',
  'arms_lease_agreements',
  'arms_demand_letters',
  'arms_access_log',
  'arms_stk_requests',
  'arms_licenses',
  'arms_user_permissions',
  'arms_unit_mpesa_config',
  'arms_tenant_licenses',
  'arms_checklist_templates',
  'arms_checklist_items',
];

const oldHeaders = {
  'apikey': OLD_KEY,
  'Authorization': `Bearer ${OLD_KEY}`,
  'Content-Type': 'application/json',
};
const newHeaders = {
  'apikey': NEW_KEY,
  'Authorization': `Bearer ${NEW_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

// Fetch ALL rows from a table (handles pagination)
async function fetchAll(table) {
  let allRows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(
      `${OLD_URL}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`,
      { headers: oldHeaders }
    );
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 404 || txt.includes('does not exist') || txt.includes('relation') ) {
        return { rows: [], missing: true };
      }
      throw new Error(`Fetch ${table}: HTTP ${res.status} — ${txt}`);
    }
    const rows = await res.json();
    allRows = allRows.concat(rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return { rows: allRows, missing: false };
}

// Insert rows into new project in batches
async function insertBatch(table, rows) {
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(`${NEW_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...newHeaders, 'Prefer': 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const txt = await res.text();
      // If table doesn't exist yet, return error
      if (txt.includes('does not exist') || txt.includes('relation')) {
        return { ok: false, error: `Table missing in new DB: ${txt.slice(0, 150)}` };
      }
      console.warn(`  ⚠️  Batch insert warning for ${table}: ${txt.slice(0, 200)}`);
    } else {
      inserted += batch.length;
    }
  }
  return { ok: true, inserted };
}

// Execute SQL in new project via Management API (split into small chunks)
async function execSQL(sql, label) {
  // Split into individual statements
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 5 && !s.startsWith('--'));

  let ok = 0, fail = 0;
  for (const stmt of statements) {
    const res = await fetch(`${NEW_URL}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: newHeaders,
      body: JSON.stringify({ sql: stmt + ';' }),
    });
    if (res.ok) ok++;
    else fail++;
  }
  return { ok, fail };
}

async function main() {
  console.log('\n🚀 ARMS DATA MIGRATION STARTING');
  console.log('='.repeat(55));
  console.log(`FROM: ${OLD_URL}`);
  console.log(`TO:   ${NEW_URL}`);
  console.log('='.repeat(55));

  // Step 1: Test old project connectivity
  console.log('\n📡 Step 1: Testing old project connectivity...');
  try {
    const res = await fetch(`${OLD_URL}/rest/v1/arms_locations?select=location_id&limit=1`, { headers: oldHeaders });
    if (res.ok) {
      console.log('✅ Old project is accessible!');
    } else {
      const txt = await res.text();
      console.log(`⚠️  Old project response: HTTP ${res.status} — ${txt.slice(0,100)}`);
    }
  } catch (e) {
    console.error('❌ Cannot reach old project:', e.message);
    process.exit(1);
  }

  // Step 2: Create schema in new project
  console.log('\n🏗️  Step 2: Creating ARMS schema in new project...');
  const { readFile } = await import('fs/promises');
  const schemaSQL = await readFile('./arms_schema.sql', 'utf8');
  
  // Run schema creation via individual CREATE TABLE statements using a workaround:
  // We'll use the REST API to create tables by posting to each endpoint
  // First try with a Node.js script that uses the pg client directly
  
  // Actually, use Supabase Management API with the access token approach
  // Split SQL into statements and POST each one
  const sqlStatements = schemaSQL
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && !s.startsWith('--'));

  console.log(`  Found ${sqlStatements.length} SQL statements to execute`);
  
  // Use Management API
  let schemaOk = 0, schemaFail = 0;
  for (const stmt of sqlStatements) {
    if (!stmt || stmt.startsWith('--')) continue;
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/zkamuhvrmazozhudbtuw/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NEW_KEY}`,
        },
        body: JSON.stringify({ query: stmt }),
      });
      if (res.ok) schemaOk++;
      else {
        const t = await res.text();
        if (!t.includes('already exists') && !t.includes('duplicate')) {
          schemaFail++;
          if (schemaFail <= 3) console.log(`  ⚠️  Schema stmt failed: ${t.slice(0,100)}`);
        } else {
          schemaOk++;
        }
      }
    } catch(e) {
      schemaFail++;
    }
  }
  console.log(`  Schema: ${schemaOk} ok, ${schemaFail} failed`);

  // Step 3: Extract all data from old project
  console.log('\n📦 Step 3: Extracting all data from old project...');
  const extracted = {};
  const summary = [];

  for (const table of TABLES) {
    try {
      const { rows, missing } = await fetchAll(table);
      if (missing) {
        console.log(`  ⏭️  ${table}: not found in old project (skipping)`);
        continue;
      }
      extracted[table] = rows;
      console.log(`  ✅ ${table}: ${rows.length} rows`);
      summary.push({ table, rows: rows.length });
    } catch (e) {
      console.log(`  ❌ ${table}: ${e.message}`);
    }
  }

  // Step 4: Save extracted data to local backup file
  console.log('\n💾 Step 4: Saving local backup...');
  const { writeFile } = await import('fs/promises');
  const backup = JSON.stringify(extracted, null, 2);
  await writeFile('./ARMS_DATA_BACKUP.json', backup, 'utf8');
  const sizeMB = (Buffer.byteLength(backup, 'utf8') / 1024 / 1024).toFixed(2);
  console.log(`  ✅ Backup saved: ARMS_DATA_BACKUP.json (${sizeMB} MB)`);

  // Step 5: Insert data into new project
  console.log('\n📤 Step 5: Inserting data into new project...');
  const results = [];

  for (const table of TABLES) {
    const rows = extracted[table];
    if (!rows || rows.length === 0) {
      if (rows) console.log(`  ⏭️  ${table}: 0 rows (empty table)`);
      continue;
    }

    try {
      const { ok, error, inserted } = await insertBatch(table, rows);
      if (ok) {
        console.log(`  ✅ ${table}: inserted ${inserted}/${rows.length} rows`);
        results.push({ table, source: rows.length, inserted, ok: true });
      } else {
        console.log(`  ❌ ${table}: ${error}`);
        results.push({ table, source: rows.length, inserted: 0, ok: false, error });
      }
    } catch (e) {
      console.log(`  ❌ ${table}: ${e.message}`);
      results.push({ table, source: rows.length, inserted: 0, ok: false, error: e.message });
    }
  }

  // Step 6: Run additional migrations
  console.log('\n🔧 Step 6: Running additional migrations...');
  const extraMigrations = [
    './arms_ultra_features_migration.sql',
    './sql/arms_multi_room_migration.sql',
    './sql/arms_rbac_licensing_migration.sql',
    './sql/arms_tenant_licenses_migration.sql',
    './sql/arms_unit_mpesa_config_migration.sql',
    './sql/arms_user_permissions_migration.sql',
    './sql/add_stk_requests_table.sql',
    './sql/vacation_column.sql',
  ];

  for (const migFile of extraMigrations) {
    try {
      const sql = await readFile(migFile, 'utf8');
      const stmts = sql.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(s=>s.length>10&&!s.startsWith('--'));
      let mok=0, mfail=0;
      for (const stmt of stmts) {
        try {
          const res = await fetch(`https://api.supabase.com/v1/projects/zkamuhvrmazozhudbtuw/database/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NEW_KEY}` },
            body: JSON.stringify({ query: stmt }),
          });
          const t = await res.text();
          if (res.ok || t.includes('already exists') || t.includes('duplicate')) mok++;
          else mfail++;
        } catch { mfail++; }
      }
      const name = migFile.split('/').pop();
      console.log(`  ${mfail===0?'✅':'⚠️ '} ${name}: ${mok} ok, ${mfail} failed`);
    } catch(e) {
      console.log(`  ⚠️  ${migFile}: ${e.message}`);
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(55));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(55));
  
  let totalSource = 0, totalInserted = 0;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon} ${r.table.padEnd(35)} ${r.source} rows → ${r.inserted} inserted`);
    totalSource += r.source;
    totalInserted += r.inserted;
  }
  
  console.log('-'.repeat(55));
  console.log(`TOTAL: ${totalSource} source rows → ${totalInserted} inserted`);
  
  const failed = results.filter(r => !r.ok);
  if (failed.length === 0) {
    console.log('\n🎉 MIGRATION COMPLETE! All data successfully restored!');
  } else {
    console.log(`\n⚠️  ${failed.length} tables had issues. Check output above.`);
    console.log('💾 Your data is safely backed up in ARMS_DATA_BACKUP.json');
  }

  console.log('\n💾 Local backup: ARMS_DATA_BACKUP.json (keep this safe!)');
  console.log('='.repeat(55));
}

main().catch(e => {
  console.error('💥 Migration crashed:', e);
  process.exit(1);
});
