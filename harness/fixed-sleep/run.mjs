// Condition A: the pre-contribution baseline policy.
//
// This harness reproduces how these suites are commonly written and is the honest
// point of comparison: a fixed sleep after every interaction, an immediate
// assertion after the sleep, one shared account for all workers and one shared
// data namespace. It is implemented on the same driver as the candidate so that
// the A -> B contrast isolates the wait policy rather than the framework.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const FIXED_WAIT = Number(process.env.FIXED_WAIT || 600);
const CONCURRENCY = Number(process.env.WORKERS || 4);
const ACCOUNT = process.env.SHARED_ACCOUNT || 'u1';
const PASSWORD = process.env.SUT_PASSWORD || 'test-pass';
const OUT = process.env.JSONL_OUT || 'results/fixed-sleep.jsonl';
const CONDITION = process.env.CONDITION || 'A';
const RUN = process.env.RUN_ID || '0';
const EXEC = process.env.CHROME_PATH || '/usr/local/bin/chromium';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CheckFailed extends Error {}

function check(condition, message) {
  if (!condition) throw new CheckFailed(message);
}

const scenarios = [
  {
    name: 'T1 sign-in reaches the dashboard',
    async run(page) {
      await page.goto(`${BASE_URL}/`);
      await sleep(FIXED_WAIT);
      const heading = await page.locator('h1').first().textContent();
      check(heading && heading.trim() === 'Orders', `heading was "${heading}"`);
    },
  },
  {
    name: 'T2 order list paints with the seeded rows',
    async run(page) {
      await page.goto(`${BASE_URL}/`);
      await sleep(FIXED_WAIT);
      const n = await page.locator('#orders-body tr[data-order-id]').count();
      check(n === 3, `expected 3 rows, found ${n}`);
    },
  },
  {
    name: 'T3 displayed total equals the sum of amounts',
    async run(page) {
      await page.goto(`${BASE_URL}/`);
      await sleep(FIXED_WAIT);
      const amounts = await page.locator('#orders-body .amount').allTextContents();
      const sum = amounts.reduce((a, b) => a + Number(b), 0);
      const shown = Number(await page.locator('#orders-total').textContent());
      check(shown === sum, `total ${shown} != sum ${sum} over ${amounts.length} rows`);
    },
  },
  {
    name: 'T4 adding an order updates the list and the total',
    async run(page) {
      await page.goto(`${BASE_URL}/`);
      await sleep(FIXED_WAIT);
      const before = Number(await page.locator('#orders-total').textContent());
      const item = 'widget-shared';
      await page.locator('#new-item').fill(item);
      await page.locator('#add-order').click();
      await sleep(FIXED_WAIT);
      const shown = await page.locator('#orders-body .item', { hasText: item }).count();
      check(shown > 0, 'added order not visible in the list');
      const after = Number(await page.locator('#orders-total').textContent());
      check(after === before + 7, `total ${after} != ${before + 7}`);
    },
  },
  {
    name: 'T5 settings persist across a reload',
    async run(page) {
      await page.goto(`${BASE_URL}/`);
      await sleep(FIXED_WAIT);
      await page.locator('#theme').selectOption('dark');
      await page.locator('#save-settings').click();
      await sleep(FIXED_WAIT);
      const status = await page.locator('#settings-status').textContent();
      check((status || '').trim() === 'saved', `settings status was "${status}"`);
      await page.reload();
      await sleep(FIXED_WAIT);
      const value = await page.locator('#theme').inputValue();
      check(value === 'dark', `theme after reload was "${value}"`);
      await page.locator('#theme').selectOption('light');
      await page.locator('#save-settings').click();
      await sleep(FIXED_WAIT);
    },
  },
  {
    name: 'T8 creating several orders keeps the total consistent',
    async run(page) {
      await page.goto(`${BASE_URL}/`);
      await sleep(FIXED_WAIT);
      const shownBefore = (await page.locator('#orders-total').textContent()).trim();
      check(/^\d+$/.test(shownBefore), `total not rendered yet: "${shownBefore}"`);
      let expected = Number(shownBefore);
      for (const i of [1, 2, 3]) {
        const item = `bulk-shared-${i}`;
        await page.locator('#new-item').fill(item);
        await page.locator('#add-order').click();
        await sleep(FIXED_WAIT);
        expected += 7;
        const raw = (await page.locator('#orders-total').textContent()).trim();
        check(/^\d+$/.test(raw), `total not rendered yet: "${raw}"`);
        const shown = Number(raw);
        check(shown === expected, `after adding ${item} total was ${shown}, expected ${expected}`);
      }
    },
  },
  {
    name: 'T7 order list still shows the seeded rows after an unrelated action',
    async run(page) {
      await page.goto(`${BASE_URL}/`);
      await sleep(FIXED_WAIT);
      await page.locator('#theme').selectOption('light');
      await page.locator('#save-settings').click();
      await sleep(FIXED_WAIT);
      await page.reload();
      await sleep(FIXED_WAIT);
      const n = await page.locator('#orders-body tr[data-order-id]').count();
      check(n === 3, `expected 3 rows after unrelated action, found ${n}`);
    },
  },
  {
    name: 'T6 open-only filter shows only open orders',
    async run(page) {
      await page.goto(`${BASE_URL}/`);
      await sleep(FIXED_WAIT);
      await page.locator('#filter-open').click();
      await sleep(FIXED_WAIT);
      const statuses = await page.locator('#orders-body .status').allTextContents();
      check(statuses.length > 0, 'filter produced no rows');
      for (const s of statuses) check(s.trim() === 'open', `filter leaked status "${s}"`);
      await page.locator('#filter-all').click();
      await sleep(FIXED_WAIT);
    },
  },
];

async function login(page) {
  await page.goto(`${BASE_URL}/login.html`);
  await page.locator('#username').fill(ACCOUNT);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#submit').click();
  await sleep(FIXED_WAIT);
}

async function workerLoop(browser, queue, workerIndex, records) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  for (;;) {
    const next = queue.shift();
    if (!next) break;
    const started = Date.now();
    let status = 'passed';
    let error = null;
    try {
      await next.scenario.run(page);
    } catch (err) {
      status = 'failed';
      error = String(err.message || err).split('\n')[0].slice(0, 240);
      // A failed scenario leaves the page in an unknown state; start clean.
      await page.goto(`${BASE_URL}/`).catch(() => {});
      await sleep(FIXED_WAIT);
    }
    // The baseline policy also sleeps after the last interaction of a scenario.
    await sleep(FIXED_WAIT);
    records.push({
      condition: CONDITION,
      run: String(RUN),
      browser: 'chromium',
      worker: workerIndex,
      test: next.scenario.name,
      status,
      durationMs: Date.now() - started,
      error,
    });
  }
  await context.close();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: EXEC,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const queue = scenarios.map((scenario) => ({ scenario }));
const records = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, i) => workerLoop(browser, queue, i, records))
);
await browser.close();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.appendFileSync(OUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

const failed = records.filter((r) => r.status !== 'passed').length;
console.log(`condition ${CONDITION} run ${RUN}: ${records.length - failed} passed, ${failed} failed`);
