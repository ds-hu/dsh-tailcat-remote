import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

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

async function dismissModals(target = page) {
  // A fresh profile shows a preview notice and then asks for an API key.
  // Both modals block the sidebar; skip them by their explicit actions.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const dismiss = target
      .locator('button:visible, [role="button"]:visible')
      .filter({ hasText: /^(继续|稍后配置|关闭)$/ })
      .first();
    if ((await dismiss.count()) > 0) {
      await dismiss.click({ force: true }).catch(() => {});
      await target.waitForTimeout(500);
      continue;
    }
    const skip = target.getByText('稍后配置', { exact: true }).first();
    if ((await skip.count()) > 0 && (await skip.isVisible().catch(() => false))) {
      await skip.click({ force: true }).catch(() => {});
      await target.waitForTimeout(500);
      continue;
    }
    const addKey = target.getByText('添加 API Key', { exact: true }).first();
    if ((await addKey.count()) > 0 && (await addKey.isVisible().catch(() => false))) {
      // The sign-in step has no skip button; opening the credential editor
      // exposes its cancel action, which is the supported way past it.
      await addKey.click({ force: true }).catch(() => {});
      await target.waitForTimeout(500);
      continue;
    }
    await target.waitForTimeout(400);
  }
}

async function openRemotePage() {
  const sidebar = page.getByRole('button', { name: '远程访问', exact: true }).first();
  await sidebar.waitFor({ timeout: 60_000 });
  await sidebar.click();
  try {
    await page.getByText('配对这台 Harness', { exact: true }).waitFor({ timeout: 6_000 });
    return true;
  } catch {
    return false;
  }
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
try {
  await page.getByText('远程访问', { exact: true }).first().waitFor({ timeout: 60_000 });
  await dismissModals();
  let opened = await openRemotePage();
  if (!opened) {
    // A fresh profile can render the shell before the plugin's keyed main
    // entry is visible to the layout. One reload boots both together.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await dismissModals();
    opened = await openRemotePage();
  }
  if (!opened) {
    console.error('panel did not open; current page:', await page.locator('[aria-current="page"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))));
    await page.getByText('配对这台 Harness', { exact: true }).waitFor({ timeout: 60_000 });
  }
  const addressValue = page.locator('.tcr-address').first();
  await addressValue.waitFor({ timeout: 10_000 });
  if ((await addressValue.innerText()).trim() !== '****') {
    throw new Error(`pairing address should start masked, got: ${await addressValue.innerText()}`);
  }
  const showAddress = page.getByRole('button', { name: '显示地址', exact: true }).first();
  await showAddress.click();
  await page.waitForTimeout(300);
  const revealedAddress = (await addressValue.innerText()).trim();
  if (revealedAddress === '****' || revealedAddress.length < 8) {
    throw new Error(`pairing address did not reveal, got: ${revealedAddress}`);
  }
  await page.getByRole('button', { name: '隐藏地址', exact: true }).first().click();
  await page.waitForTimeout(300);
  if ((await addressValue.innerText()).trim() !== '****') {
    throw new Error('pairing address did not hide again');
  }
  if ((await page.locator('.tcr-command-text').count()) > 0) {
    throw new Error('the client command block should be removed');
  }
  if ((await page.locator('.tcr-steps').count()) > 0) {
    throw new Error('the client command steps should be removed');
  }

  await page.waitForTimeout(2_000);
  await page.screenshot({ path: path.join(outDir, '01-pairing.png') });

  const qrToggle = page.getByRole('button', { name: '显示二维码', exact: true }).first();
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

const security = page.locator('section.tcr-card').filter({ hasText: '安全' }).first();
await security.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await security.screenshot({ path: path.join(outDir, '02-security.png') });


await browser.close();
console.log('screenshots written to', outDir);
