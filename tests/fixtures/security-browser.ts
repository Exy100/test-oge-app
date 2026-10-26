import { expect, test as base, type BrowserContext } from '@playwright/test';

declare global {
  interface Window {
    reportSecurityViolation: (finding: string) => Promise<void>;
    pendingSecurityReports?: Promise<void>[];
  }
}

/** Observe before navigation, including child frames, workers and later documents. */
export async function observeSecurity(context: BrowserContext, origin: string) {
  const findings: string[] = [];
  const external = (address: string) => {
    const url = new URL(address);
    if (url.protocol === 'data:' || url.protocol === 'about:') return false;
    if (url.protocol === 'ws:') url.protocol = 'http:';
    if (url.protocol === 'wss:') url.protocol = 'https:';
    return url.origin !== origin;
  };
  context.on('request', (request) => {
    if (external(request.url()))
      findings.push(`External request: ${request.method()} ${request.url()}`);
  });
  context.on('console', (message) => {
    if (
      /content.security.policy|violat.*(?:policy|directive)/iu.test(
        message.text(),
      )
    )
      findings.push(`CSP console: ${message.text()}`);
  });
  context.on('page', (page) => {
    page.on('websocket', (socket) => {
      if (external(socket.url()))
        findings.push(`External WebSocket: ${socket.url()}`);
    });
  });
  await context.exposeBinding(
    'reportSecurityViolation',
    (_source, finding: string) => {
      findings.push(finding);
    },
  );
  await context.addInitScript(() => {
    const reports: Promise<void>[] = [];
    window.pendingSecurityReports = reports;
    document.addEventListener('securitypolicyviolation', (event) => {
      reports.push(
        window.reportSecurityViolation(
          `CSP ${event.effectiveDirective}: ${event.blockedURI}`,
        ),
      );
    });
  });
  return {
    findings,
    async assertClean() {
      for (const page of context.pages()) {
        if (!page.isClosed())
          await page.evaluate(async () => {
            await Promise.all(window.pendingSecurityReports ?? []);
          });
      }
      expect(findings, 'No CSP violations or third-party requests').toEqual([]);
      expect(await context.cookies(), 'The site must not set cookies').toEqual(
        [],
      );
    },
  };
}

export const test = base.extend<{
  securityAudit: Awaited<ReturnType<typeof observeSecurity>>;
}>({
  securityAudit: [
    async ({ context, baseURL }, use) => {
      if (!baseURL) throw new Error('Security audit requires the site origin.');
      const audit = await observeSecurity(context, new URL(baseURL).origin);
      await use(audit);
      await audit.assertClean();
    },
    { auto: true },
  ],
});

export { expect };
