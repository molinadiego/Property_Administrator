import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/**
 * E2E smoke (spec F0 §8). F0-D5 validated locally on macOS Monterey with the
 * system Chrome 150 (`channel: 'chrome'`); CI installs its own Chromium.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'es-ES',
    trace: 'on-first-retry',
    ...(isCI ? {} : { channel: 'chrome' }),
  },
  projects: [
    {
      name: 'desktop-1280',
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-360',
      use: { viewport: { width: 360, height: 740 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
