import { expect, test } from '@playwright/test';
import { observeSecurity } from '../fixtures/security-browser';

test('the audit rejects actual CSP violations, including a blocked external resource', async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing test origin.');
  const audit = await observeSecurity(context, new URL(baseURL).origin);
  await page.goto('./');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent =
      'document.documentElement.dataset.securityProbe = "executed"';
    document.head.append(script);
    const image = document.createElement('img');
    image.src = 'https://security-probe.invalid/blocked.png';
    document.body.append(image);
  });
  await expect
    .poll(() =>
      audit.findings.some((line) => line.startsWith('CSP script-src')),
    )
    .toBe(true);
  await expect
    .poll(() => audit.findings.some((line) => line.startsWith('CSP img-src')))
    .toBe(true);
  await expect(page.locator('html')).not.toHaveAttribute('data-security-probe');
  await expect(audit.assertClean()).rejects.toThrow('No CSP violations');
});

test('the request observer rejects a foreign request even in a controlled document without CSP', async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing test origin.');
  const audit = await observeSecurity(context, new URL(baseURL).origin);
  // Fulfil both routes locally: the probe never reaches a third-party server.
  await page.route('https://security-probe.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
  );
  await page.route('**/security-audit-probe/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body><img src="https://security-probe.invalid/pixel.svg" alt="probe"></body></html>',
    }),
  );
  await page.goto('security-audit-probe/');
  expect(
    audit.findings.some((line) => line.startsWith('External request:')),
  ).toBe(true);
  await expect(audit.assertClean()).rejects.toThrow(
    'No CSP violations or third-party requests',
  );
});

test('the cookie gate rejects a real browser cookie', async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing test origin.');
  const audit = await observeSecurity(context, new URL(baseURL).origin);
  await page.goto('./');
  await context.addCookies([
    {
      name: 'security_probe',
      value: '1',
      url: new URL(baseURL).origin,
      secure: true,
      sameSite: 'Strict',
    },
  ]);
  expect(await context.cookies()).toHaveLength(1);
  await expect(audit.assertClean()).rejects.toThrow(
    'The site must not set cookies',
  );
});
