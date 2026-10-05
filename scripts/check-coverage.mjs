import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import config from '../coverage.config.ts';
import {
  ensureInsideRoot,
  filesIn,
  formatDiagnostic,
} from './quality/files.mjs';
import { readLesson } from './quality/lessons.mjs';

export function parsePhase(args = []) {
  if (!args.length) return config.currentPhase;
  const value =
    args.length === 1 && args[0].startsWith('--phase=')
      ? args[0].slice(8)
      : args.length === 2 && args[0] === '--phase'
        ? args[1]
        : undefined;
  if (value === 'final') return 10;
  if (!/^(?:[0-9]|10)$/u.test(value ?? ''))
    throw new Error('Используй --phase=0…10 или --phase=final.');
  return Number(value);
}

const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) =>
  typeof value === 'string' && value.trim().length > 0;

export async function checkCoverage(
  root = process.cwd(),
  phase = config.currentPhase,
) {
  if (!Number.isInteger(phase) || phase < 0 || phase > 10)
    throw new Error('Некорректная фаза.');
  const findings = [];
  const metrics = [];
  const deferred = [];
  const fail = (file, message, line = 1) =>
    findings.push({ file, line, rule: 'coverage', message });
  const metric = (label, actual, minimum, requiredPhase, file) => {
    const required = phase >= requiredPhase;
    metrics.push({ label, actual, minimum, requiredPhase, required });
    if (required && actual < minimum)
      fail(file, `${label}: ${actual}/${minimum}.`);
  };
  async function loadRegistry(group, name) {
    const file = config.sources[group];
    let stat;
    try {
      stat = await lstat(resolve(root, file));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (phase >= config.phases[group])
        fail(file, 'Обязательный реестр отсутствует.');
      return { entries: [], module: {} };
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(file, 'Реестр должен быть обычным файлом.');
      return { entries: [], module: {} };
    }
    try {
      await ensureInsideRoot(root, file);
      const url = pathToFileURL(resolve(root, file));
      url.searchParams.set('version', String(stat.mtimeMs));
      const module = await import(/* @vite-ignore */ url.href);
      if (!Array.isArray(module[name]))
        throw new Error(`Нужен экспорт массива ${name}.`);
      return { entries: module[name], module };
    } catch (error) {
      fail(file, `Ошибка реестра: ${error.message}`);
      return { entries: [], module: {} };
    }
  }
  function unique(entries, file, validate) {
    const seen = new Set();
    return entries.filter((item, index) => {
      if (!record(item) || !nonempty(item.id) || !validate(item)) {
        fail(file, `Некорректная запись ${index + 1}.`);
        return false;
      }
      if (seen.has(item.id)) {
        fail(file, `Повтор идентификатора ${item.id}.`);
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  const generators = await loadRegistry('generators', 'generators');
  const validGenerators = unique(
    generators.entries,
    config.sources.generators,
    (item) =>
      Number.isInteger(item.taskNumber) &&
      Object.hasOwn(config.generators, item.taskNumber) &&
      nonempty(item.subtype) &&
      typeof item.generate === 'function' &&
      typeof item.verify === 'function',
  );
  const subtypeKeys = new Set();
  for (const item of validGenerators) {
    const key = `${item.taskNumber}:${item.subtype}`;
    if (subtypeKeys.has(key))
      fail(
        config.sources.generators,
        `Повтор подтипа ${key}, новый id не увеличивает покрытие.`,
      );
    subtypeKeys.add(key);
  }
  for (const [number, minimum] of Object.entries(config.generators))
    metric(
      `№${number}: подтипы`,
      new Set(
        validGenerators
          .filter((item) => item.taskNumber === Number(number))
          .map((item) => item.subtype),
      ).size,
      minimum,
      config.phases.generators,
      config.sources.generators,
    );

  const banks = await loadRegistry('banks', 'bankTasks');
  const validBanks = unique(
    banks.entries,
    config.sources.banks,
    (item) =>
      item.taskNumber === 13 &&
      Object.hasOwn(config.banks, item.variant13) &&
      nonempty(item.datasetId) &&
      record(item.answer) &&
      item.answer.type === 'artifact' &&
      item.answer.kind === item.variant13 &&
      nonempty(item.answer.referenceId) &&
      record(item.criteria) &&
      item.criteria.max === 2,
  );
  const datasets = new Set();
  for (const item of validBanks) {
    const key = `${item.variant13}:${item.datasetId}`;
    if (datasets.has(key)) fail(config.sources.banks, `Повтор набора ${key}.`);
    datasets.add(key);
  }
  for (const [kind, minimum] of Object.entries(config.banks))
    metric(
      `№13: ${kind}`,
      new Set(
        validBanks
          .filter((item) => item.variant13 === kind)
          .map((item) => item.datasetId),
      ).size,
      minimum,
      config.phases.banks,
      config.sources.banks,
    );

  const variants = await loadRegistry('variants', 'fixedVariants');
  const validVariants = unique(
    variants.entries,
    config.sources.variants,
    (item) => nonempty(item.seed),
  );
  if (
    validVariants.length &&
    typeof variants.module.buildVariant !== 'function'
  )
    fail(config.sources.variants, 'Нет функции buildVariant.');
  if (
    new Set(validVariants.map((item) => item.seed)).size !==
    validVariants.length
  )
    fail(config.sources.variants, 'Фиксированные варианты повторяют seed.');
  metric(
    'Фиксированные варианты',
    validVariants.length,
    config.variants.minimum,
    config.phases.variants,
    config.sources.variants,
  );
  if (phase >= config.phases.variants)
    for (const id of config.variants.requiredIds)
      if (!validVariants.some((item) => item.id === id))
        fail(config.sources.variants, `Нет варианта ${id}.`);

  const interactives = await loadRegistry('interactives', 'interactives');
  const validInteractives = unique(
    interactives.entries,
    config.sources.interactives,
    (item) =>
      ['2d', '3d'].includes(item.kind) && typeof item.load === 'function',
  );
  for (const [kind, minimum] of Object.entries(config.interactives)) {
    const items = validInteractives.filter((item) => item.kind === kind);
    metric(
      `${kind}: интерактивы`,
      items.length,
      minimum.minimum,
      config.phases.interactives,
      config.sources.interactives,
    );
    if (phase >= config.phases.interactives)
      for (const id of minimum.requiredIds)
        if (!items.some((item) => item.id === id))
          fail(
            config.sources.interactives,
            `Нет обязательного ${kind} интерактива ${id}.`,
          );
    for (const item of items.filter((entry) => entry.kind === '3d')) {
      if (
        !Array.isArray(item.levels) ||
        item.levels.some((level) => !record(level) || !nonempty(level.id)) ||
        new Set(item.levels.map((level) => level.id)).size !==
          item.levels.length
      ) {
        fail(
          config.sources.interactives,
          `${item.id}: нужны уникальные уровни с id.`,
        );
      } else
        metric(
          `${item.id}: уровни`,
          item.levels.length,
          config.interactives['3d'].levelsPerGame,
          config.phases.interactives,
          config.sources.interactives,
        );
    }
  }

  const lessons = [];
  for (const file of (await filesIn(root, config.sources.lessons)).filter(
    (path) => path.endsWith('.mdx'),
  )) {
    const result = readLesson(
      file,
      await readFile(resolve(root, file), 'utf8'),
      config.lessons,
    );
    findings.push(...result.findings);
    if (result.data && !result.findings.length)
      lessons.push({ ...result.data, references: result.references, file });
  }
  const validLessons = unique(lessons, config.sources.lessons, (item) =>
    Object.hasOwn(config.lessons.sections, item.section),
  );
  const lessonIds = new Set(validLessons.map((lesson) => lesson.id));
  const interactiveIds = new Set(validInteractives.map((item) => item.id));
  const plannedIds = new Set(
    Object.values(config.interactives).flatMap((item) => item.requiredIds),
  );
  for (const lesson of validLessons) {
    for (const id of lesson.prerequisites)
      if (!lessonIds.has(id) || id === lesson.id)
        fail(lesson.file, `Неизвестный или собственный пререквизит ${id}.`);
    for (const reference of lesson.references) {
      if (reference.fallback) {
        deferred.push({ lesson: lesson.id, ...reference });
        if (
          phase >= config.phases.interactives ||
          !plannedIds.has(reference.id)
        )
          fail(
            lesson.file,
            `Нельзя использовать временную замену ${reference.id} на этой фазе.`,
            reference.line,
          );
      } else if (!interactiveIds.has(reference.id))
        fail(
          lesson.file,
          `Неизвестный интерактив ${reference.id}.`,
          reference.line,
        );
    }
  }
  metric(
    'Уроки',
    validLessons.length,
    config.lessons.minimum,
    config.phases.lessons,
    config.sources.lessons,
  );
  for (const [section, minimum] of Object.entries(config.lessons.sections))
    metric(
      `Раздел ${section}`,
      validLessons.filter((lesson) => lesson.section === section).length,
      minimum,
      config.phases.lessons,
      config.sources.lessons,
    );

  return { phase, metrics, deferred, findings };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await checkCoverage(
      process.cwd(),
      parsePhase(process.argv.slice(2)),
    );
    console.log(`Покрытие: фаза ${result.phase}. Формат: факт/минимум.`);
    for (const item of result.metrics)
      console.log(
        `${item.label}: ${item.actual}/${item.minimum}${item.required ? '' : ` — обязательно с фазы ${item.requiredPhase}`}`,
      );
    for (const item of result.deferred)
      console.log(
        `Временная визуализация: ${item.lesson} → ${item.id} (${item.file}:${item.line}).`,
      );
    for (const item of result.findings) console.error(formatDiagnostic(item));
    console.log(
      `Нарушений: ${result.findings.length}. Это проверка объёма и структуры, не содержательной правильности.`,
    );
    if (result.findings.length) process.exitCode = 1;
  } catch (error) {
    console.error(`check:coverage: ${error.message}`);
    process.exitCode = 1;
  }
}
