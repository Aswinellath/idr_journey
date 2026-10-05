import { test, expect } from '@playwright/test';
import {
  acceptCookies,
  expectHealthyPage,
  expectImagesLoaded,
  gotoOk,
  trackPageErrors,
  visible,
} from './helpers';

/**
 * P0 journeys: if any of these fail, treat it as an incident.
 * J3 Homepage + navigation, J1 Read an article, J2 Donate (up to the gateway, never pays).
 */

// A known, stable article. Update this if it is ever unpublished.
const STABLE_ARTICLE =
  '/article/gender/where-women-entrepreneurs-find-their-niche/';

test.describe('J3 — Homepage and navigation @P0', () => {
  test('homepage loads with its main sections @mobile', async ({ page }) => {
    await gotoOk(page, '/');
    await acceptCookies(page);

    // Title ends in "| IDR" (e.g. "Latest insights and evidence on the social impact sector in India | IDR").
    await expect(page).toHaveTitle(/\bIDR\b|India Development Review/i);
    // Key homepage sections from the CUJ doc (all are h2 headings).
    for (const section of ['Latest', 'Ground Up', 'Failure Files', 'IDR Interviews', 'Sectors', 'Themes']) {
      await expect(
        page.getByRole('heading', { name: section, exact: true, level: 2 }),
        `Homepage section missing: ${section}`,
      ).toBeAttached();
    }
    // Hero story: an h1 linking to an article.
    await expect(visible(page.getByRole('heading', { level: 1 }))).toBeVisible();
    // A handful of article links are present.
    const articleLinks = page.locator('a[href*="/article/"], a[href*="/features/"]');
    expect(await articleLinks.count()).toBeGreaterThan(5);
  });

  test('main menu links resolve (desktop)', async ({ page, request }) => {
    test.skip(test.info().project.name === 'mobile', 'desktop-only check');

    const paths = ['/about/', '/sectors/', '/themes/', '/expertise/', '/features/', '/humour/', '/donate/'];
    for (const p of paths) {
      const res = await request.get(p);
      expect(res.status(), `${p} returned ${res.status()}`).toBeLessThan(400);
    }

    // Logo returns home.
    await gotoOk(page, '/about/');
    await acceptCookies(page);
    await visible(page.locator('a[href="https://idronline.org"]')).click();
    await expect(page).toHaveURL(/idronline\.org\/?$/);
  });

  test('mobile burger menu opens and shows navigation @mobile', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'mobile-only check');
    await gotoOk(page, '/');
    await acceptCookies(page);

    await visible(page.locator('img[alt="Burger Menu"]')).click();
    await expect(visible(page.getByRole('link', { name: /^Sectors$/ }))).toBeVisible();
    await expect(visible(page.getByRole('link', { name: /^Donate$/ }))).toBeVisible();
  });
});

test.describe('J1 — Read an article @P0', () => {
  test('stable article renders fully @mobile', async ({ page }) => {
    await gotoOk(page, STABLE_ARTICLE);
    await acceptCookies(page);

    await expect(visible(page.locator('h1'))).toContainText(/women entrepreneurs/i);
    await expect(visible(page.getByText(/min read/i))).toBeVisible();
    await expect(page.locator('a[href*="/contributor/"]').first()).toBeAttached();

    // Body has real content, not a stub.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length, 'Article body looks empty').toBeGreaterThan(2000);

    // End-of-article blocks (present in the page, even if below the fold).
    await expect(page.getByText(/ABOUT THE AUTHORS?/i).first()).toBeAttached();
    await expect(page.getByText(/Tags:/i).first()).toBeAttached();
    await expect(page.getByText(/READ NEXT/i).first()).toBeAttached();

    await expectImagesLoaded(page.locator('body'), 4);
  });

  test('newest article from the homepage opens', async ({ page }) => {
    await gotoOk(page, '/');
    const href = await page.locator('a[href*="/article/"]').first().getAttribute('href');
    expect(href, 'No article link on homepage').toBeTruthy();

    await gotoOk(page, href!);
    await expect(visible(page.locator('h1'))).toBeVisible();
    await expect(visible(page.getByText(/min read/i))).toBeVisible();
  });

  test('SEO basics are present on articles', async ({ page }) => {
    await gotoOk(page, STABLE_ARTICLE);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /idronline\.org/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{20,}/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /https?:\/\//);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots ?? '', 'Article is set to noindex!').not.toMatch(/noindex/i);
  });
});

