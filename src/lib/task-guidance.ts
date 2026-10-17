import { renderRichText } from '../core/rich-text/render';
import type { TaskInstance } from '../core/types';

/** Loaded only on a student's request; each part passes through the shared renderer. */
export function renderTaskGuidance(
  task: TaskInstance,
  kind: 'hint' | 'solution',
  index: number,
): string {
  if (!Number.isInteger(index) || index < 0)
    throw new RangeError('Неверный шаг помощи.');
  if (kind === 'hint') {
    const hint = task.hints[index];
    if (hint === undefined) throw new RangeError('Подсказки закончились.');
    return renderRichText(hint);
  }
  const step = task.solution[index];
  if (!step) throw new RangeError('Решение раскрыто полностью.');
  const parts = [renderRichText(step.text)];
  if (step.code !== undefined) {
    // A fence longer than any run in the code keeps literal backticks inside code.
    const longest = Math.max(
      0,
      ...Array.from(step.code.matchAll(/`+/gu), (match) => match[0].length),
    );
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const code = step.code.endsWith('\n') ? step.code : `${step.code}\n`;
    parts.push(renderRichText(`${fence}\n${code}${fence}`));
  }
  if (step.formula !== undefined)
    parts.push(renderRichText(`$$${step.formula}$$`));
  return parts.join('\n');
}
