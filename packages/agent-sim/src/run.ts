/**
 * Simulated support agents working tickets in a real (headless) browser, so every tracker
 * signal — viewability, scroll, hover, copy, tab switches, idle, rage/dead clicks — is produced
 * by the actual app code and lands in the collector exactly like a human session would.
 *
 *   pnpm simulate                       # 24 investigations, 4 at a time
 *   pnpm simulate --runs 40 --concurrency 6
 *   pnpm simulate --persona wismo_struggling --headed
 */
import { chromium, type Browser } from 'playwright';
import { SUPPORT_AGENTS, type SupportAgent } from '@poc/mock-data';
import { Agent } from './helpers.ts';
import { PERSONAS, type Persona } from './personas.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', process.env.POC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const RUNS = Number(arg('runs', '24'));
const CONCURRENCY = Number(arg('concurrency', '4'));
const SPEED = Number(arg('speed', '1'));
const ONLY = arg('persona', '');
const HEADED = process.argv.includes('--headed');

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
];

/** Who tends to do what: new tier-1 agents struggle more, B2B orders go to the B2B team. */
function pickAgent(p: Persona, i: number): SupportAgent {
  const byId = (id: string) => SUPPORT_AGENTS.find((a) => a.id === id)!;
  if (p.name === 'wismo_struggling') return byId(i % 2 ? 'agt_arjun' : 'agt_sam');
  if (p.name === 'b2b_bulk_check') return byId('agt_olivia');
  if (p.name === 'artwork_blocked') return byId(i % 2 ? 'agt_kenji' : 'agt_olivia');
  const pool = ['agt_noor', 'agt_kenji', 'agt_sam', 'agt_arjun'];
  return byId(pool[i % pool.length]);
}

/** Spread sessions over the last few working days so trends have something to show. */
function sessionStart(i: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (i % 5));
  d.setUTCHours(13 + ((i * 3) % 8), (i * 17) % 60, 0, 0);
  return d > new Date() ? new Date(Date.now() - 3_600_000) : d;
}

async function runOne(browser: Browser, persona: Persona, i: number) {
  const agentInfo = pickAgent(persona, i);
  const context = await browser.newContext({ viewport: VIEWPORTS[i % VIEWPORTS.length], locale: 'en-US', timezoneId: 'America/New_York' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  // Carrier sites etc. are out of scope (and offline in CI): stub external navigations.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>external</title>' }));
  await context.addInitScript((agent) => {
    if (!localStorage.getItem('poc.agent')) localStorage.setItem('poc.agent', JSON.stringify(agent));
  }, { id: agentInfo.id, name: agentInfo.name, team: agentInfo.team, tenure_months: agentInfo.tenureMonths });

  const page = await context.newPage();
  context.on('page', (p) => {
    // Popups (e.g. "Track on UPS" opens a new tab) — close them; the original tab is emulated as hidden by the persona.
    if (p !== page) setTimeout(() => void p.close().catch(() => undefined), 300);
  });
  await page.clock.install({ time: sessionStart(i) });
  const t0 = Date.now();
  try {
    await page.goto(`${BASE}${persona.start(persona.order)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => '__pocAgentTracker' in window, null, { timeout: 15_000 });
    await persona.run(new Agent(page, SPEED), persona.order);
    // Navigating away fires pagehide → final engagement/exposure flush + Segment keepalive batch.
    await page.goto('about:blank');
    await page.waitForTimeout(1_500);
    console.log(`  ✓ ${persona.name.padEnd(18)} ${agentInfo.id.padEnd(11)} ${persona.order}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    if (process.env.SIM_SHOTS) await page.screenshot({ path: `${process.env.SIM_SHOTS}/${persona.name}-${i}.png` }).catch(() => undefined);
    console.log(`  ✗ ${persona.name.padEnd(18)} ${agentInfo.id.padEnd(11)} ${persona.order}  ${(err as Error).message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
}

async function main() {
  try {
    const res = await fetch(`${BASE}/`);
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    console.error(`Can't reach ${BASE}. Start the apps first: pnpm dev`);
    process.exit(1);
  }

  const personas = ONLY ? PERSONAS.filter((p) => p.name === ONLY) : PERSONAS;
  if (!personas.length) {
    console.error(`Unknown persona "${ONLY}". Options: ${PERSONAS.map((p) => p.name).join(', ')}`);
    process.exit(1);
  }
  const jobs = Array.from({ length: RUNS }, (_, i) => ({ persona: personas[i % personas.length], i }));
  console.log(`Simulating ${jobs.length} investigations against ${BASE} (${CONCURRENCY} at a time)…`);

  const browser = await chromium.launch({ headless: !HEADED });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        await runOne(browser, job.persona, job.i);
      }
    }),
  );
  await browser.close();
  console.log(`Done. Open ${BASE}/insights`);
}

await main();
