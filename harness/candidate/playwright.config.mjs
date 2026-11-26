import { defineConfig, devices } from '@playwright/test';

const BROWSERS = (process.env.BROWSERS || 'chromium').split(',').map((s) => s.trim());
const WORKERS = Number(process.env.WORKERS || 4);

// Condition switch. 'per-worker' enables the O3 contribution (one account and one
// data namespace per worker); 'shared' reproduces the pre-contribution behaviour
// so that the contribution can be ablated on identical code.
const ISOLATION = process.env.ISOLATION || 'per-worker';

const projects = [];
if (BROWSERS.includes('chromium')) projects.push({ name: 'chromium', use: { ...devices['Desktop Chrome'] } });
if (BROWSERS.includes('firefox')) projects.push({ name: 'firefox', use: { ...devices['Desktop Firefox'] } });
if (BROWSERS.includes('webkit')) projects.push({ name: 'webkit', use: { ...devices['Desktop Safari'] } });

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  workers: WORKERS,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: process.env.PW_OUTPUT_DIR || 'results/artifacts',
  reporter: [
    ['list'],
    ['./reporter.mjs', { out: process.env.PW_JSONL || 'results/candidate.jsonl' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:4173',
    // O4: every execution is traced, not only retries. The first attempt of a
    // flaky test is the attempt that carries the evidence.
    trace: process.env.TRACE_MODE || 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    // In a constrained container we drive the system Chromium; CI uses the
    // Playwright-managed builds for all three engines.
    launchOptions: process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
      : { args: ['--no-sandbox', '--disable-dev-shm-usage'] },
  },
  metadata: { isolation: ISOLATION, workers: WORKERS, browsers: BROWSERS.join('+') },
  projects,
});
