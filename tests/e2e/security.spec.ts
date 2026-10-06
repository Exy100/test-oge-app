import { expect, test } from '@playwright/test';

test('Cloudflare: HTTP-заголовки и рабочая практика под CSP', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (
      /content.security.policy|violat.*(?:policy|directive)/iu.test(
        message.text(),
      )
    )
      violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));
  const response = await page.goto('http://127.0.0.1:4326/test-oge-app/');
  expect(response?.status()).toBe(200);
  const headers = response?.headers();
  expect(headers?.['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers?.['content-security-policy']).not.toMatch(
    /unsafe-inline|unsafe-eval/u,
  );
  expect(headers?.['strict-transport-security']).toBe('max-age=31536000');
  expect(headers?.['x-content-type-options']).toBe('nosniff');
  expect(headers?.['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers?.['permissions-policy']).toBe(
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  expect(headers?.['cross-origin-opener-policy']).toBe('same-origin');
  await page.getByLabel('Твой ответ').fill('48');
  await page.getByRole('button', { name: 'Проверить' }).click();
  await expect(page.getByRole('status')).toContainText('Верно, получилось!');
  await page.getByLabel('Тема', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(violations).toEqual([]);
});

test('GitHub Pages: meta-CSP блокирует посторонний inline-скрипт', async ({
  page,
}) => {
  await page.goto('./');
  const policy = page.locator('meta[http-equiv="content-security-policy"]');
  await expect(policy).toHaveCount(1);
  expect(await policy.getAttribute('content')).not.toMatch(
    /unsafe-inline|unsafe-eval|frame-ancestors/u,
  );
  expect(
    await page.evaluate(() => {
      const meta = document.querySelector(
        'meta[http-equiv="content-security-policy"]',
      );
      const script = document.querySelector('script');
      return Boolean(
        meta &&
        script &&
        meta.compareDocumentPosition(script) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);
  const violation = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener(
          'securitypolicyviolation',
          (event) => {
            resolve(event.effectiveDirective);
          },
          { once: true },
        );
        const script = document.createElement('script');
        script.textContent =
          'document.documentElement.dataset.injected = "yes"';
        document.head.append(script);
      }),
  );
  expect(violation).toMatch(/^script-src(?:-elem)?$/u);
  await expect(page.locator('html')).not.toHaveAttribute('data-injected');
  await expect(page.getByRole('button', { name: 'Проверить' })).toBeEnabled();
});
