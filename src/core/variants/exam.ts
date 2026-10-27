import { examConfig } from '../exam/exam.config';
import { parseArea, type Areas } from '../storage/schemas';
import type { LocalStore } from '../storage/store';
import type { TaskInstance, TaskNumber } from '../types';
import { checkTaskAnswer } from '../checker';

export type ExamDraft = NonNullable<Areas['variantDraft']['current']>;
export type ExamAttempt = Areas['variantAttempts']['entries'][number];
export const EXAM_DURATION_MS = examConfig.durationMinutes * 60_000;
export const examNumbers = Array.from(
  { length: examConfig.taskCount },
  (_, index) => (index + 1) as TaskNumber,
);
export function createExamDraft(
  identity: Pick<ExamDraft, 'id' | 'variantId' | 'seed' | 'variant13'>,
  now: number,
  mode: ExamDraft['mode'] = 'exam',
): ExamDraft {
  const current = parseArea('variantDraft', {
    version: 1,
    current: {
      ...identity,
      pythonFormatVersion: 1,
      mode,
      startedAt: new Date(now).toISOString(),
      elapsedMs: 0,
      answers: [],
      assessments: [],
      marked: [],
    },
  }).current;
  if (!current) throw new Error('Не удалось начать экзамен.');
  return current;
}
/** A saved elapsed value prevents a backwards clock adjustment gaining time. */
export function examElapsed(draft: ExamDraft, now: number): number {
  return Math.min(
    EXAM_DURATION_MS,
    Math.max(draft.elapsedMs, now - Date.parse(draft.startedAt), 0),
  );
}
export function emptyExamNumbers(draft: ExamDraft): TaskNumber[] {
  return examNumbers.filter((number) =>
    draft.mode === 'training'
      ? !draft.answers.find((answer) => answer.taskNumber === number)?.checked
      : !draft.answers
          .find((answer) => answer.taskNumber === number)
          ?.text.trim(),
  );
}
export function examClock(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}
export interface ExamState {
  phase: 'running' | 'finished' | 'conflict';
  draft: ExamDraft;
  attempt: ExamAttempt | null;
  dirty: boolean;
  savedAt: number | null;
  notice: string;
}
/** Owns one attempt. Browser events and intervals are attached by the UI. */
export class ExamSession {
  private state: ExamState;
  private baseline: string;
  private writing = false;
  private listeners = new Set<() => void>();
  constructor(
    private store: LocalStore,
    draft: ExamDraft,
    private now: () => number = Date.now,
  ) {
    const saved = store.read('variantDraft').current;
    if (JSON.stringify(saved) !== JSON.stringify(draft))
      throw new Error('Сохранённая работа изменилась. Открой её заново.');
    this.baseline = JSON.stringify(saved);
    this.state = {
      phase: 'running',
      draft: structuredClone(draft),
      attempt: null,
      dirty: false,
      savedAt: now(),
      notice: '',
    };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ExamState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  checkExternal = () => {
    if (this.writing || this.state.phase !== 'running') return;
    if (
      JSON.stringify(this.store.read('variantDraft').current) !== this.baseline
    )
      this.publish({
        phase: 'conflict',
        notice:
          'Сохранённая работа изменена в другой вкладке или в настройках. Запись остановлена. Скачай свои ответы перед перезагрузкой.',
      });
  };
  tick = () => {
    if (this.state.phase !== 'running') return;
    this.checkExternal();
    if (this.snapshot().phase !== 'running') return;
    if (this.state.draft.mode === 'training') return;
    const elapsedMs = examElapsed(this.state.draft, this.now());
    if (elapsedMs !== this.state.draft.elapsedMs)
      this.publish({ draft: { ...this.state.draft, elapsedMs } });
    if (elapsedMs >= EXAM_DURATION_MS) this.finish();
  };
  answer(number: TaskNumber, field: 'text' | 'reasoning', value: string) {
    this.tick();
    if (this.state.phase !== 'running') return;
    const previous = this.state.draft.answers.find(
      (row) => row.taskNumber === number,
    ) ?? { taskNumber: number, text: '', reasoning: '' };
    const next = {
      ...previous,
      [field]: value.slice(0, field === 'text' ? 20000 : 1500),
      ...(this.state.draft.mode === 'training' && field === 'text'
        ? { checked: false }
        : {}),
    };
    this.publish({
      draft: {
        ...this.state.draft,
        answers: [
          ...this.state.draft.answers.filter(
            (row) => row.taskNumber !== number,
          ),
          next,
        ],
        assessments:
          this.state.draft.mode === 'training' && field === 'text'
            ? this.state.draft.assessments.filter(
                (row) => row.taskNumber !== number,
              )
            : this.state.draft.assessments,
      },
      dirty: true,
    });
  }
  navigateTraining(number: TaskNumber) {
    this.tick();
    if (this.state.phase !== 'running' || this.state.draft.mode !== 'training')
      return;
    this.publish({
      draft: { ...this.state.draft, currentTask: number },
      dirty: true,
    });
  }
  completeTrainingTask(
    task: TaskInstance,
    score: number | null = null,
  ): boolean {
    this.tick();
    if (this.state.phase !== 'running' || this.state.draft.mode !== 'training')
      return false;
    const number = task.taskNumber;
    const answer = this.state.draft.answers.find(
      (row) => row.taskNumber === number,
    ) ?? { taskNumber: number, text: '', reasoning: '' };
    if (
      number <= 12 &&
      checkTaskAnswer(task, answer.text).verdict === 'format_error'
    )
      return false;
    if (
      score !== null &&
      (number <= 12 ||
        !Number.isInteger(score) ||
        score < 0 ||
        score > (number === 14 ? 3 : 2))
    )
      throw new RangeError('Самооценка выходит за критерии задания.');
    const assessments = this.state.draft.assessments.filter(
      (row) => row.taskNumber !== number,
    );
    if (score !== null && number >= 13)
      assessments.push({
        taskNumber: number as 13 | 14 | 15 | 16,
        score,
        source: 'self',
      });
    this.publish({
      draft: {
        ...this.state.draft,
        answers: [
          ...this.state.draft.answers.filter(
            (row) => row.taskNumber !== number,
          ),
          { ...answer, checked: true },
        ],
        assessments,
      },
      dirty: true,
    });
    this.save();
    return true;
  }
  retryTrainingTask(number: TaskNumber) {
    const answer = this.state.draft.answers.find(
      (row) => row.taskNumber === number,
    );
    if (this.state.draft.mode === 'training')
      this.answer(number, 'text', answer?.text ?? '');
  }
  mark(number: TaskNumber) {
    this.tick();
    if (this.state.phase !== 'running') return;
    const marked = this.state.draft.marked;
    this.publish({
      draft: {
        ...this.state.draft,
        marked: marked.includes(number)
          ? marked.filter((n) => n !== number)
          : [...marked, number],
      },
      dirty: true,
    });
  }
  choose13(choice: ExamDraft['variant13']) {
    this.tick();
    if (this.state.phase !== 'running' || choice === this.state.draft.variant13)
      return;
    this.publish({
      draft: {
        ...this.state.draft,
        variant13: choice,
        answers: this.state.draft.answers.filter(
          (row) => row.taskNumber !== 13,
        ),
        assessments: this.state.draft.assessments.filter(
          (row) => row.taskNumber !== 13,
        ),
      },
      dirty: true,
    });
    this.save();
  }
  save = () => {
    this.tick();
    if (this.state.phase !== 'running') return;
    const draft = this.state.draft;
    this.writing = true;
    try {
      this.store.write('variantDraft', { version: 1, current: draft });
      // Storage validates and orders optional fields; compare its canonical copy.
      this.baseline = JSON.stringify(this.store.read('variantDraft').current);
      this.publish({ dirty: false, savedAt: this.now(), notice: '' });
    } catch {
      this.publish({
        notice:
          'Не удалось сохранить работу. Скачай ответы перед закрытием страницы.',
      });
    } finally {
      this.writing = false;
    }
  };
  finish = () => {
    if (this.state.phase !== 'running') return;
    this.checkExternal();
    if (this.snapshot().phase !== 'running') return;
    const draft = {
      ...this.state.draft,
      elapsedMs:
        this.state.draft.mode === 'training'
          ? 0
          : examElapsed(this.state.draft, this.now()),
    };
    const started = Date.parse(draft.startedAt);
    const attempt: ExamAttempt = {
      ...draft,
      finishedAt: new Date(
        Math.max(
          started,
          draft.mode === 'training'
            ? this.now()
            : Math.min(this.now(), started + EXAM_DURATION_MS),
        ),
      ).toISOString(),
      score: null,
    };
    this.writing = true;
    let notice = '';
    try {
      const data = this.store.snapshot();
      const entries = [
        ...data.variantAttempts.entries.filter((row) => row.id !== attempt.id),
        attempt,
      ]
        .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
        .slice(0, 100);
      this.store.replace({
        ...data,
        variantDraft: { version: 1, current: null },
        variantAttempts: { version: 1, entries },
      });
    } catch {
      notice =
        'Работа завершена, но история заполнена. Скачай ответы, чтобы сохранить эту работу.';
    } finally {
      this.writing = false;
    }
    this.publish({ phase: 'finished', draft, attempt, dirty: false, notice });
  };
}
