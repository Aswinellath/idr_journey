import { test, expect } from '@playwright/test';
import { site } from '../site.config';
import {
  blockedBy,
  blockExtras,
  closeHover,
  collectMenuLinks,
  expandDropdown,
  expectInsideScreen,
  gotoOk,
  menu,
  openMobileMenu,
  prepare,
  samePage,
  tagDropdowns,
  visible,
} from './helpers';

/**
 * Menu & link checks. Every test runs on all 9 browser × screen combinations
 * (see playwright.config.ts), except the HTTP status sweep, which runs once.
 */

test.beforeEach(async ({ page }) => {
  await blockExtras(page);
});

for (const path of site.pages) {
  test(`menu items and dropdowns work on ${path}`, async ({ page }, testInfo) => {
    await gotoOk(page, path);
    await prepare(page);

    const mobile = await openMobileMenu(page);
    testInfo.annotations.push({ type: 'layout', description: mobile ? 'mobile menu (☰)' : 'desktop menu' });

    // 1. The expected top-level items are on screen.
    const expected = mobile ? site.expectedMobileItems : site.expectedDesktopItems;
    for (const name of expected) {
      await expect
        .soft(visible(menu(page).getByRole('link', { name, exact: true })), `Menu item missing or hidden: "${name}"`)
        .toBeVisible();
    }

    // 2. The header doesn't push the page sideways on this screen size.
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect.soft(sideways, `Page scrolls sideways by ${sideways}px on this screen size`).toBeLessThanOrEqual(1);

    // 3. Every dropdown opens, shows links, and fits on screen.
    const found = await tagDropdowns(page);
    // On touch screens, only items with an arrow/toggle (or a "#" parent link) are dropdowns.
    // The rest are plain links there (e.g. a desktop-only mega-menu), checked by the link tests.
    const dropdowns = mobile ? found.filter((d) => d.tappable) : found;
    testInfo.annotations.push({
      type: 'dropdowns found',
      description: dropdowns.map((d) => d.label).join(', ') || 'none',
    });
    if (mobile) {
      const plain = found.filter((d) => !d.tappable).map((d) => d.label);
      if (plain.length) testInfo.annotations.push({ type: 'plain links on this screen', description: plain.join(', ') });
    }

    const mustHave = mobile ? site.expectedMobileDropdowns : site.expectedDesktopDropdowns;
    for (const name of mustHave) {
      expect
        .soft(
          dropdowns.some((d) => d.label.toLowerCase().startsWith(name.toLowerCase())),
          `Expected dropdown not found in the ${mobile ? 'mobile' : 'desktop'} menu: "${name}"`,
        )
        .toBe(true);
    }
    if (!mobile) {
      expect(dropdowns.length, 'No dropdown menus found in the desktop header').toBeGreaterThanOrEqual(site.minDesktopDropdowns);
    }

    for (const [i, first] of dropdowns.entries()) {
      let dd = first;
      if (mobile && i > 0) {
        // Each mobile dropdown is tested on a fresh page, so an earlier one left open can't get in the way.
        await gotoOk(page, path);
        await prepare(page);
        await openMobileMenu(page);
        const again = (await tagDropdowns(page)).filter((d) => d.tappable).find((d) => d.label === first.label);
        if (!again) {
          expect.soft(false, `Dropdown "${first.label}" disappeared after reloading the page`).toBe(true);
          continue;
        }
        dd = again;
      }
      const { opened, note } = await expandDropdown(page, dd.id, mobile ? 'tap' : 'hover');
      expect.soft(opened, `Dropdown "${dd.label}" did not open${note ? ` (${note})` : ''}`).toBe(true);
      if (!opened) continue;
      const sub = page.locator(`[data-qa-sub="${dd.id}"]`);
      const links = sub.locator('a[href]').filter({ visible: true });
      expect.soft(await links.count(), `Dropdown "${dd.label}" opened but shows no links`).toBeGreaterThan(0);
      await expectInsideScreen(page, sub, `Dropdown "${dd.label}"`);
      if (!mobile) await closeHover(page);
    }
  });
}

test('menu links open the right pages', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await gotoOk(page, '/');
  await prepare(page);
  const home = page.url();
  const mobile = await openMobileMenu(page);

  const links = (await collectMenuLinks(page, true))
    .filter((l) => l.target !== '_blank' && !samePage(l.href, home))
    .slice(0, site.maxClickLinks);
  testInfo.annotations.push({ type: 'links clicked', description: links.map((l) => l.text || l.href).join(', ') });
  expect(links.length, 'No clickable menu links found').toBeGreaterThan(0);

  const broken: string[] = [];
  for (const link of links) {
    await gotoOk(page, '/');
    await prepare(page);
    if (mobile) await openMobileMenu(page);

    const a = visible(menu(page).locator(`a[href="${link.rawHref.replace(/"/g, '\\"')}"]`));
    const label = `"${link.text || '(no text)'}" → ${link.href}`;
    if (!(await a.isVisible().catch(() => false))) {
      broken.push(`${label}: not visible in the menu`);
      continue;
    }

    const before = page.url();
    const navigated = page
      .waitForURL((u) => !samePage(u.href, before), { timeout: 45_000, waitUntil: 'commit' })
      .then(() => true, () => false);
    try {
      await a.click({ timeout: 10_000 });
    } catch (e) {
      broken.push(`${label}: could not be tapped${blockedBy(e) || ' (it did not respond to the click)'}`);
      continue;
    }
    if (!(await navigated)) {
      broken.push(`${label}: tapped, but no new page opened within 45 seconds`);
      continue;
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {});

    const res = await page.request.get(page.url(), { maxRedirects: 5, timeout: 30_000 }).catch(() => null);
    if (!res) broken.push(`${label}: no response`);
    else if (res.status() >= 400) broken.push(`${label}: HTTP ${res.status()}`);
    else if (/page not found|^404\b/i.test(await page.title())) broken.push(`${label}: shows a "page not found" page`);
  }

  expect(broken, `Menu links that failed:\n${broken.join('\n')}`).toEqual([]);
});

test('every menu and dropdown link responds', async ({ page }, testInfo) => {
  // A link's HTTP status is the same in every browser, so this sweep runs once.
  test.skip(testInfo.project.name !== 'chromium-desktop', 'checked once, on chromium-desktop');
  test.setTimeout(600_000);

  const all = new Map<string, string>();
  for (const path of site.pages) {
    await gotoOk(page, path);
    // Hidden links (dropdown items, mobile menu) are in the page too, so they're included.
    for (const l of await collectMenuLinks(page, false)) if (!all.has(l.href)) all.set(l.href, l.text);
  }
  testInfo.annotations.push({ type: 'links checked', description: String(all.size) });

  const failures: string[] = [];
  const entries = [...all.entries()];
  for (let i = 0; i < entries.length; i += 5) {
    await Promise.all(
      entries.slice(i, i + 5).map(async ([href, text]) => {
        try {
          const res = await page.request.get(href, { maxRedirects: 5, timeout: 30_000 });
          if (res.status() >= 400) failures.push(`"${text}" → ${href}: HTTP ${res.status()}`);
        } catch (e) {
          failures.push(`"${text}" → ${href}: ${(e as Error).message.split('\n')[0]}`);
        }
      }),
    );
  }

  expect(failures, `Broken menu links (${failures.length} of ${all.size}):\n${failures.join('\n')}`).toEqual([]);
});
