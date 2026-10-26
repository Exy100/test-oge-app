// Navigation budgets remain in lighthouserc.cjs. INP uses Google's web-vitals
// library: Lighthouse 13.5's trace parser cannot read Chromium 151 interactions.
export const interactionScenarios = [
  { id: 'home', path: '', action: 'answer' },
  { id: 'materials', path: 'materials/', action: 'filter' },
  { id: 'lesson-2d', path: 'materials/i2/code-tables/', action: 'lesson' },
  { id: 'lesson-3d', path: 'materials/i1/bits-bytes/', action: 'three' },
  { id: 'stream', path: 'stream/', action: 'answer' },
  { id: 'variants', path: 'variants/', action: 'theme' },
  { id: 'variant', path: 'variants/V01/', action: 'setup' },
  { id: 'exam', path: 'variants/V01/?exam=1', action: 'exam' },
  { id: 'training', path: 'variants/V01/?training=1', action: 'training' },
  {
    id: 'random',
    path: 'variants/random/?seed=lighthouse-variant',
    action: 'setup',
  },
  { id: 'print', path: 'variants/print/?id=V01', action: 'print' },
  { id: 'result-fixed', path: 'variants/V01/result/', action: 'result' },
  { id: 'result-random', path: 'variants/random/result/', action: 'result' },
  { id: 'about', path: 'about/', action: 'theme' },
  { id: 'privacy', path: 'privacy/', action: 'theme' },
  { id: 'settings', path: 'settings/', action: 'settings' },
  { id: 'not-found', path: 'missing-lesson/', action: 'theme', status: 404 },
];

export function scenariosForShard(shard) {
  if (shard !== undefined && !['1', '2', '3', '4'].includes(shard))
    throw new Error('OGE_LH_SHARD должен быть от 1 до 4.');
  return interactionScenarios.filter(
    (_, index) => shard === undefined || index % 4 === Number(shard) - 1,
  );
}

export function assertInteractionBudget(metric) {
  if (
    !metric ||
    !Number.isFinite(metric.value) ||
    metric.value < 0 ||
    !metric.entries?.length ||
    !(metric.trustedInputs > 0)
  )
    throw new Error(
      'INP отсутствует: сценарий должен содержать реальный ввод.',
    );
  if (metric.value > 200)
    throw new Error(`INP ${String(metric.value)} мс > 200 мс.`);
  return metric.value;
}

export function assertResultNavigation(lhr) {
  if (lhr.runtimeError) throw new Error(lhr.runtimeError.message);
  for (const [id, minimum] of Object.entries({
    performance: 0.9,
    accessibility: 0.95,
    'best-practices': 0.95,
    seo: 0.95,
  })) {
    const score = lhr.categories[id]?.score;
    if (!Number.isFinite(score) || score < minimum)
      throw new Error(`${id}: ${String(score)} < ${String(minimum)}.`);
  }
  for (const [id, maximum] of [
    ['largest-contentful-paint', 2500],
    ['cumulative-layout-shift', 0.05],
  ]) {
    const value = lhr.audits[id]?.numericValue;
    if (!Number.isFinite(value) || value > maximum)
      throw new Error(`${id}: ${String(value)} > ${String(maximum)}.`);
  }
}
