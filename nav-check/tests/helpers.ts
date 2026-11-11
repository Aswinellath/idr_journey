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

/** Block slow third-party extras (video embeds, trackers) that don't affect menus. */
export async function blockExtras(page: Page) {
  await page.route(
    (url) => site.blockHosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)),
    (route) => route.abort(),
  );
}

/** Close the cookie banner and floating panels (e.g. the chat panel) that can cover the menu. */
export async function prepare(page: Page) {
  await acceptCookies(page);
  for (const name of site.closeButtons) {
    await visible(page.getByRole('button', { name })).click({ timeout: 2_000 }).catch(() => {});
  }
}

/** If a click failed because something covered the element, say what it was. */
export function blockedBy(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  const line = msg.split('\n').find((l) => l.includes('intercepts pointer events'));
  if (!line) return '';
  const what = line.replace(/^[\s-]*/, '').replace(/\s*(from .*)?(subtree )?intercepts pointer events.*$/, '').trim();
  return ` — something on the page is covering it: ${what.slice(0, 160)}`;
}

/** Open a page (one retry if the site is slow) and fail on an error status or a WordPress error screen. */
export async function gotoOk(page: Page, path: string) {
  let res;
  try {
    res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    if (!/Timeout/i.test(String(e))) throw e;
    res = await page.goto(path, { waitUntil: 'domcontentloaded' }); // second try
  }
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
  // Move the pointer away first: a pointer left over a hover menu (e.g. "Languages")
  // re-opens it after a reload, and the open list can sit on top of the ☰ button.
  await closeHover(page);
  const firstItem = visible(menu(page).getByRole('link', { name: site.expectedMobileItems[0], exact: true }));
  const r = await humanClick(page, burger, {
    done: () => firstItem.isVisible().catch(() => false),
    touch: await isTouch(page),
  });
  if (!r.ok) throw new Error(`The ☰ menu button didn't open the menu after ${r.tries} tries (${r.reason})`);
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
 * Try to open a dropdown the way a person would:
 * desktop = hover (then click if it's a "#" toggle); touch = tap the toggle arrow/button.
 * Each way is tried up to 3 times before giving up on it.
 */
export async function expandDropdown(
  page: Page,
  id: number,
  mode: 'hover' | 'tap',
): Promise<{ opened: boolean; tries?: number; note?: string }> {
  const li = page.locator(`[data-qa-dd="${id}"]`);
  const sub = page.locator(`[data-qa-sub="${id}"]`);
  const done = () => isOpen(sub);
  if (await done()) return { opened: true, tries: 0 };

  const touch = mode === 'tap' && (await isTouch(page));
  const before = page.url();
  const navigated = () => !samePage(page.url(), before); // a "#" link only adds "#": not a new page

  const ways: Array<{ loc: Locator; how: 'hover' | 'click' }> =
    mode === 'hover'
      ? [
          { loc: li.locator(':scope > a, :scope > button, :scope > span'), how: 'hover' },
          { loc: li.locator(':scope > button, :scope > a[href="#"], :scope > a:not([href])'), how: 'click' },
        ]
      : [
          { loc: li.locator(':scope > button'), how: 'click' },
          {
            loc: li.locator(':scope > [class*="toggle"], :scope > [class*="arrow"], :scope > [class*="caret"], :scope > [class*="icon"]'),
            how: 'click',
          },
          { loc: li.locator(':scope > span'), how: 'click' },
          { loc: li.locator(':scope > a[href="#"], :scope > a:not([href])'), how: 'click' },
          // Some menus only open on hover, even on phones (a tap also counts as a hover there).
          { loc: li.locator(':scope > a, :scope > button, :scope > span'), how: 'hover' },
        ];

  let reason: string | undefined;
  for (const way of ways) {
    const el = way.loc.first();
    if (!(await el.isVisible().catch(() => false))) continue;
    const r =
      way.how === 'hover'
        ? await humanHover(page, el, done)
        : await humanClick(page, el, { done, touch, stopIf: navigated, waitMs: 4_000 });
    if (navigated()) return { opened: false, note: 'tapping it opened a new page instead of the submenu' };
    if (r.ok) return { opened: true, tries: r.tries };
    reason = `${way.how === 'hover' ? 'hovered' : 'tapped'} ${r.tries} times: ${r.reason}`;
  }
  return { opened: false, note: reason ?? (mode === 'tap' ? 'no tappable arrow/toggle found' : 'nothing to hover over') };
}

/* ------------------------------------------------------------------ */
/* Human-like pointer actions                                          */
/* ------------------------------------------------------------------ */

export type ActionResult = { ok: boolean; tries: number; reason?: string };

/** True on touch-screen emulations (phones, iPads). */
export async function isTouch(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.maxTouchPoints > 0).catch(() => false);
}

/**
 * Find a spot inside the element that a person could actually click: on screen and not
 * covered by anything else. Tries the centre first, then other spots across the element.
 * Returns what's covering it if every spot is covered.
 */
async function clickablePoint(loc: Locator): Promise<{ x: number; y: number } | { covered: string } | null> {
  return loc
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      const spots = [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7], [0.15, 0.5], [0.85, 0.5]];
      let cover: Element | null = null;
      for (const [fx, fy] of spots) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const top = document.elementFromPoint(x, y);
        if (top && (top === el || el.contains(top))) return { x, y };
        cover ??= top;
      }
      if (!cover) return null;
      const tag = cover.tagName.toLowerCase();
      const cls = (cover.getAttribute('class') || '').trim().split(/\s+/).slice(0, 2).join(' ');
      const label = cover.getAttribute('aria-label') || (cover.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return { covered: `<${tag}${cls ? ` class="${cls}"` : ''}>${label ? ` "${label}"` : ''}` };
    })
    .catch(() => null);
}

