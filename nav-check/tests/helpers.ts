import { expect, Locator, Page } from '@playwright/test';
import { site } from '../site.config';

export type MenuLink = { rawHref: string; href: string; text: string; target: string };
/**
 * tappable = can be opened on a touch screen: it has its own arrow/toggle button,
 * or its parent link goes nowhere ("#"). Items whose parent is a real link and have no
 * toggle are plain links on mobile (their submenu is desktop-only).
 */
export type Dropdown = { id: number; label: string; tappable: boolean };

/** The first copy of an element that is actually on screen (the site has hidden duplicates). */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/** All places menu links can live: header, nav bars, mobile menu panel. */
export function menu(page: Page): Locator {
  return page.locator(site.menuScope);
}

/** Close the cookie banner if it shows. */
export async function acceptCookies(page: Page) {
  const ok = visible(
    page.getByRole('button', { name: /^(ok|accept|accept all|i agree|got it)$/i }).or(page.getByText(/^Ok$/)),
  );
  await ok.click({ timeout: 3_000 }).catch(() => {});
}

/** Open a page and fail on an error status or a WordPress error screen. */
export async function gotoOk(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(res, `No response for ${path}`).not.toBeNull();
  expect(res!.status(), `${path} returned ${res!.status()}`).toBeLessThan(400);
  const body = page.locator('body');
  await expect(body).not.toContainText(/Error establishing a database connection|There has been a critical error|Fatal error:/i);
  return res!;
}

/** The visible ☰ button, or null when the desktop menu is showing. */
export async function findBurger(page: Page): Promise<Locator | null> {
  for (const sel of site.burgerSelectors) {
    const loc = visible(page.locator(sel));
    if (await loc.isVisible().catch(() => false)) return loc;
  }
  return null;
}

/**
 * On small screens, tap ☰ and wait for the menu. Returns true if the mobile menu was used,
 * false if the desktop menu is showing (no ☰ visible).
 */
export async function openMobileMenu(page: Page): Promise<boolean> {
  const burger = await findBurger(page);
  if (!burger) return false;
  await burger.click();
  await expect(
    visible(menu(page).getByRole('link', { name: site.expectedMobileItems[0], exact: true })),
    'Mobile menu did not open after tapping the ☰ icon',
  ).toBeVisible();
  return true;
}

/**
 * Find every visible menu item that has a submenu, and tag it in the page
 * (data-qa-dd on the item, data-qa-sub on its submenu) so tests can target it.
 */
export async function tagDropdowns(page: Page): Promise<Dropdown[]> {
  return page.evaluate((scope) => {
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const found: { id: number; label: string; tappable: boolean }[] = [];
    let id = 0;
    document.querySelectorAll(scope).forEach((root) => {
      root.querySelectorAll('li').forEach((li) => {
        if (li.hasAttribute('data-qa-dd') || !shown(li)) return;
        const sub = li.querySelector(
          ':scope > ul, :scope > div ul, :scope > .sub-menu, :scope > [class*="dropdown"], :scope > [class*="submenu"]',
        );
        if (!sub) return;
        const trigger = li.querySelector(':scope > a, :scope > button, :scope > span, :scope > div > a');
        const label = ((trigger?.textContent || li.textContent || '').trim().split('\n')[0] || `item ${id}`)
          .trim()
          .slice(0, 40);
        const toggle = li.querySelector(
          ':scope > button, :scope > [class*="toggle"], :scope > [class*="arrow"], :scope > [class*="caret"], :scope > [class*="icon"]',
        );
        const href = trigger?.tagName === 'A' ? (trigger.getAttribute('href') || '').trim() : '';
        const tappable = !!toggle || href === '' || href === '#' || /^javascript:/i.test(href);
        li.setAttribute('data-qa-dd', String(id));
        sub.setAttribute('data-qa-sub', String(id));
        found.push({ id: id++, label, tappable });
      });
    });
    return found;
  }, site.menuScope);
}

/** True when a submenu is really showing: has size, not hidden, not transparent. */
export async function isOpen(sub: Locator): Promise<boolean> {
  return sub
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.1) return false;
      }
      return true;
    })
    .catch(() => false);
}

