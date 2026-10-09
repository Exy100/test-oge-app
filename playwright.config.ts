import { defineConfig, devices } from '@playwright/test';
import { SITE_BASE } from './src/lib/site';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const chromiumOptions = executablePath
  ? { launchOptions: { executablePath } }
  : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `https://127.0.0.1:4322${SITE_BASE}`,
    // Only the local test servers use an ephemeral self-signed certificate.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'figure-visual',
      testMatch: '**/figures-visual.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1000, height: 800 },
        ...chromiumOptions,
      },
    },
    {
      name: 'chromium',
      testIgnore: '**/figures-visual.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumOptions },
    },
    {
      testIgnore: '**/figures-visual.spec.ts',
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      testIgnore: '**/figures-visual.spec.ts',
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile',
      testIgnore: '**/figures-visual.spec.ts',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 800 },
        ...chromiumOptions,
      },
    },
  ],
  webServer: [
    {
      command: 'npm run preview:headers',
      url: `https://127.0.0.1:4326${SITE_BASE}`,
      ignoreHTTPSErrors: true,
      env: {
        WRANGLER_SEND_METRICS: 'false',
        XDG_CONFIG_HOME: '/tmp/oge-config',
        WRANGLER_LOG_PATH: '/tmp/oge-wrangler.log',
      },
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview:secure',
      url: `https://127.0.0.1:4322${SITE_BASE}`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4324',
      url: `http://127.0.0.1:4324${SITE_BASE}dev/ui/`,
      reuseExistingServer: false,
    },
  ],
});
