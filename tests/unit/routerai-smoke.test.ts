import { expect, test, vi } from 'vitest';
import {
  probeRouterAi,
  routerAiProbeTransport,
} from '../../scripts/routerai-smoke';
import { routerAiSettings } from '../fixtures/routerai-data';
import {
  providerPayload,
  providerStream,
  completion,
} from '../fixtures/openrouter-data';
import { z } from '../../src/core/zod';

test('manual smoke probes all three models using synthetic inputs and returns no credentials or work', async () => {
  const transport = vi.fn<typeof fetch>((_url, init) =>
    Promise.resolve(
      z.object({ stream: z.boolean() }).parse(providerPayload(init)).stream
        ? providerStream()
        : completion(),
    ),
  );
  const probe = routerAiProbeTransport(transport);
  const results = await probeRouterAi(
    routerAiSettings,
    'fixture-live-credential',
    probe.transport,
  );
  expect(
    transport.mock.calls.map(
      ([, init]) =>
        z.object({ model: z.string() }).parse(providerPayload(init)).model,
    ),
  ).toEqual([
    routerAiSettings.AI_MODEL_SIMPLE,
    routerAiSettings.AI_MODEL_PRIMARY,
    routerAiSettings.AI_MODEL_FALLBACK,
  ]);
  expect(probe.state).toEqual({ calls: 3, statuses: [200, 200, 200] });
  expect(results).toEqual([
    { mode: 'simple-feedback', protocol: 'sse', passed: true },
    { mode: 'preliminary-grade', protocol: 'json', passed: true },
    { mode: 'opus-summary-probe', protocol: 'sse', passed: true },
  ]);
  expect(JSON.stringify(results)).not.toContain('fixture-live-credential');
  expect(JSON.stringify(results)).not.toContain('print(1)');
});
test('provider fallback cannot exceed the manual smoke cap of three external attempts', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockImplementation((_url, init) =>
      Promise.resolve(
        z.object({ stream: z.boolean() }).parse(providerPayload(init)).stream
          ? providerStream()
          : completion(),
      ),
    );
  const probe = routerAiProbeTransport(transport);
  await expect(
    probeRouterAi(routerAiSettings, 'fixture-live-credential', probe.transport),
  ).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(3);
  expect(probe.state.calls).toBe(3);
});
test('manual smoke cannot send a credential to an unapproved URL', async () => {
  const transport = vi.fn<typeof fetch>();
  const probe = routerAiProbeTransport(transport);
  await expect(probe.transport('https://outside.test/', {})).rejects.toThrow();
  expect(probe.state.calls).toBe(0);
  expect(transport).not.toHaveBeenCalled();
});
