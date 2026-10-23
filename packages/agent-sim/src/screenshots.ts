/** Regenerates docs/screenshots/*.png from the running apps:  pnpm --filter @poc/agent-sim screenshots */
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.POC_BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve(import.meta.dirname, '../../../docs/screenshots');

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
// Tracking is off (?__no_track / iframes) everywhere except the order page shot, which needs the live inspector.
await page.addInitScript(() => localStorage.setItem('poc.agent', JSON.stringify({ id: 'agt_noor', name: 'Noor Haddad', team: 'tier1', tenure_months: 14 })));

const shot = (name: string, fullPage = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });

await page.goto(`${BASE}/?__no_track`, { waitUntil: 'networkidle' });
await shot('01-order-queue');

// The order page *with* tracking on, to show the live inspector.
await page.goto(`${BASE}/orders/ORD-10482?src=helpdesk&ticket=T-48213&reason=wismo`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.mouse.wheel(0, 500);
await page.waitForTimeout(1200);
await page.click('[data-track-ignore] button');
await page.waitForTimeout(300);
await shot('02-order-detail-with-inspector');
await page.click('[data-track-ignore] button[aria-label="Close inspector"]');
await page.click('[data-track-id="order_header.view_events"]');
await page.waitForTimeout(500);
await shot('03-events-panel');

await page.goto(`${BASE}/insights`, { waitUntil: 'networkidle' });
await shot('04-insights-overview', true);
await page.goto(`${BASE}/insights/heatmap`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await shot('05-heatmap-clicks');
await page.click('.seg button:has-text("Time in view")');
await page.waitForTimeout(800);
await shot('06-heatmap-attention');
await page.goto(`${BASE}/insights/investigations`, { waitUntil: 'networkidle' });
const link = page.locator('tr:has-text("Arjun") a').first();
await link.click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
await shot('07-investigation-replay');
await browser.close();
console.log(`wrote ${OUT}`);
