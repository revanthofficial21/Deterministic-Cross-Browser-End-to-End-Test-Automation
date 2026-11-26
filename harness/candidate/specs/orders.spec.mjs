// The candidate suite (B1 / C). Every synchronisation point is expressed as a
// condition on application state; there is no fixed sleep anywhere in this file.
import { test, expect } from '../fixtures.mjs';

const rows = (page) => page.locator('#orders-body tr[data-order-id]');

// The correct synchronisation condition for interactivity. The control exists and
// is enabled before its listeners are attached, so toBeEnabled() is NOT the
// condition that guarantees a click will be handled: the hydration flag is.
const hydrated = (page) =>
  expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');

async function total(page) {
  await expect(page.locator('#orders-total')).toHaveAttribute('data-state', 'ready');
  return Number(await page.locator('#orders-total').textContent());
}

test.describe('billing console', () => {
  test('T1 sign-in reaches the dashboard', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
    await expect(page.locator('#whoami')).toHaveAttribute('data-state', 'ready');
  });

  test('T2 order list paints with the seeded rows', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);
    await expect(page.locator('#orders-body')).toHaveAttribute('data-state', 'ready');
    await expect(rows(page)).toHaveCount(3);
  });

  test('T3 displayed total equals the sum of amounts', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);
    await expect(page.locator('#orders-body')).toHaveAttribute('data-state', 'ready');
    const amounts = await page.locator('#orders-body .amount').allTextContents();
    const sum = amounts.reduce((a, b) => a + Number(b), 0);
    expect(await total(page)).toBe(sum);
  });

  test('T4 adding an order updates the list and the total', async ({ page, dataNamespace }) => {
    await page.goto('/');
    await hydrated(page);
    const before = await total(page);
    const item = `widget-${dataNamespace}`;
    await page.locator('#new-item').fill(item);
    await page.locator('#add-order').click();
    await expect(page.locator('#orders-body .item', { hasText: item })).toBeVisible();
    expect(await total(page)).toBe(before + 7);

    // Cleanup keeps the fixture bounded and is part of the isolation contract.
    await page.locator(`#orders-body tr:has-text("${item}") button.del`).click();
    await expect(page.locator('#orders-body .item', { hasText: item })).toHaveCount(0);
  });

  test('T5 settings persist across a reload', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);
    await page.locator('#theme').selectOption('dark');
    await page.locator('#save-settings').click();
    await expect(page.locator('#settings-status')).toHaveAttribute('data-state', 'saved');
    await page.reload();
    await expect(page.locator('#theme')).toHaveValue('dark');
    await page.locator('#theme').selectOption('light');
    await page.locator('#save-settings').click();
    await expect(page.locator('#settings-status')).toHaveAttribute('data-state', 'saved');
  });

  test('T6 open-only filter shows only open orders', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);
    await expect(page.locator('#orders-body')).toHaveAttribute('data-state', 'ready');
    await page.locator('#filter-open').click();
    await expect(page.locator('#orders-body')).toHaveAttribute('data-state', 'ready');
    const statuses = await page.locator('#orders-body .status').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(s.trim()).toBe('open');
    await page.locator('#filter-all').click();
    await expect(page.locator('#orders-body')).toHaveAttribute('data-state', 'ready');
  });

  test('T7 order list still shows the seeded rows after an unrelated action', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);
    await expect(page.locator('#orders-body')).toHaveAttribute('data-state', 'ready');
    await page.locator('#theme').selectOption('light');
    await page.locator('#save-settings').click();
    await expect(page.locator('#settings-status')).toHaveAttribute('data-state', 'saved');
    await page.reload();
    await expect(page.locator('#orders-body')).toHaveAttribute('data-state', 'ready');
    await expect(rows(page)).toHaveCount(3);
  });

  // A multi-step flow: the kind of test whose window is long enough to overlap
  // with its neighbours, and therefore the kind that becomes a victim of shared
  // server-side state when accounts are not isolated.
  test('T8 creating several orders keeps the total consistent', async ({ page, dataNamespace }) => {
    await page.goto('/');
    await hydrated(page);
    let expected = await total(page);
    const items = [1, 2, 3].map((i) => `bulk-${dataNamespace}-${i}`);
    for (const item of items) {
      await page.locator('#new-item').fill(item);
      await page.locator('#add-order').click();
      await expect(page.locator('#orders-body .item', { hasText: item })).toBeVisible();
      expected += 7;
      expect(await total(page)).toBe(expected);
    }
    for (const item of items) {
      await page.locator(`#orders-body tr:has-text("${item}") button.del`).click();
      await expect(page.locator('#orders-body .item', { hasText: item })).toHaveCount(0);
    }
  });
});
