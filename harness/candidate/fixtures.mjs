// Isolation layer (O3).
//
// Two kinds of coupling are removed here:
//   * authentication: every parallel worker materialises its own signed-in state,
//     from its own account, and never shares a cookie jar with another worker.
//   * data: every test derives a unique data namespace from its own test id, so
//     concurrent tests cannot collide on the same record.
//
// With ISOLATION=shared both are deliberately switched off, which is the ablation
// used to measure what the contribution is worth.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ISOLATION = process.env.ISOLATION || 'per-worker';
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const PASSWORD = process.env.SUT_PASSWORD || 'test-pass';
const ACCOUNT_POOL_SIZE = Number(process.env.ACCOUNT_POOL_SIZE || 6);

export function accountFor(parallelIndex) {
  if (ISOLATION === 'shared') return 'u1';
  // u2..u7: the pool reserved for isolated runs, so a shared run cannot collide
  // with an isolated one even if both are executed against the same SUT instance.
  return `u${2 + (parallelIndex % ACCOUNT_POOL_SIZE)}`;
}

export const test = base.extend({
  // Worker-scoped: authenticate once per worker, reuse within the worker.
  workerStorageState: [
    async ({ browser }, use, testInfo) => {
      const account = accountFor(testInfo.parallelIndex);
      const dir = path.join(process.env.PW_OUTPUT_DIR || 'results/artifacts', '.auth');
      fs.mkdirSync(dir, { recursive: true });
      // The file is per worker even when the account is shared: what is shared in
      // condition B is the account's server-side data, not the cookie jar.
      const file = path.join(dir, `${ISOLATION}-${account}-w${testInfo.parallelIndex}.json`);

      // Authenticate in a clean context: never inherit state while logging in.
      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/login.html`);
      await page.getByLabel('Username').fill(account);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
      await page.context().storageState({ path: file });
      await context.close();
      await use(file);
    },
    { scope: 'worker' },
  ],

  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState);
  },

  // Test-scoped unique data namespace. Two parallel tests never create the same item.
  dataNamespace: async ({}, use, testInfo) => {
    const token = ISOLATION === 'shared'
      ? 'shared'                                   // deliberate collision
      : `t-${testInfo.testId.slice(0, 8)}`;        // unique per test
    await use(token);
  },
});

export { expect };
