// Renders the poster to A3 PDF and a preview PNG.
import { chromium } from 'playwright';
import path from 'node:path';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.goto(`file://${path.resolve('case-study.html')}`, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: 'case-study.pdf',
  width: '210mm',
  height: '297mm',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await page.screenshot({ path: 'case-study-preview.png', fullPage: true });
await browser.close();
console.log('rendered case-study.pdf and case-study-preview.png');
