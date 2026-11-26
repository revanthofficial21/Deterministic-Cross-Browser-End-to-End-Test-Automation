// Captures the visual evidence: the application under test in each of its states,
// including the hydration window that makes the fixed-sleep baseline fail.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.IMG_DIR || 'results/images';
const EXEC = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const ACCOUNT = process.env.SHOT_ACCOUNT || 'u2';
const PASSWORD = process.env.SUT_PASSWORD || 'test-pass';

fs.mkdirSync(OUT, { recursive: true });
const facts = {};

const browser = await chromium.launch({
  headless: true,
  executablePath: EXEC,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

// 1. sign-in page, unauthenticated
await page.goto(`${BASE}/login.html`);
await page.screenshot({ path: `${OUT}/01-login.png` });

// authenticate
await page.getByLabel('Username').fill(ACCOUNT);
await page.getByLabel('Password').fill(PASSWORD);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: 'Orders' }).waitFor();

// 2. the loading window, captured in a fresh tab so no earlier navigation can race:
// the document is parsed and the data has been requested, but nothing is painted.
const fresh = await context.newPage();
await fresh.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await fresh.waitForTimeout(90);
await fresh.screenshot({ path: `${OUT}/02-loading.png` });
facts.loadingRows = await fresh.locator('#orders-body tr[data-order-id]').count();
facts.skeletonVisible = await fresh.locator('#orders-body .skeleton').count();
await fresh.close();

// 3. painted
await page.locator('#orders-body[data-state="ready"]').waitFor();
await page.screenshot({ path: `${OUT}/03-painted.png` });

// 3b. the hydration window, widened with the instrumented knob: the list is painted
// and the control looks enabled, but its listener is not attached yet.
await page.goto(`${BASE}/?hydrateDelay=2500`, { waitUntil: 'domcontentloaded' });
await page.locator('#orders-body[data-state="ready"]').waitFor();
facts.hydratedDuringWindow =
  (await page.evaluate(() => document.documentElement.dataset.hydrated)) || 'unset';
facts.buttonEnabledInWindow = await page.locator('#save-settings').isEnabled();
await page.screenshot({ path: `${OUT}/04-hydration-window.png` });

// 4. hydrated and interactive
await page.locator('html[data-hydrated="true"]').waitFor();
facts.hydratedAfterWindow = await page.evaluate(() => document.documentElement.dataset.hydrated);
await page.screenshot({ path: `${OUT}/05-hydrated.png` });
facts.rows = await page.locator('#orders-body tr[data-order-id]').count();
facts.total = await page.locator('#orders-total').textContent();

// 5. settings saved (a mutating flow)
await page.locator('#theme').selectOption('dark');
await page.locator('#save-settings').click();
await page.locator('#settings-status[data-state="saved"]').waitFor();
await page.screenshot({ path: `${OUT}/06-settings-saved.png` });
await page.locator('#theme').selectOption('light');
await page.locator('#save-settings').click();
await page.locator('#settings-status[data-state="saved"]').waitFor();

// 6. filtered view
await page.locator('#filter-open').click();
await page.locator('#orders-body[data-state="ready"]').waitFor();
await page.screenshot({ path: `${OUT}/07-filter-open.png` });
facts.openRows = await page.locator('#orders-body tr[data-order-id]').count();

// 8. what a fixed sleep of 350 ms observes: the assertion window of condition A
const fresh2 = await context.newPage();
await fresh2.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await fresh2.waitForTimeout(350);
facts.rowsAtShortSleep = await fresh2.locator('#orders-body tr[data-order-id]').count();
await fresh2.screenshot({ path: `${OUT}/08-fixed-sleep-assert-window.png` });
await fresh2.close();

await context.close();
await browser.close();

fs.writeFileSync(`${OUT}/facts.json`, JSON.stringify(facts, null, 2));
console.log('captured', Object.keys(facts).length, 'facts:', JSON.stringify(facts));
