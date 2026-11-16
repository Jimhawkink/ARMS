const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        env[match[1]] = val.trim();
    }
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

(async () => {
    const tables = ['arms_billing', 'arms_payments', 'arms_tenants', 'arms_units', 'arms_locations', 'arms_penalties', 'arms_charges', 'arms_adjustments', 'arms_expenses'];
    for (const t of tables) {
        const { count, error } = await s.from(t).select('*', { count: 'exact', head: true });
        console.log(t, error ? 'MISSING: ' + error.message : `EXISTS (${count} rows)`);
    }
})();
