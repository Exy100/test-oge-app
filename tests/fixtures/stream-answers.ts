import { checkTaskAnswer } from '../../src/core/checker';
import type { TaskInstance } from '../../src/core/types';

export function answer(task: TaskInstance, correct: boolean) {
  const expected = task.answer;
  if (expected.type === 'artifact')
    throw new Error('В сценарии нужен краткий ответ.');
  if (correct) return expected.value;
  const alternatives =
    expected.type === 'integer'
      ? [
          String(BigInt(expected.acceptedRange?.max ?? expected.value) + 1n),
          String(BigInt(expected.acceptedRange?.min ?? expected.value) - 1n),
        ]
      : expected.type === 'sequence'
        ? [
            ({ digits: '01', latin: 'AB', cyrillic: 'АБ' }[expected.alphabet]
              .split('')
              .find((symbol) => symbol !== expected.value[0]?.toUpperCase()) ??
              '') + expected.value.slice(1),
          ]
        : ['НЕСОВПАДЕНИЕ', '0', '1', 'А', 'Б', 'A', 'B', '123', 'ABC'];
  const wrong = alternatives.find(
    (raw) => checkTaskAnswer(task, raw).verdict === 'incorrect',
  );
  if (!wrong)
    throw new Error(
      `Нет неверного ответа для ${task.generatorId}: ${JSON.stringify(expected)}`,
    );
  return wrong;
}
