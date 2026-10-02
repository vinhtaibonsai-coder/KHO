const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').trim();
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log('No Supabase credentials found');
  process.exit(1);
}

const sb = createClient(url, key);

async function main() {
  console.log('--- Checking warehouse_settings ---');
  const { data: settings, error: sErr } = await sb.from('warehouse_settings').select('*');
  console.log('settings:', settings, 'error:', sErr);

  console.log('--- Checking items with warehouse = 2026 ---');
  const { data: items2026, error: iErr } = await sb.from('warehouse_items').select('*').eq('warehouse', 2026);
  console.log('items 2026:', items2026, 'error:', iErr);

  console.log('--- Checking top 5 warehouse in items ---');
  const { data: maxItems } = await sb.from('warehouse_items').select('warehouse').order('warehouse', { ascending: false }).limit(5);
  console.log('top 5 max warehouse:', maxItems);

  // Update warehouse_settings to 31
  const { data: upSettings, error: upErr } = await sb.from('warehouse_settings').upsert({ id: 'default', total_warehouses: 31 });
  console.log('Updated warehouse_settings to 31:', upSettings, 'error:', upErr);

  // If there are items in warehouse 2026, let's delete or reassign them if needed
  if (items2026 && items2026.length > 0) {
    console.log('Deleting items with warehouse = 2026:', items2026.map(i => i.sku));
    const { error: delErr } = await sb.from('warehouse_items').delete().eq('warehouse', 2026);
    console.log('Delete result error:', delErr);
  }
}

main().catch(console.error);
