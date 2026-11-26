import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

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

async function dismissModals() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const dismiss = page
      .locator('button:visible, [role="button"]:visible')
      .filter({ hasText: /^(继续|稍后配置|关闭)$/ })
      .first();
    if ((await dismiss.count()) > 0) {
      await dismiss.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }
    const skip = page.getByText('稍后配置', { exact: true }).first();
    if ((await skip.count()) > 0 && (await skip.isVisible().catch(() => false))) {
      await skip.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }
    const addKey = page.getByText('添加 API Key', { exact: true }).first();
    if ((await addKey.count()) > 0 && (await addKey.isVisible().catch(() => false))) {
      await addKey.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(400);
  }
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.getByText('远程访问', { exact: true }).first().waitFor({ timeout: 60_000 });
await dismissModals();
await page.getByRole('button', { name: '远程访问', exact: true }).first().click();
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
