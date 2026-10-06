import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Include inherited text, hover states, status messages and both button states.
const neutralSurfaces = [
  'canvas',
  'surface',
  'soft',
  'section',
  'hover',
  'accent-surface',
];
export const textPairs = [
  ...['ink', 'muted', 'green'].flatMap((text) =>
    neutralSurfaces.map((background) => [text, background]),
  ),
  ['button-text', 'button-bg'],
  ['button-text', 'button-hover'],
  ['success-text', 'success-bg'],
  ['error-text', 'error-bg'],
  ['violet-text', 'violet-bg'],
  ['orange-text', 'orange-bg'],
  ['banner-text', 'banner-bg'],
  ['banner-muted', 'banner-bg'],
  ['lime', 'banner-bg'],
];

export function contrastRatio(first, second) {
  function luminance(hex) {
    if (!/^#[\da-f]{6}$/iu.test(hex))
      throw new Error(`Invalid opaque sRGB color: ${hex}`);
    const channels = [1, 3, 5].map((offset) => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function checkContrast(css) {
  const tokens = new Map(
    [
      ...css.matchAll(
        /--([\w-]+):\s*light-dark\(\s*(#[\da-f]{6}),\s*(#[\da-f]{6})\s*\)/giu,
      ),
    ].map((match) => [match[1], [match[2], match[3]]]),
  );
  return ['light', 'dark'].flatMap((theme, index) =>
    textPairs.map(([text, background]) => {
      const foreground = tokens.get(text)?.[index];
      const backdrop = tokens.get(background)?.[index];
      if (!foreground || !backdrop)
        throw new Error(`Missing color token: ${text} / ${background}`);
      const ratio = contrastRatio(foreground, backdrop);
      return { theme, text, background, ratio, passes: ratio >= 4.5 };
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = checkContrast(
    await readFile(
      new URL('../src/styles/tokens.css', import.meta.url),
      'utf8',
    ),
  );
  const failures = result.filter((pair) => !pair.passes);
  for (const pair of failures)
    console.error(
      `${pair.theme}: ${pair.text} / ${pair.background} = ${pair.ratio.toFixed(2)}:1`,
    );
  console.log(
    `Contrast: ${result.length} pairs, minimum ${Math.min(...result.map((pair) => pair.ratio)).toFixed(2)}:1, failures ${failures.length}.`,
  );
  if (failures.length) process.exitCode = 1;
}
