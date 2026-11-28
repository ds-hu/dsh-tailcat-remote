import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { dismissModals, openRemoteSection, waitForShell } from './page.mjs';

const url = process.env.DSH_INSTALL_URL;
if (!url) throw new Error('DSH_INSTALL_URL is required');

const outDir = path.resolve('docs/screenshots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
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
await waitForShell(page);
await dismissModals(page);
await openRemoteSection(page);
await page.getByText('一键安装 tailcat', { exact: true }).first().waitFor({ timeout: 30_000 });
const card = page.locator('section.tcr-card').filter({ hasText: '一键安装 tailcat' }).first();
if ((await card.count()) === 0) {
  await page.screenshot({ path: path.join(outDir, 'debug-install.png'), fullPage: true });
  throw new Error('the install card was not found');
}
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await card.screenshot({ path: path.join(outDir, '03-install.png') });
await browser.close();
console.log('install screenshot written to', outDir);
