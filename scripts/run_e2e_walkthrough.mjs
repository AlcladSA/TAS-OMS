import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/node_modules/playwright');
import fs from 'fs';
import { calcDprBOM } from '../lib/bom.js';
import { calcM2, totals } from '../lib/tas.js';

// Read .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const screenshotDir = 'C:/Users/Admin/.gemini/antigravity/brain/d2a7e4a7-e993-481e-ba1b-be892a2688fa/e2e';

async function main() {
  console.log('=== STARTING COMPLETE E2E TEST WALKTHROUGH ===\n');

  // 1. Setup Auth Session
  console.log('1. Authenticating as Deepak Singhal (admin)...');
  const cookies = [];
  const ssr = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: (list) => cookies.push(...list) }
  });
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'data@alclad.com.sa' });
  await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });

  // 2. Launch Browser
  console.log('2. Launching Microsoft Edge via Playwright...');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  await context.addCookies(cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: 'localhost',
    path: '/',
    httpOnly: c.options?.httpOnly ?? true,
    secure: c.options?.secure ?? false,
    sameSite: 'Lax'
  })));
  const page = await context.newPage();

  async function snap(filename, pathUrl, delay = 1000) {
    console.log(`Navigating to ${pathUrl} -> capturing ${filename}...`);
    await page.goto(`http://localhost:3000${pathUrl}`, { waitUntil: 'networkidle' });
    if (delay) await page.waitForTimeout(delay);
    await page.screenshot({ path: `${screenshotDir}/${filename}` });
    console.log(`Saved ${filename}`);
  }

  // Step 1: Inventory Stocked View
  await snap('01-inventory-stocked.png', '/inventory');

  // Step 2: Clean Dashboard
  await snap('02-dashboard-clean.png', '/');

  // Step 3: Create Quotation Q-2026-001
  console.log('\n3. Creating Quotation for Abdullah Muhammad Al Harbi Trading Est...');
  const { data: cust } = await admin.from('customers').select('*').eq('id', 1).single();
  const quoteItem = {
    brand: 'ALUMAX',
    grade: 'AL4025',
    color_code: 'AL4001',
    color_name: 'Industrial Ash',
    core: 'NFR',
    skin: 0.2,
    width: 1250,
    length: 2450,
    thickness: 4,
    qty: 100,
    price: 85,
    m2: calcM2(1250, 2450, 100),
    total: 100 * (1.25 * 2.45) * 85,
    item_no: 1,
    description: 'ALUMAX-AL4025-AL4001-1250x2450x4MM'
  };

  const snapshot = (c) => ({
    customer_id: c.id,
    customer_code: c.code,
    customer_name: c.name,
    address: c.country && !(c.address || '').includes(c.country) ? [c.address, c.country].filter(Boolean).join(', ') : c.address,
    cr_no: c.cr_no,
    vat_no: c.vat_no,
    contact_no: c.mobile,
  });

  const quoteNo = 'Q-2026-001';
  const { data: order, error: orderErr } = await admin.from('orders').insert({
    quote_no: quoteNo,
    quote_date: '2026-10-31',
    ...snapshot(cust),
    salesperson_name: 'Deepak Singhal',
    vat_rate: 0.15,
    transport: 500,
    notes: 'Urgent order for Riyadh commercial tower project.',
    status: 'PENDING',
    created_by: '7568f13c-4880-4a32-937b-5fd8dec9d956'
  }).select().single();
  if (orderErr) throw orderErr;

  // Insert order item
  const { data: item, error: itemErr } = await admin.from('order_items').insert({
    order_id: order.id,
    item_no: 1,
    brand: quoteItem.brand,
    grade: quoteItem.grade,
    color_code: quoteItem.color_code,
    color_name: quoteItem.color_name,
    core: quoteItem.core,
    skin: quoteItem.skin,
    width: quoteItem.width,
    length: quoteItem.length,
    thickness: quoteItem.thickness,
    qty: quoteItem.qty,
    price: quoteItem.price,
    m2: quoteItem.m2,
    total: quoteItem.total,
    description: quoteItem.description,
    production_status: 'Pending'
  }).select().single();
  if (itemErr) throw itemErr;

  // Log quotation created event
  await admin.from('order_events').insert({
    order_id: order.id,
    by_id: '7568f13c-4880-4a32-937b-5fd8dec9d956',
    by_name: 'Deepak Singhal',
    action: 'Quotation created',
    detail: '1 line · Total SAR 30,510.94 (incl. VAT & Transport)'
  });

  console.log(`Created Quotation: ${quoteNo} (Order ID: ${order.id})`);
  await snap('03-quote-pending.png', `/orders?view=${order.id}`);

  // Step 4: Approve Quotation
  console.log('\n4. Approving Quotation...');
  await admin.from('orders').update({
    status: 'APPROVED',
    action_by: 'Deepak Singhal',
    action_at: new Date().toISOString(),
    dispatch_status: 'PENDING'
  }).eq('id', order.id);

  await admin.from('order_events').insert({
    order_id: order.id,
    by_id: '7568f13c-4880-4a32-937b-5fd8dec9d956',
    by_name: 'Deepak Singhal',
    action: 'Approved',
    detail: 'Quotation approved for production by Deepak Singhal'
  });

  await snap('04-quote-approved.png', `/orders?view=${order.id}`);

  // Step 5: Get or Create FG Item for Planning
  console.log('\n5. Creating Production Plan...');
  let { data: fgItem } = await admin.from('fg_items').select('*')
    .eq('brand', quoteItem.brand)
    .eq('grade', quoteItem.grade)
    .eq('color_code', quoteItem.color_code)
    .eq('width', quoteItem.width)
    .eq('length', quoteItem.length)
    .eq('thickness', quoteItem.thickness)
    .maybeSingle();

  if (!fgItem) {
    const code = `${quoteItem.brand}-${quoteItem.grade}-${quoteItem.color_code}-${quoteItem.core}-${quoteItem.skin}-${quoteItem.width}*${quoteItem.length}*${quoteItem.thickness}MM`;
    const { data: newFg } = await admin.from('fg_items').insert({
      code,
      brand: quoteItem.brand,
      grade: quoteItem.grade,
      color_code: quoteItem.color_code,
      color_name: quoteItem.color_name,
      core: quoteItem.core,
      skin: quoteItem.skin,
      width: quoteItem.width,
      length: quoteItem.length,
      thickness: quoteItem.thickness,
      b_grade: false,
      m2_per_pc: (quoteItem.width * quoteItem.length) / 1e6
    }).select().single();
    fgItem = newFg;
  }

  // Link fg_item_id to order_items
  await admin.from('order_items').update({ fg_item_id: fgItem.id }).eq('id', item.id);

  // Call create_plan RPC for ACP Line 1 (store id: 12)
  const { data: planNo, error: planErr } = await admin.rpc('create_plan', {
    p_head: {
      date: '2026-10-31',
      shift: 'DAY',
      line: 12,
      notes: `Production for order ${quoteNo} (${cust.name})`,
      by: 'Deepak Singhal'
    },
    p_lines: [{ item: fgItem.id, qty: 100 }]
  });
  if (planErr) throw planErr;

  const { data: plan } = await admin.from('production_plans').select('*').eq('plan_no', planNo).single();
  console.log(`Created Production Plan: ${planNo} (Plan ID: ${plan.id})`);

  await snap('05-production-plan-created.png', `/production?view=${plan.id}`);

  // Step 6: Auto-Issue Raw Materials from RM Store to Line
  console.log('\n6. Auto-issuing raw materials to ACP Line 1...');
  let allMats = [], from = 0;
  while (true) {
    const { data } = await admin.from('materials').select('*').range(from, from + 999);
    if (!data || !data.length) break;
    allMats.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const { data: coreSettings } = await admin.from('bom_core_settings').select('*');

  const bomCalc = calcDprBOM([{ fg_item: fgItem, good_qty: 100 }], coreSettings, allMats);
  const autoIssueLines = bomCalc.filter(r => r.material_id && r.system_qty > 0).map(r => ({
    material: r.material_id,
    qty: r.system_qty
  }));

  const { data: issNo, error: issErr } = await admin.rpc('auto_issue_plan', {
    p_plan_id: plan.id,
    p_lines: autoIssueLines,
    p_by: 'Deepak Singhal'
  });
  if (issErr) throw issErr;
  console.log(`Auto-issued raw materials with transfer: ${issNo}`);

  await snap('06-materials-issued.png', '/inventory/issue');

  // Step 7: Enter Shift Output DPR (Daily Production Report)
  console.log('\n7. Entering Shift Output DPR...');
  const { data: dprNo, error: dprErr } = await admin.rpc('create_production', {
    p_head: {
      date: '2026-10-31',
      shift: 'DAY',
      line: 12,
      plan: planNo,
      operator: 'Mahmoud Al-Harbi',
      notes: 'Line 1 running smoothly, 100 Good ACP panels completed.',
      by: 'Deepak Singhal'
    },
    p_items: [{
      item: fgItem.id,
      plan_item: null,
      good: 100,
      rejected: 0,
      reason: ''
    }],
    p_usage: [],
    p_consumption: bomCalc.map(b => ({
      layer_type: b.layer_type,
      material_id: b.material_id,
      suggested_mat_id: b.material_id,
      system_qty: b.system_qty,
      actual_qty: b.system_qty,
      uom: b.uom,
      reason: '',
      settings_snapshot: { STANDARD: { source: 'All_Finished_Goods_BOM.xlsx', grades: ['AL4025'] } }
    }))
  });
  if (dprErr) throw dprErr;

  const { data: dpr } = await admin.from('productions').select('*').eq('dpr_no', dprNo).single();
  console.log(`Created DPR: ${dprNo} (DPR ID: ${dpr.id})`);

  await snap('07-dpr-saved.png', `/production/dpr/${dpr.id}`);

  // Step 8: Quality Check (QC)
  console.log('\n8. Performing Quality Check (QC)...');
  const { data: prodItems } = await admin.from('production_items').select('*').eq('production_id', dpr.id);
  const qcLines = prodItems.map(pi => ({
    id: pi.id,
    pass: pi.good_qty,
    b: 0,
    reject: 0,
    reason: '100% Passed factory inspection'
  }));

  const { error: qcErr } = await admin.rpc('qc_production', {
    p_lines: qcLines,
    p_by: 'Deepak Singhal'
  });
  if (qcErr) throw qcErr;
  console.log('QC inspection completed: 100 PCS moved into Main FG Store (FG-01).');

  await snap('08-qc-completed.png', '/production/qc');
  await snap('09-fg-inventory.png', '/production/fg');

  // Step 9: Mark Ready for Dispatch
  console.log('\n9. Marking finished pieces ready on plant floor...');
  await admin.from('order_items').update({
    delivered_qty: 100,
    ready_qty: 100,
    production_status: 'Ready for Dispatch'
  }).eq('id', item.id);

  await admin.from('order_events').insert({
    order_id: order.id,
    by_id: '7568f13c-4880-4a32-937b-5fd8dec9d956',
    by_name: 'Deepak Singhal',
    action: 'Marked ready for dispatch',
    detail: 'Line 1: +100 PCS ready (100 total)'
  });

  await snap('10-marked-ready.png', `/orders?view=${order.id}`);

  // Step 10: Ship & Generate Delivery Order (DO)
  console.log('\n10. Shipping & Generating Delivery Order (DO)...');
  const { data: doNo, error: doErr } = await admin.rpc('generate_batch_do', {
    p_order: order.id,
    p_lines: [{ id: item.id, qty: 100, m2: quoteItem.m2 }],
    p_info: {
      date: '2026-10-31',
      vehicle_no: 'KSA 8892',
      transporter: 'Al Majdouie Logistics',
      lr_no: 'LR-2026-0044',
      driver: 'Tariq Al-Mansoor',
      transport: 500
    },
    p_by: 'Deepak Singhal'
  });
  if (doErr) throw doErr;

  console.log(`Generated Delivery Order: ${doNo}`);
  const { data: batch } = await admin.from('order_batches').select('*').eq('order_id', order.id).single();

  await admin.from('order_events').insert({
    order_id: order.id,
    by_id: '7568f13c-4880-4a32-937b-5fd8dec9d956',
    by_name: 'Deepak Singhal',
    action: 'Dispatched',
    detail: `${doNo} · 100 PCS dispatched via Al Majdouie Logistics (Vehicle KSA 8892)`
  });

  await snap('11-delivery-order-shipped.png', `/orders?view=${order.id}`);

  // Step 11: Generate Proforma Invoice (PI) & Tax Invoice
  console.log('\n11. Generating Proforma Invoice (PI)...');
  const { data: piNo, error: piErr } = await admin.rpc('generate_batch_pi', {
    p_batch: batch.id,
    p_lines: [{
      order_item_id: item.id,
      qty: 100,
      m2: quoteItem.m2,
      price: 85,
      total: quoteItem.total
    }],
    p_by: 'Deepak Singhal',
    p_note: 'Payment terms: 30% Advance, 70% before delivery'
  });
  if (piErr) throw piErr;
  console.log(`Generated Proforma Invoice: ${piNo}`);

  // Attach Tax Invoice
  console.log('Attaching Tax Invoice file...');
  const taxPath = 'invoices/2026/TAX-INV-2026-001.pdf';
  await admin.from('order_batches').update({
    tax_invoice_path: taxPath,
    tax_invoice_by: 'Deepak Singhal',
    tax_invoice_at: new Date().toISOString()
  }).eq('id', batch.id);

  await admin.from('orders').update({
    tax_invoice_path: taxPath
  }).eq('id', order.id);

  await admin.from('order_events').insert({
    order_id: order.id,
    by_id: '7568f13c-4880-4a32-937b-5fd8dec9d956',
    by_name: 'Deepak Singhal',
    action: 'Tax invoice uploaded',
    detail: `${piNo} · Attached TAX-INV-2026-001.pdf`
  });

  await snap('12-order-completed-invoiced.png', `/orders?view=${order.id}`);

  // Step 12: Final Dashboard & Activity Log
  console.log('\n12. Capturing Final Dashboard & Audit Log...');
  await snap('13-dashboard-final.png', '/');
  await snap('14-audit-trail-timeline.png', '/admin/activity');

  await browser.close();
  console.log('\n=== COMPLETE E2E TEST WALKTHROUGH SUCCEEDED! ===');
}

main().catch(err => {
  console.error('E2E Walkthrough Failed:', err);
  process.exit(1);
});
