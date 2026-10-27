import { defineConfig } from '@playwright/test';
import browserConfig from './playwright.config';

const chromium = browserConfig.projects?.find(
  (project) => project.name === 'chromium',
);
const baseURL = browserConfig.use?.baseURL;
if (!chromium || !baseURL)
  throw new Error('Не найден профиль Chromium для печати PDF.');

export default defineConfig({
  ...browserConfig,
  testDir: './tests/print',
  outputDir: 'test-results/print',
  workers: 2,
  projects: [
    {
      ...chromium,
      name: 'print-pdf',
      // A4 minus two 15mm margins, in CSS pixels at 96dpi.
      use: { ...chromium.use, viewport: { width: 680, height: 1009 } },
    },
  ],
  webServer: {
    command: 'npm run preview:secure',
    url: baseURL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
  },
});
