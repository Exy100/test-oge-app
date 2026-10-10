import { renderRichText } from '../rich-text/render';
import { DatasetManifestSchema, FigureSpecSchema } from '../schemas';
import type {
  Generator,
  TaskInstance,
  FigureSpec,
  DatasetManifest,
} from '../types';
import { validateGeneratedTask } from './harness';

export interface GeneratorChecks {
  /** Must reject ambiguous statements/answers using an independent domain oracle. */
  assertUnique(task: TaskInstance): void;
  assertQuality(task: TaskInstance): void;
  figures?(task: TaskInstance): readonly FigureSpec[];
  /** Check actual file bytes, archive structure and the manifest together. */
  assertFiles?(task: TaskInstance): readonly DatasetManifest[];
}

export function checkGeneratorSeed(
  generator: Generator,
  seed: string,
  checks: GeneratorChecks,
): TaskInstance {
  const task = validateGeneratedTask(generator, seed);
  const snapshot = JSON.stringify(task);
  const repeated = validateGeneratedTask(generator, seed);
  if (snapshot !== JSON.stringify(repeated))
    throw new Error('Генератор недетерминирован.');
  const statements = [
    task.statement,
    ...task.hints,
    ...task.commonMistakes.map((item) => item.explanation),
    ...task.solution.flatMap((step) => [
      step.text,
      ...(step.formula ? [`$$${step.formula}$$`] : []),
    ]),
  ];
  for (const source of statements) {
    if (/(?:\bNaN\b|\bInfinity\b|−0\b|(?<!\d)-0(?![\d.]))/u.test(source))
      throw new Error('Недопустимое число в тексте.');
    if (renderRichText(source).includes('class="math-error"'))
      throw new Error('Ошибка формулы KaTeX.');
  }
  if (task.taskNumber <= 12 && task.commonMistakes.length < 2)
    throw new Error('Нужны две типичные ошибки.');
  if (
    task.answer.type !== 'artifact' &&
    task.commonMistakes.some(
      (item) =>
        task.answer.type !== 'artifact' && item.answer === task.answer.value,
    )
  )
    throw new Error('Типичная ошибка совпадает с ответом.');
  for (const figure of checks.figures?.(task) ?? [])
    FigureSpecSchema.parse(figure);
  if (task.datasetId && !checks.assertFiles)
    throw new Error('Нужна проверка реальных файлов.');
  const manifests = checks.assertFiles?.(task) ?? [];
  for (const manifest of manifests) DatasetManifestSchema.parse(manifest);
  if (
    task.datasetId &&
    !manifests.some((manifest) => manifest.id === task.datasetId)
  )
    throw new Error('Нет манифеста набора задания.');
  checks.assertUnique(task);
  checks.assertQuality(task);
  if (snapshot !== JSON.stringify(task))
    throw new Error('Проверки изменили задание.');
  return task;
}
