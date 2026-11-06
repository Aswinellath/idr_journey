import { defineConfig, devices } from '@playwright/test';
import { site } from './site.config';

/**
 * 3 browsers × 3 screen sizes = 9 combinations.
 * Firefox doesn't support mobile emulation, so its tablet/mobile runs use the screen size only.
 */
const desktop = { width: 1440, height: 900 };

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: process.env.CI ? 3 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: site.baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Desktop
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: desktop } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: desktop } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: desktop } },
    // Tablet
    { name: 'chromium-tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    { name: 'firefox-tablet', use: { browserName: 'firefox', viewport: { width: 810, height: 1080 } } },
    { name: 'webkit-tablet', use: { ...devices['iPad (gen 7)'] } },
    // Mobile
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'firefox-mobile', use: { browserName: 'firefox', viewport: { width: 390, height: 844 } } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 14'] } },
  ],
});
