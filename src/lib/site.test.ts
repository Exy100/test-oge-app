import { describe, expect, it } from 'vitest';
import { sitePath } from './site';

describe('GitHub Pages paths', () => {
  it.each([
    ['/', '/intentional-ci-failure/'],
    ['/favicon.svg', '/test-oge-app/favicon.svg'],
    ['/materials/binary/', '/test-oge-app/materials/binary/'],
    ['/stream/?task=10#answer', '/test-oge-app/stream/?task=10#answer'],
  ])('resolves %s inside the project', (route, expected) => {
    expect(sitePath(route)).toBe(expected);
  });

  it.each([
    'https://example.com/',
    '//example.com/',
    'materials/',
    '/../',
    '/%2e%2e/',
  ])('rejects a route outside the project: %s', (route) => {
    expect(() => sitePath(route)).toThrow(TypeError);
  });
});
