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
    baseURL: `http://127.0.0.1:4322${SITE_BASE}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...chromiumOptions },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'mobile',
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
      url: `http://127.0.0.1:4326${SITE_BASE}`,
      env: {
        WRANGLER_SEND_METRICS: 'false',
        XDG_CONFIG_HOME: '/tmp/oge-config',
        WRANGLER_LOG_PATH: '/tmp/oge-wrangler.log',
      },
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4322',
      url: `http://127.0.0.1:4322${SITE_BASE}`,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4324',
      url: `http://127.0.0.1:4324${SITE_BASE}dev/ui/`,
      reuseExistingServer: false,
    },
  ],
});