/**
 * Try to open a dropdown the way a user would:
 * desktop = hover (then click if it's a "#" toggle); touch = tap the toggle arrow/button.
 */
export async function expandDropdown(
  page: Page,
  id: number,
  mode: 'hover' | 'tap',
): Promise<{ opened: boolean; note?: string }> {
  const li = page.locator(`[data-qa-dd="${id}"]`);
  const sub = page.locator(`[data-qa-sub="${id}"]`);
  if (await isOpen(sub)) return { opened: true };

  const attempts: Array<{ loc: Locator; action: 'hover' | 'click' }> =
    mode === 'hover'
      ? [
          { loc: li.locator(':scope > a, :scope > button, :scope > span'), action: 'hover' },
          { loc: li, action: 'hover' },
          { loc: li.locator(':scope > button, :scope > a[href="#"], :scope > a:not([href])'), action: 'click' },
        ]
      : [
          { loc: li.locator(':scope > button'), action: 'click' },
          {
            loc: li.locator(':scope > [class*="toggle"], :scope > [class*="arrow"], :scope > [class*="caret"], :scope > [class*="icon"]'),
            action: 'click',
          },
          { loc: li.locator(':scope > span'), action: 'click' },
          { loc: li.locator(':scope > a[href="#"], :scope > a:not([href])'), action: 'click' },
        ];

  for (const { loc, action } of attempts) {
    const el = loc.first();
    if (!(await el.isVisible().catch(() => false))) continue;
    const before = page.url();
    if (action === 'hover') await el.hover().catch(() => {});
    else await el.click().catch(() => {});
    // A "#" link only adds "#" to the address — that's not a new page.
    if (!samePage(page.url(), before)) return { opened: false, note: 'tapping it opened a new page instead of the submenu' };
    try {
      await expect.poll(() => isOpen(sub), { timeout: 2_500 }).toBe(true);
      return { opened: true };
    } catch {
      /* try the next way */
    }
  }
  return { opened: false, note: mode === 'tap' ? 'no tappable arrow/toggle opened it' : 'hovering did not open it' };
}

/** Move the mouse away so a hover dropdown closes before the next one. */
export async function closeHover(page: Page) {
  await page.keyboard.press('Escape').catch(() => {});
  const vp = page.viewportSize();
  await page.mouse.move(2, (vp?.height ?? 800) - 2).catch(() => {});
}

/** Soft-check that an element fits inside the screen width. */
export async function expectInsideScreen(page: Page, loc: Locator, label: string) {
  const box = await loc.boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  if (!box) return;
  expect
    .soft(
      box.x >= -1 && box.x + box.width <= vw + 1,
      `${label} runs off the screen (left ${Math.round(box.x)}px, width ${Math.round(box.width)}px, screen ${vw}px)`,
    )
    .toBe(true);
}

/** Every link inside the menu areas (optionally only visible ones), de-duplicated. */
export async function collectMenuLinks(page: Page, visibleOnly: boolean): Promise<MenuLink[]> {
  const raw: MenuLink[] = await page.evaluate(
    ({ scope, visibleOnly }) => {
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const out: { rawHref: string; href: string; text: string; target: string }[] = [];
      document.querySelectorAll(scope).forEach((root) =>
        root.querySelectorAll('a[href]').forEach((a) => {
          if (visibleOnly && !shown(a)) return;
          out.push({
            rawHref: a.getAttribute('href') || '',
            href: (a as HTMLAnchorElement).href,
            text: (a.textContent || a.getAttribute('aria-label') || a.querySelector('img')?.getAttribute('alt') || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 60),
            target: a.getAttribute('target') || '',
          });
        }),
      );
      return out;
    },
    { scope: site.menuScope, visibleOnly },
  );
  const seen = new Set<string>();
  return raw.filter((l) => {
    if (!l.rawHref || site.skipLinks.some((re) => re.test(l.rawHref) || re.test(l.href))) return false;
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });
}

/** Same page, ignoring a trailing slash and #anchor. */
export function samePage(a: string, b: string) {
  const norm = (u: string) => u.split('#')[0].replace(/\/$/, '');
  return norm(a) === norm(b);
}
