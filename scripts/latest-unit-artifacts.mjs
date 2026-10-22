import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Re-runs retain old artifacts with the same name; never merge by name alone. */
export function latestUnitArtifacts(pages) {
  if (
    !Array.isArray(pages) ||
    pages.some((page) => !Array.isArray(page?.artifacts))
  )
    throw new Error('Нет списка артефактов текущего запуска CI.');
  const artifacts = pages.flatMap((page) => page.artifacts);
  return [1, 2, 3].map((shard) => {
    const name = `unit-shard-${String(shard)}`;
    const pattern = new RegExp(`^${name}(?:-attempt-[1-9][0-9]*)?$`, 'u');
    const candidates = artifacts.filter((artifact) =>
      pattern.test(artifact?.name ?? ''),
    );
    for (const artifact of candidates) {
      if (
        !Number.isSafeInteger(artifact.id) ||
        artifact.id <= 0 ||
        typeof artifact.created_at !== 'string' ||
        !Number.isFinite(Date.parse(artifact.created_at))
      )
        throw new Error(`Повреждённые метаданные ${name}.`);
    }
    candidates.sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
    const latest = candidates[0];
    if (!latest || latest.expired !== false)
      throw new Error(`Нет актуального отчёта ${name}.`);
    if (
      candidates[1] &&
      Date.parse(candidates[1].created_at) === Date.parse(latest.created_at)
    )
      throw new Error(`Неоднозначная дата отчёта ${name}.`);
    return latest.id;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    latestUnitArtifacts(JSON.parse(readFileSync(0, 'utf8'))).join(','),
  );
}
