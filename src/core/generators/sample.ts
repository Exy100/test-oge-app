import { generatorsForTask } from './index';
import { validateGeneratedTask } from './harness';
import type { TaskNumber } from '../types';

export function sampleTasks(
  taskNumber: TaskNumber,
  n: number,
  seed = 'sample',
): string {
  if (!Number.isInteger(n) || n < 1 || n > 1000)
    throw new Error('Количество задач: целое число от 1 до 1000.');
  const entries = generatorsForTask(taskNumber);
  if (!entries.length)
    throw new Error(
      `Для задания №${String(taskNumber)} нет зарегистрированных генераторов.`,
    );
  const blocks = [`# Задание №${String(taskNumber)} — ${String(n)} примеров`];
  for (let index = 0; index < n; index += 1) {
    const generator = entries[index % entries.length];
    if (!generator) throw new Error('Генератор не найден.');
    const task = validateGeneratedTask(generator, `${seed}:${String(index)}`);
    const answer =
      task.answer.type === 'artifact'
        ? task.answer.referenceId
        : task.answer.value;
    blocks.push(
      `## ${String(index + 1)}. ${generator.title}`,
      `Генератор: ${generator.id}\n\nSeed: ${JSON.stringify(task.seed)}`,
      task.statement,
      `**Ответ:** ${answer}`,
      '### Решение',
      ...task.solution.map(
        (step, i) =>
          `${String(i + 1)}. ${step.text}${step.formula ? `\n\n$$${step.formula}$$` : ''}${step.code ? `\n\n\`\`\`\n${step.code}\n\`\`\`` : ''}`,
      ),
    );
  }
  return blocks.join('\n\n') + '\n';
}
