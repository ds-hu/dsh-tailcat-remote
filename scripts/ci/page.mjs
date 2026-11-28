/**
 * Shared Playwright steps for the CI pages that open the remote-access panel.
 *
 * Both the README screenshot run and the desktop-profile browser check start
 * from a fresh profile: onboarding modals block the sidebar, and a first render
 * can precede the plugin's client entry. These helpers own that choreography
 * so the two checks assert different things without drifting apart. The panel
 * lives in the Settings dialog, so every path here opens Settings first.
 */

/** Labels the panel and the pairing card render in the zh-CN UI. */
export const LABELS = {
  newSession: '新会话',
  settings: '设置',
  nav: '远程访问',
  section: '状态与诊断',
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
 * Open the Settings dialog and wait for the remote-access section to be listed.
 *
 * The shell owns two ways in: the sidebar's bottom trigger and the
 * `settings.open` command. The trigger is a plain Settings button when no
 * account launcher replaced it, which is the case for the signed-out CI
 * profiles; the keyboard path covers a launcher-owned seat. Local pages get
 * the command as `Mod+Alt+,`; web builds only bind it on macOS and Windows, so
 * the button is tried first.
 */
export async function openSettings(page) {
  const trigger = page.getByRole('button', { name: LABELS.settings, exact: true }).first();
  if ((await trigger.count()) > 0) {
    await trigger.click({ force: true }).catch(() => {});
  }
  if ((await page.getByRole('button', { name: LABELS.nav, exact: true }).count()) === 0) {
    await page.keyboard.press('Control+Alt+,');
  }
  await page.getByRole('button', { name: LABELS.nav, exact: true }).first().waitFor({ timeout: 60_000 });
}

/**
 * Open Settings and select the remote-access section, without assuming what it
 * shows: the install-card run lands on the same section with no pairing card.
 */
export async function openRemoteSection(page) {
  await openSettings(page);
  await page.getByRole('button', { name: LABELS.nav, exact: true }).first().click();
}

/**
 * Open the remote-access section and wait for the pairing card.
 * @returns whether the pairing card appeared.
 */
export async function openRemotePage(page) {
  await openRemoteSection(page);
  try {
    await page.getByText(LABELS.pairing, { exact: true }).waitFor({ timeout: 6_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for the app shell to render, whatever modal is on top of it.
 *
 * This is a text query on purpose. An onboarding modal puts the shell behind
 * `inert`, which keeps it on screen but strips it from the accessibility tree,
 * so a role query never resolves on a fresh profile.
 * @param page - Playwright page already navigated to the Harness.
 */
export async function waitForShell(page) {
  await page.getByText(LABELS.newSession, { exact: true }).first().waitFor({ timeout: 60_000 });
}

/**
 * Open the remote-access section from a freshly loaded page, retrying once after
 * a reload because a fresh profile can render the shell before the plugin's
 * section is visible to the settings navigation.
 * @param page - Playwright page already navigated to the Harness.
 */
export async function enterRemotePage(page) {
  await waitForShell(page);
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
      .locator('[aria-current="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    throw new Error(`the remote-access section did not open; current sections: ${JSON.stringify(current)}`);
  }
}

/**
 * Expand the folded diagnostics block so its rows are visible and readable.
 * @param page - Playwright page already showing the remote-access section.
 */
export async function openDiagnostics(page) {
  const block = page.locator('details.tcr-disclosure').filter({ hasText: LABELS.section }).first();
  await block.locator('summary').click();
  await block.locator('.tcr-grid').first().waitFor({ timeout: 10_000 });
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