/** Where this test last put the mouse (Playwright doesn't report it), so moves can follow a natural path. */
const pointer = new WeakMap<Page, { x: number; y: number }>();

/**
 * Move the mouse like a person heading into a dropdown: first straight down/up to the
 * target's row, then across. A straight diagonal can cut across neighbouring items and
 * close a hover menu on the way, which people instinctively avoid.
 */
async function moveTo(page: Page, x: number, y: number, steps = 8) {
  const from = pointer.get(page);
  if (from && Math.abs(from.y - y) > 4 && Math.abs(from.x - x) > 4) {
    await page.mouse.move(from.x, y, { steps: Math.ceil(steps / 2) });
  }
  await page.mouse.move(x, y, { steps });
  pointer.set(page, { x, y });
}

/** Wait up to `ms` for `done()` to become true. */
async function waitUntil(page: Page, done: () => Promise<boolean> | boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await done()) return true;
    await page.waitForTimeout(200);
  }
  return !!(await done());
}

/**
 * Click or tap like a person: scroll it into view, aim at a part that isn't covered,
 * move the mouse there (or tap on touch screens), click, then wait to see if it worked.
 * If nothing happened, pause a little longer and try again — up to `tries` times.
 */
export async function humanClick(
  page: Page,
  loc: Locator,
  opts: { done: () => Promise<boolean> | boolean; touch?: boolean; stopIf?: () => boolean; tries?: number; waitMs?: number },
): Promise<ActionResult> {
  const tries = opts.tries ?? site.clickTries;
  const waitMs = opts.waitMs ?? 4_000;
  let reason = 'nothing happened after clicking';
  for (let i = 1; i <= tries; i++) {
    if (i > 1) {
      if (await opts.done()) return { ok: true, tries: i - 1 }; // it worked, just slowly
      await page.waitForTimeout(700 * i); // give animations / slow scripts more time
    }
    await loc.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(150);
    const p = await clickablePoint(loc);
    if (!p) {
      reason = "it isn't on screen";
      continue;
    }
    if ('covered' in p) {
      reason = `something on the page is covering it: ${p.covered}`;
      continue;
    }
    if (opts.touch) {
      await page.touchscreen.tap(p.x, p.y).catch(() => page.mouse.click(p.x, p.y));
    } else {
      await moveTo(page, p.x, p.y, 8);
      await page.waitForTimeout(100);
      await page.mouse.click(p.x, p.y);
    }
    if (opts.stopIf?.()) return { ok: false, tries: i, reason: 'it opened a new page' };
    if (await waitUntil(page, opts.done, waitMs)) return { ok: true, tries: i };
    reason = 'nothing happened after clicking';
  }
  return { ok: false, tries, reason };
}

