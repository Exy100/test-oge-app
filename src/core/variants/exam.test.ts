import { expect, test } from 'vitest';
import { LocalStore, type StoragePort } from '../storage/store';
import { defaults, PREFIX } from '../storage/schemas';
import { VARIANT_VERSION } from './catalog';
import { buildFixedVariant } from './index';
import {
  createExamDraft,
  ExamSession,
  EXAM_DURATION_MS,
  emptyExamNumbers,
  examClock,
} from './exam';

const origin = Date.parse('2026-10-18T10:00:00Z');
function fixture(mode: 'exam' | 'training' = 'exam') {
  const data = new Map<string, string>();
  const port: StoragePort = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  const store = new LocalStore(() => port);
  let time = origin;
  const draft = createExamDraft(
    {
      id: 'attempt-1',
      variantId: 'V01',
      seed: `${VARIANT_VERSION}:V01`,
      variant13: 'document',
    },
    time,
    mode,
  );
  store.write('variantDraft', { version: 1, current: draft });
  const session = new ExamSession(store, draft, () => time);
  return {
    store,
    port,
    data,
    draft,
    session,
    now: (value: number) => {
      time = value;
    },
  };
}
test('an exam starts with an explicit choice, 150 real minutes and no invented answers', () => {
  const { draft } = fixture();
  expect(draft.mode).toBe('exam');
  expect(draft.variant13).toBe('document');
  expect(emptyExamNumbers(draft)).toEqual(
    Array.from({ length: 16 }, (_, i) => i + 1),
  );
  expect(EXAM_DURATION_MS).toBe(9_000_000);
  expect(examClock(EXAM_DURATION_MS)).toBe('02:30:00');
  expect(examClock(1)).toBe('00:00:01');
  expect(examClock(-1)).toBe('00:00:00');
  expect(() =>
    createExamDraft(
      { ...draft, variant13: 'bad' } as unknown as typeof draft,
      origin,
    ),
  ).toThrow();
  const seed = 'я'.repeat(200);
  expect(
    createExamDraft(
      { ...draft, variantId: `${VARIANT_VERSION}:${seed}`, seed },
      origin,
    ).seed,
  ).toBe(seed);
});

test('training never expires, even after days away, and finishes only on request', () => {
  const f = fixture('training');
  f.session.answer(16, 'text', 'print(42)');
  f.now(origin + 7 * 86_400_000);
  f.session.tick();
  f.session.save();
  expect(f.session.snapshot().phase).toBe('running');
  expect(f.session.snapshot().draft.elapsedMs).toBe(0);
  const saved = f.store.read('variantDraft').current;
  if (!saved) throw new Error('Missing training draft');
  const restored = new ExamSession(
    f.store,
    saved,
    () => origin + 8 * 86_400_000,
  );
  restored.tick();
  expect(restored.snapshot().phase).toBe('running');
  restored.finish();
  restored.finish();
  expect(f.store.read('variantAttempts').entries).toHaveLength(1);
  expect(restored.snapshot().attempt).toMatchObject({
    mode: 'training',
    elapsedMs: 0,
    finishedAt: new Date(origin + 8 * 86_400_000).toISOString(),
  });
});

test('training checks reject format errors, preserve checked work and position, and allow another try', () => {
  const f = fixture('training');
  const task = buildFixedVariant('V01').tasks[0];
  if (!task || task.answer.type === 'artifact')
    throw new Error('Missing short answer');
  f.session.answer(1, 'text', '');
  expect(f.session.completeTrainingTask(task)).toBe(false);
  expect(emptyExamNumbers(f.session.snapshot().draft)).toContain(1);
  f.session.answer(1, 'text', task.answer.value);
  expect(f.session.completeTrainingTask(task)).toBe(true);
  f.session.answer(1, 'reasoning', 'Мой ход решения');
  f.session.navigateTraining(9);
  f.session.save();
  f.session.tick();
  f.session.save();
  expect(f.session.snapshot().phase).toBe('running');
  const saved = f.store.read('variantDraft').current;
  if (!saved) throw new Error('Missing training draft');
  expect(saved.currentTask).toBe(9);
  expect(saved.answers[0]).toMatchObject({
    checked: true,
    reasoning: 'Мой ход решения',
  });
  expect(emptyExamNumbers(saved)).not.toContain(1);
  const resumed = new ExamSession(f.store, saved, () => origin);
  resumed.retryTrainingTask(1);
  expect(resumed.snapshot().draft.answers[0]).toMatchObject({
    text: task.answer.value,
    reasoning: 'Мой ход решения',
    checked: false,
  });
  expect(emptyExamNumbers(resumed.snapshot().draft)).toContain(1);
});

