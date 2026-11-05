import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './tests/local-ai',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://127.0.0.1:4328/test-oge-app/',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run ai:local -- --disabled',
    url: 'https://127.0.0.1:4328/test-oge-app/',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    env: {
      ASTRO_TELEMETRY_DISABLED: '1',
      WRANGLER_SEND_METRICS: 'false',
      XDG_CONFIG_HOME: '/tmp/oge-config',
    },
  },
});