/**
 * Hover like a person: come in from just outside the element, move slowly across it,
 * then wait. Many WordPress menus ("hoverIntent") only open after real mouse movement.
 * Retried up to `tries` times, moving away in between.
 */
export async function humanHover(page: Page, loc: Locator, done: () => Promise<boolean>, tries = site.clickTries): Promise<ActionResult> {
  let reason = 'the dropdown did not appear';
  for (let i = 1; i <= tries; i++) {
    if (i > 1) {
      await closeHover(page);
      await page.waitForTimeout(500 * i);
    }
    await loc.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
    const p = await clickablePoint(loc);
    const box = await loc.boundingBox();
    if (!p || !box) {
      reason = "it isn't on screen";
      continue;
    }
    if ('covered' in p) {
      reason = `something on the page is covering it: ${p.covered}`;
      continue;
    }
    await page.mouse.move(Math.max(1, box.x - 10), Math.max(1, box.y - 6), { steps: 4 }); // just outside
    await page.mouse.move(p.x, p.y, { steps: 10 });
    await wiggle(page, loc, p);
    pointer.set(page, p);
    if (await waitUntil(page, done, 4_000)) return { ok: true, tries: i };
  }
  return { ok: false, tries, reason };
}

/**
 * Move the mouse gently back and forth, like a person does. Many WordPress menus
 * ("hoverIntent") only open after seeing slow mouse movement, not an instant jump.
 * Stays around the given point (a visible part of the element), or the centre if none is given.
 */
async function wiggle(page: Page, el: Locator, at?: { x: number; y: number }) {
  const box = await el.boundingBox();
  if (!box) return;
  const x = at?.x ?? box.x + box.width / 2;
  const y = at?.y ?? box.y + box.height / 2;
  const d = Math.min(4, box.width / 8);
  await page.mouse.move(x - d, y, { steps: 6 });
  await page.mouse.move(x + d, y, { steps: 6 });
  await page.mouse.move(x, y, { steps: 3 });
}

/** Move the mouse away so a hover dropdown closes before the next one. */
export async function closeHover(page: Page) {
  await page.keyboard.press('Escape').catch(() => {});
  const vp = page.viewportSize();
  await page.mouse.move(2, (vp?.height ?? 800) - 2).catch(() => {});
  pointer.set(page, { x: 2, y: (vp?.height ?? 800) - 2 });
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
export async function collectMenuLinks(page: Page, visibleOnly: boolean, scope = site.menuScope): Promise<MenuLink[]> {
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
    { scope, visibleOnly },
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

/**
 * Click a menu link like a person (up to 3 tries) and check a real page opens.
 * Returns null if it worked, or a one-line description of what went wrong.
 */
export async function clickLinkAndCheck(page: Page, link: MenuLink, a: Locator): Promise<{ problem: string | null; tries: number }> {
  const label = `"${link.text || '(no text)'}" → ${link.href}`;
  if (!(await a.isVisible().catch(() => false))) return { problem: `${label}: not visible`, tries: 0 };
  const before = page.url();
  const r = await humanClick(page, a, {
    done: () => !samePage(page.url(), before),
    touch: await isTouch(page),
    waitMs: 15_000,
  });
  if (!r.ok) return { problem: `${label}: ${r.tries} clicks, no page opened (${r.reason})`, tries: r.tries };
  await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {});
  const res = await page.request.get(page.url(), { maxRedirects: 5, timeout: 30_000 }).catch(() => null);
  if (!res) return { problem: `${label}: no response`, tries: r.tries };
  if (res.status() >= 400) return { problem: `${label}: HTTP ${res.status()}`, tries: r.tries };
  if (/page not found|^404\b/i.test(await page.title())) return { problem: `${label}: shows a "page not found" page`, tries: r.tries };
  return { problem: null, tries: r.tries };
}