test('training preserves zero and absent self-assessments and invalidates scores only when work changes', () => {
  const f = fixture('training');
  const variant = buildFixedVariant('V01', 'document');
  const office = variant.tasks.find((task) => task.taskNumber === 13);
  const sheet = variant.tasks.find((task) => task.taskNumber === 14);
  if (!office || !sheet) throw new Error('Missing office tasks');
  f.session.answer(13, 'text', 'my.odt');
  expect(f.session.completeTrainingTask(office, 0)).toBe(true);
  expect(f.session.completeTrainingTask(sheet, 3)).toBe(true);
  f.session.answer(13, 'reasoning', 'Проверить оформление');
  expect(f.session.snapshot().draft.assessments).toContainEqual({
    taskNumber: 13,
    score: 0,
    source: 'self',
  });
  f.session.answer(13, 'text', 'new.odt');
  expect(
    f.session.snapshot().draft.assessments.map((row) => row.taskNumber),
  ).toEqual([14]);
  expect(emptyExamNumbers(f.session.snapshot().draft)).toContain(13);
  expect(f.session.completeTrainingTask(office, null)).toBe(true);
  expect(
    f.session.snapshot().draft.assessments.map((row) => row.taskNumber),
  ).toEqual([14]);
  expect(emptyExamNumbers(f.session.snapshot().draft)).not.toContain(13);
  for (const score of [-1, 3, 1.5, NaN])
    expect(() => f.session.completeTrainingTask(office, score)).toThrow(
      RangeError,
    );
  f.session.choose13('presentation');
  expect(
    f.session.snapshot().draft.answers.some((row) => row.taskNumber === 13),
  ).toBe(false);
  expect(
    f.session.snapshot().draft.assessments.map((row) => row.taskNumber),
  ).toEqual([14]);
});

