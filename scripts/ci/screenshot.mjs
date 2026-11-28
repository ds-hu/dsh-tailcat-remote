import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { assertMaskedAddress, enterRemotePage, LABELS, openSidebarPage, settingsDialog } from './page.mjs';

const url = process.env.DSH_URL;
if (!url) throw new Error('DSH_URL is required');

const outDir = path.resolve('docs/screenshots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1500 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
  colorScheme: 'light',
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.on('console', (message) => {
  if (message.type() === 'error') console.log('[browser:error]', message.text());
});
page.on('pageerror', (error) => console.log('[pageerror]', error.message));

await page.goto(url, { waitUntil: 'domcontentloaded' });
try {
  await enterRemotePage(page);
  await assertMaskedAddress(page);
  if ((await page.locator('.tcr-command-text').count()) > 0) {
    throw new Error('the client command block should be removed');
  }
  if ((await page.locator('.tcr-steps').count()) > 0) {
    throw new Error('the client command steps should be removed');
  }

  await page.waitForTimeout(2_000);
  await page.screenshot({ path: path.join(outDir, '01-pairing.png') });

  const qrToggle = page.getByRole('button', { name: LABELS.showQr, exact: true }).first();
  if ((await qrToggle.count()) > 0) {
    if (!(await qrToggle.evaluate((node) => node.classList.contains('tcr-btn-primary')))) {
      throw new Error('QR toggle should be prominent while the QR code is hidden');
    }
    await qrToggle.click();
    await page.locator('.tcr-qr-wrap').first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
  }
} catch (error) {
  await page.screenshot({ path: path.join(outDir, 'debug.png') });
  console.error(await page.locator('body').innerText());
  throw error;
}

const security = settingsDialog(page).locator('section.tcr-card').filter({ hasText: '安全' }).first();
await security.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await security.screenshot({ path: path.join(outDir, '02-security.png') });

// The optional sidebar row opens the same section as a main-area page; capture
// that wider layout so the shortcut is documented by the screenshots too.
await openSidebarPage(page);
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, '05-panel.png') });
console.log('sidebar page screenshot written');


await browser.close();
console.log('screenshots written to', outDir);
