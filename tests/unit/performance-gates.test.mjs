import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import {
  assertInteractionBudget,
  assertResultNavigation,
  interactionScenarios,
  scenariosForShard,
} from '../../scripts/performance-scenarios.mjs';

test('every page template and full result state has an interaction scenario', () => {
  expect(interactionScenarios.map(({ id }) => id).toSorted()).toEqual(
    [
      'home',
      'materials',
      'lesson-2d',
      'lesson-3d',
      'stream',
      'variants',
      'variant',
      'exam',
      'training',
      'random',
      'print',
      'result-fixed',
      'result-random',
      'about',
      'privacy',
      'settings',
      'not-found',
    ].toSorted(),
  );
  const { ci } = createRequire(import.meta.url)('../../lighthouserc.cjs');
  for (const { path, status } of interactionScenarios)
    if (status !== 404)
      expect(ci.collect.url).toContain(
        'http://127.0.0.1:4323/test-oge-app/' + path,
      );
  expect(new Set(interactionScenarios.map(({ id }) => id)).size).toBe(
    interactionScenarios.length,
  );
});

test('adding a production page template requires an explicit performance scenario', () => {
  const templates = {
    'index.astro': ['home'],
    'materials/index.astro': ['materials'],
    'materials/[section]/[lesson].astro': ['lesson-2d', 'lesson-3d'],
    'stream.astro': ['stream'],
    'variants/index.astro': ['variants'],
    'variants/[id].astro': ['variant', 'exam', 'training'],
    'variants/random.astro': ['random'],
    'variants/print.astro': ['print'],
    'variants/[id]/result.astro': ['result-fixed', 'result-random'],
    'about.astro': ['about'],
    'privacy.astro': ['privacy'],
    'settings.astro': ['settings'],
    '404.astro': ['not-found'],
  };
  expect(
    readdirSync('src/pages', { recursive: true })
      .filter((file) => file.endsWith('.astro'))
      .toSorted(),
  ).toEqual(Object.keys(templates).toSorted());
  expect(Object.values(templates).flat().toSorted()).toEqual(
    interactionScenarios.map(({ id }) => id).toSorted(),
  );
});

test('the four interaction shards partition all scenarios without omissions', () => {
  expect(['1', '2', '3', '4'].flatMap(scenariosForShard)).toEqual(
    expect.arrayContaining(interactionScenarios),
  );
  expect(['1', '2', '3', '4'].flatMap(scenariosForShard)).toHaveLength(
    interactionScenarios.length,
  );
  expect(scenariosForShard(undefined)).toEqual(interactionScenarios);
  for (const value of ['0', '5', 'wrong', ''])
    expect(() => scenariosForShard(value)).toThrow('OGE_LH_SHARD');
});

test('INP must be observed after trusted input, finite and at most 200 ms', () => {
  const metric = (value) => ({
    value,
    entries: [{ name: 'click', duration: value }],
    trustedInputs: 1,
  });
  expect(assertInteractionBudget(metric(200))).toBe(200);
  expect(assertInteractionBudget(metric(0))).toBe(0);
  expect(() => assertInteractionBudget(metric(201))).toThrow('> 200');
  for (const value of [
    undefined,
    null,
    {},
    metric(-1),
    metric(NaN),
    metric(Infinity),
    { ...metric(0), entries: [] },
    { ...metric(10), trustedInputs: 0 },
  ])
    expect(() => assertInteractionBudget(value)).toThrow('INP отсутствует');
});

const navigation = () => ({
  categories: Object.fromEntries(
    ['performance', 'accessibility', 'best-practices', 'seo'].map((id) => [
      id,
      { score: 1 },
    ]),
  ),
  audits: {
    'largest-contentful-paint': { numericValue: 2500 },
    'cumulative-layout-shift': { numericValue: 0.05 },
  },
});
test('saved results obey all navigation scores, LCP and CLS budgets', () => {
  expect(() => assertResultNavigation(navigation())).not.toThrow();
  for (const id of ['performance', 'accessibility', 'best-practices', 'seo']) {
    const lhr = navigation();
    lhr.categories[id].score = 0.89;
    expect(() => assertResultNavigation(lhr)).toThrow(id);
    delete lhr.categories[id];
    expect(() => assertResultNavigation(lhr)).toThrow(id);
  }
  for (const id of ['largest-contentful-paint', 'cumulative-layout-shift']) {
    const lhr = navigation();
    lhr.audits[id].numericValue *= 1.01;
    expect(() => assertResultNavigation(lhr)).toThrow(id);
    delete lhr.audits[id];
    expect(() => assertResultNavigation(lhr)).toThrow(id);
  }
});

test('the required performance command runs interaction gates after navigation audits', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.scripts.lh).toBe(
    'npm run build && lhci autorun && node scripts/check-interactions.mjs',
  );
});
