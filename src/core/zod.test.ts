import { expect, it, vi } from 'vitest';

it('validates stored data without probing dynamic compilation under strict CSP', async () => {
  vi.resetModules();
  const compile = vi.fn(() => {
    throw new EvalError('Blocked by CSP');
  });
  vi.stubGlobal('Function', compile);
  try {
    const { defaults, parseArea } = await import('./storage/schemas');
    expect(parseArea('settings', defaults().settings)).toEqual(
      defaults().settings,
    );
    expect(() =>
      parseArea('settings', { version: 1, theme: 'invalid' }),
    ).toThrow();
    expect(compile).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
