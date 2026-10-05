import { test, expect } from '@playwright/test';
import { acceptCookies, expectImagesLoaded, gotoOk, visible } from './helpers';

/**
 * P1 journeys: fix the same working day.
 * J4 Newsletter, J5 Search, J6 Browse listings, J7 IDR Answers, J8 Languages.
 */

test.describe('J4 — Newsletter signup @P1', () => {
  // Footer form on every page: a textbox ("Your email address") + a SIGN UP button.
  test('newsletter box and SIGN UP button are present', async ({ page }) => {
    await gotoOk(page, '/');
    await acceptCookies(page);

    const footer = page.getByRole('contentinfo');
    const email = footer.getByRole('textbox', { name: /newsletter/i })
      .or(footer.getByPlaceholder(/email address/i))
      .first();
    await email.scrollIntoViewIfNeeded();
    await expect(email, 'Newsletter email box missing').toBeVisible();
    await expect(footer.getByRole('button', { name: /sign up/i })).toBeVisible();

    // An invalid email should not be accepted silently.
    await email.fill('not-an-email');
    await footer.getByRole('button', { name: /sign up/i }).click();
    const valid = await email.evaluate((el: HTMLInputElement) => el.checkValidity?.() ?? true);
    const errorShown = await visible(page.getByText(/valid email|invalid|required/i)).isVisible().catch(() => false);
    expect(!valid || errorShown, 'Invalid email was accepted with no error').toBe(true);
    // Deliberately not submitting a real address: that would add a fake subscriber every hour.
    // Set NEWSLETTER_TEST_EMAIL to a team inbox to enable the full submit test below.
  });

  test('newsletter submit succeeds (opt-in)', async ({ page }) => {
    const testEmail = process.env.NEWSLETTER_TEST_EMAIL;
    test.skip(!testEmail, 'set NEWSLETTER_TEST_EMAIL to enable');
    await gotoOk(page, '/');
    await acceptCookies(page);
    const footer = page.getByRole('contentinfo');
    await footer.getByPlaceholder(/email address/i).first().fill(testEmail!);
    await footer.getByRole('button', { name: /sign up/i }).click();
    await expect(visible(page.getByText(/thank|success|subscribed|confirm/i))).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('J5 — Search @P1', () => {
  test('search returns results for a common term @mobile', async ({ page }) => {
    await gotoOk(page, '/');
    await acceptCookies(page);

    await visible(page.locator('img[alt="Search Icon"]')).click();
    const box = page.locator('input[type="search"], input[name="s"], input[placeholder*="search" i]')
      .locator('visible=true').first();
    await expect(box, 'Search box did not open').toBeVisible();
    await box.fill('education');
    await box.press('Enter');

    // Results should appear and not stay stuck on "Loading...".
    await expect
      .poll(async () => page.locator('a[href*="/article/"], a[href*="/features/"]').count(), {
        message: 'No search results appeared',
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    await expect(page.getByText(/^Loading\.\.\.$/).locator('visible=true')).toHaveCount(0, { timeout: 20_000 });
  });
});

test.describe('J6 — Browse by Sector / Theme / Expertise @P1', () => {
  const listings = [
    '/sectors/education/',
    '/themes/gender/',
    '/expertise/monitoring-evaluation/',
  ];
  for (const path of listings) {
    test(`listing ${path} shows article cards`, async ({ page }) => {
      await gotoOk(page, path);
      const cards = page.locator('a[href*="/article/"], a[href*="/features/"]');
      expect(await cards.count(), `No articles on ${path}`).toBeGreaterThan(3);
      await expectImagesLoaded(page.locator('body'), 4);
    });
  }
});

test.describe('J7 — IDR Answers @P1', () => {
  test('IDR Answers subdomain responds', async ({ request }) => {
    const res = await request.get('https://idranswers.idronline.org/');
    expect(res.status()).toBeLessThan(400);
  });

  test('login page loads', async ({ page }) => {
    await page.goto('https://idranswers.idronline.org/', { waitUntil: 'domcontentloaded' });
    // App may redirect to accounts.idronline.org for sign-in, or show its own UI.
    await expect
      .poll(async () => {
        const onAuth = /accounts\.idronline\.org/.test(page.url());
        const hasLoginUi =
          (await page.locator('input[type="password"], input[type="email"], input[name="username"]').count()) > 0 ||
          (await page.getByRole('button', { name: /sign in|log in|login|continue/i }).count()) > 0;
        return onAuth || hasLoginUi;
      }, { message: 'IDR Answers did not show a login page', timeout: 25_000 })
      .toBe(true);
  });

  test('chat widget is present on the main site', async ({ page }) => {
    await gotoOk(page, '/');
    const chat = page.getByRole('complementary', { name: /AI Chat Assistant/i });
    await expect(chat, 'IDR Answers chat widget missing').toBeAttached();
    await expect(chat.getByRole('textbox', { name: /Ask a question/i })).toBeAttached();
  });
});

test.describe('J8 — Language editions @P1', () => {
  test('IDR Hindi homepage loads', async ({ page }) => {
    const res = await page.goto('https://hindi.idronline.org/', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 0).toBeLessThan(400);
    // Devanagari characters should be present.
    await expect(page.locator('body')).toContainText(/[ऀ-ॿ]{5,}/);
  });

  const languages: Array<[string, RegExp]> = [
    ['/bengali/', /[ঀ-৿]{5,}/],
    ['/gujarati/', /[઀-૿]{5,}/],
    ['/kannada/', /[ಀ-೿]{5,}/],
    ['/marathi/', /[ऀ-ॿ]{5,}/],
  ];
  for (const [path, script] of languages) {
    test(`language edition ${path} loads in its script`, async ({ page }) => {
      await gotoOk(page, path);
      await expect(page.locator('body')).toContainText(script);
    });
  }
});