test.describe('J2 — Make a donation @P0', () => {
  // The button label includes the amount and frequency, e.g. "Contribute INR 999 once".
  const contributeButton = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: /^contribute\b/i });

  test('donate form loads and validates @mobile', async ({ page }, testInfo) => {
    trackPageErrors(page, testInfo);
    await gotoOk(page, '/donate/');
    await acceptCookies(page);

    await expect(page.getByRole('heading', { name: /I would like to contribute/i })).toBeVisible();
    for (const freq of ['One time', 'Monthly', 'Yearly']) {
      await expect(page.getByRole('button', { name: freq, exact: true }), `Missing option: ${freq}`).toBeVisible();
    }
    for (const amount of ['99', '999', '9,999']) {
      await expect(page.getByRole('button', { name: amount, exact: true }).first()).toBeVisible();
    }
    for (const label of ['Full Name', 'PAN', 'Email ID', 'Phone Number', 'Address']) {
      await expect(page.getByRole('textbox', { name: label, exact: true }), `Missing field: ${label}`).toBeVisible();
    }
    await expect(page.getByRole('checkbox', { name: /citizen of India/i })).toBeVisible();

    // The button label updates with the selected amount and frequency.
    await page.getByRole('button', { name: 'Monthly', exact: true }).click();
    await page.getByRole('button', { name: '99', exact: true }).first().click();
    await expect(contributeButton(page)).toHaveText(/99/);

    // Submitting with empty fields should show a validation message and stay on the page.
    await contributeButton(page).click();
    await expect(
      visible(page.getByText(/This field is required|Please Enter a valid|You must declare/i)),
      'No validation message after submitting an empty form',
    ).toBeVisible();
    await expect(page).toHaveURL(/\/donate\/?/);
  });

  test('filled form opens the payment gateway (does not pay)', async ({ page, context }, testInfo) => {
    test.skip(test.info().project.name === 'mobile', 'run once, on desktop');
    // Each run can create a pending order on the gateway and a record in the donor
    // database, so this only runs when RUN_GATEWAY=1 (the workflow does it once a day).
    test.skip(process.env.RUN_GATEWAY !== '1', 'set RUN_GATEWAY=1 to enable');
    trackPageErrors(page, testInfo);
    await gotoOk(page, '/donate/');
    await acceptCookies(page);

    await page.getByRole('button', { name: 'One time', exact: true }).click();
    await page.getByRole('button', { name: '99', exact: true }).first().click();

    // Test data only. Never use real PAN/phone. The gateway step is not completed.
    await page.getByRole('textbox', { name: 'Full Name', exact: true }).fill('CUJ Monitor Test');
    await page.getByRole('textbox', { name: 'PAN', exact: true }).fill('ABCDE1234F');
    await page
      .getByRole('textbox', { name: 'Email ID', exact: true })
      .fill(process.env.TEST_DONOR_EMAIL || 'cuj-monitor@example.com');
    await page.getByRole('textbox', { name: 'Phone Number', exact: true }).fill('9999999999');
    await page.getByRole('textbox', { name: 'Address', exact: true }).fill('Test address, Mumbai');
    await page.getByRole('checkbox', { name: /citizen of India/i }).check();

    // The gateway may open as a popup, a redirect or an iframe modal.
    const popupPromise = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null);
    await contributeButton(page).click();

    const gatewayPattern = /razorpay|payu|ccavenue|cashfree|paytm|instamojo|stripe|checkout|payment/i;
    const popup = await popupPromise;
    const gatewayFrame = page.locator(
      'iframe[src*="razorpay" i], iframe[src*="payu" i], iframe[src*="cashfree" i], iframe[src*="checkout" i], iframe[name*="checkout" i]',
    );

    await expect
      .poll(
        async () =>
          (popup !== null && gatewayPattern.test(popup.url())) ||
          gatewayPattern.test(page.url()) ||
          (await gatewayFrame.count()) > 0,
        { message: 'Payment gateway did not open after clicking Contribute', timeout: 25_000 },
      )
      .toBe(true);

    await expectHealthyPage(page);
    // Stop here. Close any gateway window without paying.
    if (popup) await popup.close();
  });

  test('every Donate link points to /donate/', async ({ page }) => {
    await gotoOk(page, '/');
    const hrefs = await page
      .locator('a', { hasText: /donate/i })
      .evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''));
    expect(hrefs.length).toBeGreaterThan(0);
    const wrong = hrefs.filter((h) => h && !/\/donate\/?/.test(h));
    expect(wrong, `Donate links going elsewhere:\n${wrong.join('\n')}`).toEqual([]);
  });
});
