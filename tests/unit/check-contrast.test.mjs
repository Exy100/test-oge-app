import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { checkContrast, contrastRatio } from '../../scripts/check-contrast.mjs';

const css = await readFile(
  new URL('../../src/styles/tokens.css', import.meta.url),
  'utf8',
);

test('WCAG luminance: black/white, identical colors and symmetry', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBe(21);
  expect(contrastRatio('#123456', '#123456')).toBe(1);
  expect(contrastRatio('#123456', '#abcdef')).toBe(
    contrastRatio('#abcdef', '#123456'),
  );
  expect(() => contrastRatio('transparent', '#ffffff')).toThrow();
});

test('every registered text/background pair passes in both themes', () => {
  const result = checkContrast(css);
  expect(new Set(result.map((pair) => pair.theme))).toEqual(
    new Set(['light', 'dark']),
  );
  expect(result.filter((pair) => !pair.passes)).toEqual([]);
});

test('low contrast and missing tokens are caught', () => {
  const broken = css.replace(
    '--ink: light-dark(#192c28, #edf4e9)',
    '--ink: light-dark(#f5f6f1, #edf4e9)',
  );
  expect(checkContrast(broken)).toContainEqual({
    theme: 'light',
    text: 'ink',
    background: 'canvas',
    ratio: 1,
    passes: false,
  });
  expect(() => checkContrast(css.replace('--ink:', '--missing:'))).toThrow(
    'Missing color token',
  );
});
