import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Fetching stores and materials...');
  const { data: stores } = await sb.from('stores').select('*');
  const rmStore = stores.find(s => s.type === 'RM');
  if (!rmStore) throw new Error('No RM store found!');
  console.log(`Target RM Store: [${rmStore.id}] ${rmStore.name} (${rmStore.code}, ${rmStore.plant_code})`);

  let all = [], from = 0, step = 1000;
  while (true) {
    const { data } = await sb.from('materials').select('*').range(from, from + step - 1);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  console.log(`Loaded ${all.length} materials from catalog.`);

  // Group materials
  const lines = [];

  // 1. Bottom Coils: Add generous stock for all 22 bottom coils
  const bottomCoils = all.filter(m => m.kind === 'BOTTOM_COIL');
  bottomCoils.forEach(m => {
    lines.push({
      store: rmStore.id,
      material: m.id,
      qty: 15000, // 15,000 kg each (~7-8 full master coils)
      note: 'Sample stock: Bottom Coil ' + m.code
    });
  });

  // 2. Core Granules & Fillers
  const coreGranules = all.filter(m => m.kind === 'CORE' && m.uom === 'KG');
  coreGranules.forEach(m => {
    lines.push({
      store: rmStore.id,
      material: m.id,
      qty: 30000, // 30,000 kg each
      note: 'Sample stock: Core Granule ' + (m.name || m.code)
    });
  });

  // 3. Other additives (Calcium compound, Desiccant masterbatch, Calcium powder)
  const otherAdditives = all.filter(m => m.kind === 'OTHER' && m.uom === 'KG');
  otherAdditives.forEach(m => {
    lines.push({
      store: rmStore.id,
      material: m.id,
      qty: 20000, // 20,000 kg each
      note: 'Sample stock: Additive ' + (m.name || m.code)
    });
  });

  // 4. Solid Core Sheets (M2)
  const coreSheets = all.filter(m => m.kind === 'CORE' && m.uom === 'M2');
  coreSheets.forEach(m => {
    lines.push({
      store: rmStore.id,
      material: m.id,
      qty: 5000, // 5,000 m2 each
      note: 'Sample stock: Core Sheet ' + (m.name || m.code)
    });
  });

  // 5. Adhesive Films
  const adhesives = all.filter(m => m.kind === 'ADHESIVE');
  adhesives.forEach(m => {
    lines.push({
      store: rmStore.id,
      material: m.id,
      qty: 8000, // 8,000 kg each
      note: 'Sample stock: Adhesive Film ' + (m.name || m.code)
    });
  });

  // 6. Protective / Masking Films
  const masking = all.filter(m => m.kind === 'MASKING');
  masking.forEach(m => {
    lines.push({
      store: rmStore.id,
      material: m.id,
      qty: 25000, // 25,000 m2 each
      note: 'Sample stock: Masking Film ' + (m.name || m.code)
    });
  });

  // 7. Top Coils: Key colors across standard thicknesses & widths
  // AL4001 (Industrial Ash), AL7001 (Exotic Silver), AL3003 (Pure White), AL3010 (Beige), AL9022 (American Walnut), RAL7001H (Silver Grey)
  const popularColors = ['AL4001', 'AL7001', 'AL3003', 'AL3010', 'AL9022', 'RAL7001H'];
  const topCoils = all.filter(m => m.kind === 'TOP_COIL' && popularColors.includes(m.color_code));
  topCoils.forEach(m => {
    lines.push({
      store: rmStore.id,
      material: m.id,
      qty: 10000, // 10,000 kg each (~5 coils)
      note: 'Sample stock: Top Coil ' + m.code
    });
  });

  console.log(`Prepared ${lines.length} opening inventory lines.`);
  console.log('Breakdown:');
  console.log(`- Bottom Coils: ${bottomCoils.length} lines`);
  console.log(`- Core Granules: ${coreGranules.length} lines`);
  console.log(`- Additives/Fillers: ${otherAdditives.length} lines`);
  console.log(`- Core Sheets: ${coreSheets.length} lines`);
  console.log(`- Adhesive Films: ${adhesives.length} lines`);
  console.log(`- Masking Films: ${masking.length} lines`);
  console.log(`- Top Coils: ${topCoils.length} lines`);

  // Post opening stock via RPC
  console.log('\nCalling post_adjustment (OPENING)...');
  const { data: docNo, error: rpcErr } = await sb.rpc('post_adjustment', {
    p_type: 'OPENING',
    p_date: '2026-10-31',
    p_lines: lines,
    p_by: 'Deepak Singhal'
  });

  if (rpcErr) {
    console.error('RPC Error:', rpcErr);
    // If opening stock was already posted for any material, fallback to ADJUST or inspect
    return;
  }

  console.log(`\nSUCCESS! Created Opening Stock Document: ${docNo}`);

  // Query stock_moves to verify
  const { count: moveCount } = await sb.from('stock_moves').select('*', { count: 'exact', head: true });
  console.log(`Total stock moves in database: ${moveCount}`);

  const { data: summary } = await sb.from('stock_moves').select('qty, material:materials(kind, uom)').eq('store_id', rmStore.id);
  const totals = {};
  summary.forEach(r => {
    const key = `${r.material?.kind} (${r.material?.uom})`;
    totals[key] = (totals[key] || 0) + Number(r.qty);
  });
  console.log('Inventory summary by category:', totals);
}

run().catch(console.error);
