import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/node_modules/playwright');
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const screenshotDir = 'C:/Users/Admin/.gemini/antigravity/brain/d2a7e4a7-e993-481e-ba1b-be892a2688fa';

async function capturePurchases() {
  console.log('1. Setting up admin session for purchases screenshots...');
  const cookies = [];
  const ssr = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: (list) => cookies.push(...list) }
  });
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'data@alclad.com.sa' });
  await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });

  console.log('2. Launching browser...');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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

  const pages = [
    { file: '15-purchase-orders-list.png', url: '/inventory/po', title: 'Purchase Orders List' },
    { file: '16-purchase-order-detail.png', url: '/inventory/po?view=1', title: 'PO-2026-001 Fully Received & Closed' },
    { file: '17-purchase-order-open.png', url: '/inventory/po?view=2', title: 'PO-2026-002 Approved & In-Transit' },
    { file: '18-grn-deliveries-list.png', url: '/inventory/grn', title: 'Goods Received Notes (GRN)' },
    { file: '19-grn-qc-passed.png', url: '/inventory/po?view_grn=1', title: 'GRN-2026-001 QC Inspection Passed' },
    { file: '20-inventory-with-grn.png', url: '/inventory', title: 'Raw Material Store with GRN Movements' },
    { file: '21-dashboard-procurement.png', url: '/', title: 'Dashboard Procurement Command Center' }
  ];

  for (const item of pages) {
    console.log(`Capturing ${item.title} (${item.url})...`);
    await page.goto(`http://localhost:3000${item.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${screenshotDir}/${item.file}` });
    console.log(`Saved ${item.file}`);
  }

  await browser.close();
  console.log('All purchase screenshots captured successfully!');
}

capturePurchases().catch(console.error);
