import { bankTasks } from '../banks/index';
import { generatorsForTask } from './index';
import { validateGeneratedTask } from './harness';
import type { TaskNumber } from '../types';

export function sampleTasks(
  taskNumber: TaskNumber,
  n: number,
  seed = 'sample',
  filesPrefix?: string,
): string {
  if (!Number.isInteger(n) || n < 1 || n > 1000)
    throw new Error('Количество задач: целое число от 1 до 1000.');
  if (taskNumber === 13) {
    if (n > bankTasks.length)
      throw new Error('Количество кураторских наборов не должно превышать 12.');
    return (
      [
        `# Задание №13.1 — ${String(n)} авторских наборов`,
        ...bankTasks.slice(0, n).map((task, index) => {
          const prefix = `${filesPrefix ?? '13-1-files'}/${String(index + 1).padStart(2, '0')}`;
          return `## ${String(index + 1)}. ${task.seed}\n\n${task.statement}\n\n[Набор файлов](${prefix}/dataset.zip) · [Манифест](${prefix}/manifest.json) · [Эталон ODP](${prefix}/files/reference/answer.odp)\n\n### Решение\n\n${task.solution.map((step, i) => `${String(i + 1)}. ${step.text}`).join('\n')}\n\n### Учебные критерии\n\n${task.criteria?.levels.map((level) => `- ${String(level.score)}: ${level.description}`).join('\n') ?? ''}`;
        }),
      ].join('\n\n') + '\n'
    );
  }
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
      ...(task.datasetId
        ? [
            filesPrefix
              ? `[Скачать ZIP](${filesPrefix}/${String(index + 1).padStart(2, '0')}/dataset.zip) · [Манифест](${filesPrefix}/${String(index + 1).padStart(2, '0')}/manifest.json)`
              : `Набор файлов: ${task.datasetId}. Для сохранения ZIP используй --files-dir.`,
          ]
        : []),
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
