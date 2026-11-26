// Renders the poster to A3 PDF and a preview PNG.
import { chromium } from 'playwright';
import path from 'node:path';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1123, height: 1587 } });
await page.goto(`file://${path.resolve('poster.html')}`, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: 'poster.pdf',
  width: '297mm',
  height: '420mm',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await page.screenshot({ path: 'poster-preview.png', fullPage: true });
await browser.close();
console.log('rendered poster.pdf and poster-preview.png');
