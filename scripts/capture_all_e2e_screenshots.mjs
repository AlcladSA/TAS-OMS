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
const screenshotDir = 'C:/Users/Admin/.gemini/antigravity/brain/d2a7e4a7-e993-481e-ba1b-be892a2688fa/e2e';

async function captureAll() {
  console.log('1. Setting up admin session for screenshots...');
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
    { file: '01-inventory-raw-materials.png', url: '/inventory', title: 'Inventory RM Store' },
    { file: '02-dashboard-overview.png', url: '/', title: 'Dashboard Overview' },
    { file: '03-orders-pipeline-list.png', url: '/orders', title: 'Orders Pipeline' },
    { file: '04-order-detail-completed.png', url: '/orders?view=1', title: 'Order Q-2026-001 Completed Lifecycle' },
    { file: '05-production-plan.png', url: '/production?view=1', title: 'Production Plan PLN-2026-001' },
    { file: '06-auto-issue-transfer.png', url: '/inventory/issue', title: 'Auto-Issue Transfer ISS-2026-001' },
    { file: '07-dpr-shift-output.png', url: '/production/dpr/1', title: 'Shift Output DPR-2026-001' },
    { file: '08-fg-inventory.png', url: '/production/fg', title: 'Finished Goods Inventory' },
    { file: '09-activity-audit-trail.png', url: '/admin/activity', title: 'Audit Trail and Activity Timeline' }
  ];

  for (const item of pages) {
    console.log(`Capturing ${item.title} (${item.url})...`);
    await page.goto(`http://localhost:3000${item.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${screenshotDir}/${item.file}` });
    console.log(`Saved ${item.file}`);
  }

  await browser.close();
  console.log('All screenshots captured successfully!');
}

captureAll().catch(console.error);
