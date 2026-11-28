/**
 * CI-only browser check of the panel as a remote visitor of the desktop profile.
 *
 * The desktop host is already running when this script starts; `DSH_REMOTE_URL`
 * is the door's own address, not the Host's token URL. Nothing here carries the
 * launch token: the door must exchange the address for a browser session, the
 * app must boot in an ordinary browser, and the panel must report the desktop
 * surface. The screenshot is uploaded as a workflow artifact for review.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { assertMaskedAddress, enterRemotePage, LABELS, openDiagnostics } from './page.mjs';

const url = process.env.DSH_REMOTE_URL;
if (!url) throw new Error('DSH_REMOTE_URL is required');

const outDir = path.resolve('docs/screenshots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1600 },
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

try {
  // The door answers this navigation with the session cookie; the browser then
  // loads the ordinary Web GUI.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await enterRemotePage(page);

  const badge = page.locator('.tcr-surface-badge').first();
  await badge.waitFor({ timeout: 10_000 });
  if ((await badge.innerText()).trim() !== '桌面版') {
    throw new Error(`the panel must badge the desktop profile, got: ${await badge.innerText()}`);
  }

  const hint = page.locator('.tcr-desktop-hint').first();
  await hint.waitFor({ timeout: 10_000 });
  if (!(await hint.innerText()).includes('托盘')) {
    throw new Error(`the desktop hint must explain the tray lifetime, got: ${await hint.innerText()}`);
  }

  // Diagnostics start folded, so the runtime row has to be opened before it can
  // be read — the same two clicks a person makes.
  await openDiagnostics(page);
  const runtimeRow = page.locator('.tcr-row').filter({ hasText: '运行环境' }).first();
  await runtimeRow.waitFor({ timeout: 10_000 });
  if (!(await runtimeRow.innerText()).includes('桌面版')) {
    throw new Error(`diagnostics must name the desktop surface, got: ${await runtimeRow.innerText()}`);
  }

  await assertMaskedAddress(page);

  const qrToggle = page.getByRole('button', { name: LABELS.showQr, exact: true }).first();
  if ((await qrToggle.count()) === 0) throw new Error('the pairing card must offer the QR action');
  if (!(await qrToggle.evaluate((node) => node.classList.contains('tcr-btn-primary')))) {
    throw new Error('the QR action must stay prominent while the code is hidden');
  }
  await qrToggle.click();
  await page.locator('.tcr-qr-wrap').first().waitFor({ timeout: 10_000 });
  // The assertions above scrolled the dialog to reach folded blocks and the QR
  // code; the screenshot documents the top of the page, so scroll back first.
  await page.evaluate(() => {
    const section = document.querySelector('.tcr-section');
    let node = section?.parentElement;
    while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
    if (node) node.scrollTop = 0;
  });
  await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(outDir, '04-desktop.png'), fullPage: true });
  console.log('desktop panel screenshot written to', path.join(outDir, '04-desktop.png'));
} catch (error) {
  await page.screenshot({ path: path.join(outDir, 'debug-desktop.png') });
  console.error(await page.locator('body').innerText().catch(() => '(no body text)'));
  throw error;
} finally {
  await browser.close();
}
