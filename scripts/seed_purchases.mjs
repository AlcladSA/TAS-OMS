import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('--- SEEDING PURCHASES (POs and GRNs) ---');

  // Check existing POs
  const { data: existingPOs } = await sb.from('purchase_orders').select('po_no');
  console.log('Existing POs:', existingPOs.map(p => p.po_no));

  // 1. PO-2026-002: Polymer & Compound Replenishment
  console.log('Creating PO-2026-002...');
  const { data: po2No, error: e2 } = await sb.rpc('create_po', {
    p_head: {
      date: '2026-10-31',
      plant: 'PLANT-1',
      vendor: '6',
      notes: 'Monthly polymer & fire-retardant compound replenishment',
      by: 'Deepak Singhal'
    },
    p_lines: [
      { material: 2164, qty: 50000, rate: 4.20 },
      { material: 2166, qty: 40000, rate: 8.50 },
      { material: 2167, qty: 20000, rate: 2.10 }
    ]
  });
  if (e2) throw e2;
  console.log('Created:', po2No);

  const { data: po2 } = await sb.from('purchase_orders').select('id, items:po_items(id, material_id)').eq('po_no', po2No).single();
  
  // Approve PO 2
  await sb.from('purchase_orders').update({
    status: 'APPROVED',
    action_by: 'Deepak Singhal',
    action_at: new Date().toISOString()
  }).eq('id', po2.id);

  await sb.from('order_events').insert({
    by_id: '7568f13c-4880-4a32-937b-5fd8dec9d956',
    by_name: 'Deepak Singhal',
    action: 'PO approved',
    detail: po2No + ' approved for delivery'
  });

  // Partial Delivery GRN-2026-002
  const ldpeItem = po2.items.find(i => i.material_id === 2164);
  const fr3Item = po2.items.find(i => i.material_id === 2166);

  console.log('Creating GRN-2026-002 against ' + po2No + '...');
  const { data: grn2No, error: ge2 } = await sb.rpc('create_grn', {
    p_head: {
      po: String(po2.id),
      store: '11',
      date: '2026-10-31',
      invoice_no: 'INV-ACE-2026-440',
      notes: 'First delivery batch: LDPE & FR3 granules',
      by: 'Deepak Singhal'
    },
    p_lines: [
      { po_item: ldpeItem.id, qty: 25000 },
      { po_item: fr3Item.id, qty: 20000 }
    ]
  });
  if (ge2) throw ge2;
  console.log('Created GRN:', grn2No);

  const { data: grn2 } = await sb.from('grns').select('id, items:grn_items(id, qty)').eq('grn_no', grn2No).single();
  const qcLines = grn2.items.map(it => ({ id: it.id, rejected: 0, remarks: 'Verified polymer grade and purity' }));
  const { data: qcRes, error: qce } = await sb.rpc('qc_grn', {
    p_grn: grn2.id,
    p_lines: qcLines,
    p_by: 'Deepak Singhal'
  });
  if (qce) throw qce;
  console.log('QC done on ' + grn2No);

  await sb.from('order_events').insert({
    by_id: '7568f13c-4880-4a32-937b-5fd8dec9d956',
    by_name: 'Deepak Singhal',
    action: 'GRN QC done',
    detail: grn2No + ' · 45,000 KG granules accepted into Main RM Store'
  });

  // 2. PO-2026-003: New Project Coils (Pending Approval)
  console.log('Creating PO-2026-003 (Pending Approval)...');
  const { data: po3No, error: e3 } = await sb.rpc('create_po', {
    p_head: {
      date: '2026-10-31',
      plant: 'PLANT-1',
      vendor: '7',
      notes: 'Procurement order for AL7001 Exotic Silver project coils (Commercial Tower project)',
      by: 'Deepak Singhal'
    },
    p_lines: [
      { material: 680, qty: 15000, rate: 15.20 },
      { material: 2152, qty: 15000, rate: 14.10 }
    ]
  });
  if (e3) throw e3;
  console.log('Created:', po3No);

  await sb.from('order_events').insert({
    by_id: '7568f13c-4880-4a32-937b-5fd8dec9d956',
    by_name: 'Deepak Singhal',
    action: 'PO created',
    detail: po3No + ' · Ahmed Hamid Al-Mutairi Trading Co · 2 lines'
  });

  // Verify all POs and GRNs
  console.log('\n--- VERIFICATION SUMMARY ---');
  const { data: allPOs } = await sb.from('purchase_orders').select('po_no, vendor_name, status, reason');
  console.log('Purchase Orders in system:', allPOs);

  const { data: allGRNs } = await sb.from('grns').select('grn_no, store_id, status, invoice_no');
  console.log('Goods Received Notes in system:', allGRNs);
}

run().catch(console.error);
