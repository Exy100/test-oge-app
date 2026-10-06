/** Match the native range's step grid, including a maximum between two steps. */
export function sliderValue(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const steps = (max - min) / step;
  if (
    ![value, min, max, step, steps].every(Number.isFinite) ||
    max <= min ||
    step <= 0 ||
    steps > Number.MAX_SAFE_INTEGER
  )
    throw new RangeError('Некорректный диапазон ползунка.');
  const last = Math.floor(steps + Number.EPSILON * Math.max(1, steps) * 4);
  const index = Math.min(last, Math.max(0, Math.round((value - min) / step)));
  // Do not announce floating point artefacts such as 0.30000000000000004.
  return Number((min + index * step).toPrecision(15));
}
