import { defineConfig, devices } from '@playwright/test';

/**
 * Critical user journey checks for idronline.org.
 * Tags: @P0 (critical) and @P1 (high) match the priority matrix in the CUJ doc.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // A live site can blip; retry once before calling it a failure.
  retries: 1,
  workers: 2,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://idronline.org',
    // Fail a click or fill after 15 s instead of hanging until the test times out.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    // Identify the bot in server logs / analytics so it can be filtered out.
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 IDR-CUJ-Monitor/1.0',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      // Only the journeys whose layout differs on mobile.
      grep: /@mobile/,
    },
  ],
});
