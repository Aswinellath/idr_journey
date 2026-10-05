import { Page, Locator, TestInfo, expect } from '@playwright/test';

/**
 * The site renders many elements twice (desktop + mobile menus, hidden error
 * messages, hidden popups). Always target the visible copy.
 */
export function visible(locator: Locator): Locator {
  return locator.locator('visible=true').first();
}

/** Dismiss the cookie banner ("Ok") if it is showing. */
export async function acceptCookies(page: Page) {
  const ok = visible(page.getByRole('button', { name: /^ok$/i }).or(page.getByText(/^Ok$/)));
  try {
    await ok.click({ timeout: 3_000 });
  } catch {
    /* banner not shown — fine */
  }
}

/** Fail on a WordPress/PHP error screen. */
export async function expectHealthyPage(page: Page) {
  const body = page.locator('body');
  await expect(body).not.toContainText(/Error establishing a database connection/i);
  await expect(body).not.toContainText(/There has been a critical error/i);
  await expect(body).not.toContainText(/Fatal error:|Parse error:/i);
}

/** Go to a path and assert it returned < 400 and rendered a healthy page. */
export async function gotoOk(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(res, `No response for ${path}`).not.toBeNull();
  expect(res!.status(), `${path} returned ${res!.status()}`).toBeLessThan(400);
  await expectHealthyPage(page);
  return res!;
}

/** Find a visible form field by label, placeholder or name attribute. */
export function field(page: Page, label: RegExp, nameHint: string): Locator {
  return visible(
    page
      .getByLabel(label)
      .or(page.getByPlaceholder(label))
      .or(page.locator(`input[name*="${nameHint}" i], textarea[name*="${nameHint}" i]`)),
  );
}

/**
 * Check that visible images in a container actually loaded.
 * Hidden and lazy placeholder images are skipped; each image gets a short timeout.
 */
export async function expectImagesLoaded(container: Locator, maxToCheck = 6) {
  const imgs = container.locator('img[src]:not([src=""]):not([src^="data:"])').locator('visible=true');
  const count = Math.min(await imgs.count(), maxToCheck);
  expect(count, 'No visible images found').toBeGreaterThan(0);
  const broken: string[] = [];
  for (let i = 0; i < count; i++) {
    const img = imgs.nth(i);
    await img.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
    const ok = await img
      .evaluate(
        (el: HTMLImageElement) =>
          new Promise<boolean>((resolve) => {
            if (el.complete) return resolve(el.naturalWidth > 0);
            el.addEventListener('load', () => resolve(el.naturalWidth > 0), { once: true });
            el.addEventListener('error', () => resolve(false), { once: true });
            setTimeout(() => resolve(el.naturalWidth > 0), 8_000);
          }),
      )
      .catch(() => true); // element detached mid-check — not a broken image
    if (!ok) broken.push((await img.getAttribute('src').catch(() => null)) ?? '(unknown)');
  }
  expect(broken, `Broken images:\n${broken.join('\n')}`).toEqual([]);
}

/**
 * Record uncaught JS errors. Third-party scripts (analytics, pixels, embeds)
 * throw often and are not IDR's problem, so these are attached to the report
 * as a warning rather than failing the test. Use the returned list to assert
 * only when a journey depends on first-party code.
 */
export function trackPageErrors(page: Page, testInfo: TestInfo): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
    testInfo.annotations.push({ type: 'js-error', description: err.message.slice(0, 300) });
  });
  return errors;
}