test('training-only actions cannot expose or alter a timed exam', () => {
  const f = fixture();
  const task = buildFixedVariant('V01').tasks[0];
  if (!task) throw new Error('Missing task');
  const before = structuredClone(f.session.snapshot().draft);
  expect(f.session.completeTrainingTask(task)).toBe(false);
  f.session.navigateTraining(9);
  f.session.retryTrainingTask(1);
  expect(f.session.snapshot().draft).toEqual(before);
});
test('sleeping through the deadline finishes at 150 minutes without timer ticks', () => {
  const f = fixture();
  f.session.answer(1, 'text', 'сосна');
  f.now(origin + 200 * 60_000);
  f.session.tick();
  const done = f.session.snapshot();
  expect(done.phase).toBe('finished');
  expect(done.attempt?.elapsedMs).toBe(EXAM_DURATION_MS);
  expect(done.attempt?.finishedAt).toBe('2026-10-18T12:30:00.000Z');
  expect(done.attempt?.answers[0]?.text).toBe('сосна');
  expect(done.attempt?.score).toBeNull();
  expect(f.store.read('variantDraft').current).toBeNull();
  expect(f.store.read('variantAttempts').entries).toHaveLength(1);
  f.session.finish();
  f.session.save();
  f.session.tick();
  expect(f.store.read('variantAttempts').entries).toHaveLength(1);
});
test('a backwards clock change cannot give saved time back', () => {
  const f = fixture();
  f.now(origin + 30 * 60_000);
  f.session.tick();
  f.session.save();
  f.now(origin - 10_000);
  f.session.tick();
  expect(f.session.snapshot().draft.elapsedMs).toBe(30 * 60_000);
  f.session.finish();
  expect(f.session.snapshot().attempt?.finishedAt).toBe(f.draft.startedAt);
  expect(f.session.snapshot().attempt?.elapsedMs).toBe(30 * 60_000);
});
test('an answer or mark at the exact deadline cannot change the submitted work', () => {
  const f = fixture();
  f.session.answer(2, 'text', 'АБВ');
  f.now(origin + EXAM_DURATION_MS);
  f.session.answer(2, 'text', 'поздний ответ');
  f.session.mark(2);
  f.session.choose13('presentation');
  expect(f.session.snapshot().attempt?.answers[0]?.text).toBe('АБВ');
  expect(f.session.snapshot().attempt?.marked).toEqual([]);
  expect(f.session.snapshot().attempt?.variant13).toBe('document');
});
test('autosaved answers, notes, marks and choice restore from a new store', () => {
  const f = fixture();
  f.session.answer(1, 'text', 'первый');
  f.session.answer(1, 'text', 'второй');
  f.session.answer(1, 'reasoning', 'мой ход решения');
  f.session.mark(9);
  f.session.mark(1);
  f.session.mark(1);
  f.session.choose13('presentation');
  f.now(origin + 72_000);
  f.session.save();
  const reloaded = new LocalStore(() => f.port);
  const saved = reloaded.read('variantDraft').current;
  if (!saved) throw new Error('Draft was not saved');
  const resumed = new ExamSession(reloaded, saved, () => origin + 5 * 60_000);
  resumed.tick();
  expect(resumed.snapshot().draft.answers).toEqual([
    { taskNumber: 1, text: 'второй', reasoning: 'мой ход решения' },
  ]);
  expect(resumed.snapshot().draft.marked).toEqual([9]);
  expect(resumed.snapshot().draft.variant13).toBe('presentation');
  expect(resumed.snapshot().draft.elapsedMs).toBe(300_000);
  expect(emptyExamNumbers(resumed.snapshot().draft)).not.toContain(1);
  expect(resumed.snapshot().dirty).toBe(false);
});
test('switching №13 clears only its former answer, notes and assessment', () => {
  const f = fixture();
  const draft = {
    ...f.draft,
    answers: [
      { taskNumber: 13 as const, text: 'old.odt', reasoning: 'old' },
      { taskNumber: 14 as const, text: 'result.ods', reasoning: '' },
    ],
    assessments: [
      { taskNumber: 13 as const, score: 2, source: 'self' as const },
      { taskNumber: 14 as const, score: 3, source: 'self' as const },
    ],
  };
  f.store.write('variantDraft', { version: 1, current: draft });
  const session = new ExamSession(f.store, draft, () => origin);
  session.choose13('document');
  expect(session.snapshot().draft.answers).toHaveLength(2);
  session.choose13('presentation');
  expect(session.snapshot().draft.answers.map((row) => row.taskNumber)).toEqual(
    [14],
  );
  expect(
    session.snapshot().draft.assessments.map((row) => row.taskNumber),
  ).toEqual([14]);
  expect(f.store.read('variantDraft').current?.variant13).toBe('presentation');
});
test('clearing or replacing data in another tab stops writes and retains the local copy', () => {
  const f = fixture();
  const unlisten = f.store.subscribe(f.session.checkExternal);
  f.session.answer(3, 'text', 'не потерять');
  f.store.write('settings', { ...defaults().settings, theme: 'dark' });
  expect(f.session.snapshot().phase).toBe('running');
  f.store.write('variantDraft', { version: 1, current: null });
  f.session.save();
  f.session.finish();
  expect(f.session.snapshot().phase).toBe('conflict');
  expect(f.session.snapshot().draft.answers[0]?.text).toBe('не потерять');
  expect(f.store.read('variantDraft').current).toBeNull();
  expect(f.store.read('variantAttempts').entries).toEqual([]);
  unlisten();
});
test('a physical refresh from another tab detects a changed draft', () => {
  const f = fixture();
  f.data.set(
    PREFIX + 'variantDraft',
    JSON.stringify({ version: 1, current: { ...f.draft, marked: [4] } }),
  );
  f.store.refresh();
  f.session.tick();
  expect(f.session.snapshot().phase).toBe('conflict');
  expect(f.store.read('variantDraft').current?.marked).toEqual([4]);
  expect(() => new ExamSession(f.store, f.draft)).toThrow(/изменилась/u);
});
test('quota denial preserves answers and completion in memory', () => {
  const f = fixture();
  f.port.setItem = () => {
    throw new DOMException('Full', 'QuotaExceededError');
  };
  f.session.answer(16, 'text', 'print(42)');
  f.session.save();
  expect(f.store.memoryOnly).toBe(true);
  expect(f.store.read('variantDraft').current?.answers[0]?.text).toBe(
    'print(42)',
  );
  f.session.finish();
  expect(f.store.read('variantAttempts').entries[0]?.answers[0]?.text).toBe(
    'print(42)',
  );
  expect(f.store.messages().join(' ')).toContain('памяти');
});
test('completion keeps the latest 100 attempts, preserves other areas and bounds text', () => {
  const f = fixture();
  f.store.write('variantAttempts', {
    version: 1,
    entries: Array.from({ length: 100 }, (_, i) => ({
      ...f.draft,
      id: `old-${String(i)}`,
      startedAt: new Date(origin - (i + 1) * 1000).toISOString(),
      finishedAt: new Date(origin - (i + 1) * 1000).toISOString(),
      score: null,
    })),
  });
  f.session.answer(16, 'text', 'x'.repeat(20001));
  f.session.answer(16, 'reasoning', 'я'.repeat(1501));
  f.session.finish();
  const entries = f.store.read('variantAttempts').entries;
  expect(entries).toHaveLength(100);
  expect(entries[0]?.id).toBe('attempt-1');
  expect(entries.some((row) => row.id === 'old-99')).toBe(false);
  expect(entries[0]?.answers[0]?.text).toHaveLength(20000);
  expect(entries[0]?.answers[0]?.reasoning).toHaveLength(1500);
  expect(f.store.read('settings')).toEqual(defaults().settings);
});
test('history validation failure leaves an exportable completed copy and the saved draft', () => {
  const f = fixture();
  f.session.answer(1, 'text', 'ответ');
  f.session.save();
  f.store.replace = () => {
    throw new Error('History size');
  };
  f.session.finish();
  expect(f.session.snapshot().phase).toBe('finished');
  expect(f.session.snapshot().notice).toContain('Скачай ответы');
  expect(f.session.snapshot().attempt?.answers[0]?.text).toBe('ответ');
  expect(f.store.read('variantDraft').current?.answers[0]?.text).toBe('ответ');
});
