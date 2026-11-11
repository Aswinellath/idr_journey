import { test, expect, Page, TestInfo } from '@playwright/test';
import { site } from '../site.config';
import {
  blockExtras,
  clickLinkAndCheck,
  closeHover,
  collectMenuLinks,
  Dropdown,
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
 *
 * Clicks, taps and hovers behave like a person: aim at a visible part of the item,
 * and if nothing happens, try again (up to site.clickTries times) before moving on.
 */

test.beforeEach(async ({ page }) => {
  await blockExtras(page);
});

/** Note in the report when something only worked on a second or third try. */
function noteRetries(testInfo: TestInfo, what: string, tries: number | undefined) {
  if (tries && tries > 1) testInfo.annotations.push({ type: 'needed extra clicks', description: `${what}: worked on try ${tries}` });
}

/** Load a page, close overlays, open the ☰ menu if this screen uses one. */
async function freshMenu(page: Page, path: string) {
  await gotoOk(page, path);
  await prepare(page);
  return openMobileMenu(page);
}

/** The dropdowns a user can open on this screen (on touch layouts, only those with a toggle or "#" link). */
async function usableDropdowns(page: Page, mobile: boolean): Promise<{ usable: Dropdown[]; plain: Dropdown[] }> {
  const found = await tagDropdowns(page);
  return mobile
    ? { usable: found.filter((d) => d.tappable), plain: found.filter((d) => !d.tappable) }
    : { usable: found, plain: [] };
}

/** Reload the page and re-find a dropdown by its label (ids change after a reload). */
async function reopenDropdown(page: Page, path: string, label: string) {
  const mobile = await freshMenu(page, path);
  const { usable } = await usableDropdowns(page, mobile);
  return { mobile, dd: usable.find((d) => d.label === label) };
}

for (const path of site.pages) {
  test(`menu items and dropdowns work on ${path}`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const mobile = await freshMenu(page, path);
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
    const { usable: dropdowns, plain } = await usableDropdowns(page, mobile);
    testInfo.annotations.push({ type: 'dropdowns found', description: dropdowns.map((d) => d.label).join(', ') || 'none' });
    if (plain.length) testInfo.annotations.push({ type: 'plain links on this screen', description: plain.map((d) => d.label).join(', ') });

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
      let dd: Dropdown | undefined = first;
      if (mobile && i > 0) {
        // Each mobile dropdown is tested on a fresh page, so an earlier one left open can't get in the way.
        dd = (await reopenDropdown(page, path, first.label)).dd;
        if (!dd) {
          expect.soft(false, `Dropdown "${first.label}" disappeared after reloading the page`).toBe(true);
          continue;
        }
      }
      const { opened, tries, note } = await expandDropdown(page, dd.id, mobile ? 'tap' : 'hover');
      expect.soft(opened, `Dropdown "${dd.label}" did not open${note ? ` (${note})` : ''}`).toBe(true);
      if (!opened) continue;
      noteRetries(testInfo, `Dropdown "${dd.label}"`, tries);
      const sub = page.locator(`[data-qa-sub="${dd.id}"]`);
      const links = sub.locator('a[href]').filter({ visible: true });
      expect.soft(await links.count(), `Dropdown "${dd.label}" opened but shows no links`).toBeGreaterThan(0);
      await expectInsideScreen(page, sub, `Dropdown "${dd.label}"`);
      if (!mobile) await closeHover(page);
    }
  });
}

test('menu links open the right pages', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const mobile = await freshMenu(page, '/');
  const home = page.url();

  const links = (await collectMenuLinks(page, true))
    .filter((l) => l.target !== '_blank' && !samePage(l.href, home))
    .slice(0, site.maxClickLinks);
  testInfo.annotations.push({ type: 'links clicked', description: links.map((l) => l.text || l.href).join(', ') });
  expect(links.length, 'No clickable menu links found').toBeGreaterThan(0);

  const broken: string[] = [];
  for (const link of links) {
    if (mobile) await freshMenu(page, '/');
    else {
      await gotoOk(page, '/');
      await prepare(page);
    }
    const a = visible(menu(page).locator(`a[href="${link.rawHref.replace(/"/g, '\\"')}"]`));
    const { problem, tries } = await clickLinkAndCheck(page, link, a);
    if (problem) broken.push(problem);
    else noteRetries(testInfo, `"${link.text}"`, tries);
  }

  expect(broken, `Menu links that failed:\n${broken.join('\n')}`).toEqual([]);
});

test('dropdown items open the right pages', async ({ page }, testInfo) => {
  // Opens each dropdown (hover on desktop, tap on touch screens), then clicks its items one by one.
  test.setTimeout(900_000);
  const mobile = await freshMenu(page, '/');
  const home = page.url();
  const { usable: dropdowns } = await usableDropdowns(page, mobile);
  expect(dropdowns.length, 'No dropdowns found to test').toBeGreaterThan(0);

  // 1. Open each dropdown once and note which items to click.
  const plan: { label: string; links: Awaited<ReturnType<typeof collectMenuLinks>> }[] = [];
  for (const [i, first] of dropdowns.entries()) {
    const dd = i === 0 ? first : (await reopenDropdown(page, '/', first.label)).dd;
    if (!dd) continue;
    const { opened, note } = await expandDropdown(page, dd.id, mobile ? 'tap' : 'hover');
    expect.soft(opened, `Dropdown "${first.label}" did not open${note ? ` (${note})` : ''}`).toBe(true);
    if (!opened) continue;
    const items = (await collectMenuLinks(page, true, `[data-qa-sub="${dd.id}"]`))
      .filter((l) => l.target !== '_blank' && !samePage(l.href, home))
      .slice(0, site.maxItemsPerDropdown);
    plan.push({ label: first.label, links: items });
  }
  testInfo.annotations.push({
    type: 'dropdown items clicked',
    description: plan.map((p) => `${p.label}: ${p.links.map((l) => l.text).join(', ')}`).join(' | '),
  });

  // 2. For each item: fresh page → open its dropdown → click the item like a person → check the page.
  const broken: string[] = [];
  for (const { label, links } of plan) {
    for (const link of links) {
      const { dd } = await reopenDropdown(page, '/', label);
      if (!dd) {
        broken.push(`Dropdown "${label}" disappeared before clicking "${link.text}"`);
        continue;
      }
      const { opened, note } = await expandDropdown(page, dd.id, mobile ? 'tap' : 'hover');
      if (!opened) {
        broken.push(`Dropdown "${label}" did not open before clicking "${link.text}"${note ? ` (${note})` : ''}`);
        continue;
      }
      const sub = page.locator(`[data-qa-sub="${dd.id}"]`);
      const a = visible(sub.locator(`a[href="${link.rawHref.replace(/"/g, '\\"')}"]`));
      const { problem, tries } = await clickLinkAndCheck(page, link, a);
      if (problem) broken.push(`${label} › ${problem}`);
      else noteRetries(testInfo, `${label} › "${link.text}"`, tries);
    }
  }

  expect(broken, `Dropdown items that failed:\n${broken.join('\n')}`).toEqual([]);
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
