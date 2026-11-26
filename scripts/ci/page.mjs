/**
 * Shared Playwright steps for the CI pages that open the remote-access panel.
 *
 * Both the README screenshot run and the desktop-profile browser check start
 * from a fresh profile: onboarding modals block the sidebar, and a first render
 * can precede the plugin's keyed main entry. These helpers own that choreography
 * so the two checks assert different things without drifting apart.
 */

/** Labels the panel and the pairing card render in the zh-CN UI. */
export const LABELS = {
  nav: '远程访问',
  pairing: '配对这台 Harness',
  showAddress: '显示地址',
  hideAddress: '隐藏地址',
  showQr: '显示二维码',
};

/** Dismiss the onboarding modals (preview notice, API-key step) that block the sidebar. */
export async function dismissModals(page) {
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
      // The sign-in step has no skip button; opening the credential editor
      // exposes its cancel action, which is the supported way past it.
      await addKey.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(400);
  }
}

/**
 * Select the sidebar entry and wait for the pairing card.
 * @returns whether the pairing card appeared.
 */
export async function openRemotePage(page) {
  const sidebar = page.getByRole('button', { name: LABELS.nav, exact: true }).first();
  await sidebar.waitFor({ timeout: 60_000 });
  await sidebar.click();
  try {
    await page.getByText(LABELS.pairing, { exact: true }).waitFor({ timeout: 6_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the remote-access panel from a freshly loaded page, retrying once after
 * a reload because a fresh profile can render the shell before the plugin's
 * keyed main entry is visible to the layout.
 * @param page - Playwright page already navigated to the Harness.
 */
export async function enterRemotePage(page) {
  await page.getByText(LABELS.nav, { exact: true }).first().waitFor({ timeout: 60_000 });
  await dismissModals(page);
  let opened = await openRemotePage(page);
  if (!opened) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await dismissModals(page);
    opened = await openRemotePage(page);
  }
  if (!opened) {
    const current = await page
      .locator('[aria-current="page"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
    throw new Error(`the remote-access panel did not open; current pages: ${JSON.stringify(current)}`);
  }
}

/** Assert the address starts masked, reveals on demand, and hides again. */
export async function assertMaskedAddress(page) {
  const address = page.locator('.tcr-address').first();
  await address.waitFor({ timeout: 10_000 });
  if ((await address.innerText()).trim() !== '****') {
    throw new Error(`the pairing address must default to ****, got: ${await address.innerText()}`);
  }
  await page.getByRole('button', { name: LABELS.showAddress, exact: true }).first().click();
  await page.waitForTimeout(300);
  const revealed = (await address.innerText()).trim();
  if (revealed === '****' || revealed.length < 8) {
    throw new Error(`the pairing address did not reveal, got: ${revealed}`);
  }
  await page.getByRole('button', { name: LABELS.hideAddress, exact: true }).first().click();
  await page.waitForTimeout(300);
  if ((await address.innerText()).trim() !== '****') {
    throw new Error('the pairing address did not hide again');
  }
}
