import { bankTasks } from '../banks/index';
import { generatorsForTask } from './index';
import { validateGeneratedTask } from './harness';
import type { TaskNumber } from '../types';

export function sampleTasks(
  taskNumber: TaskNumber,
  n: number,
  seed = 'sample',
  filesPrefix?: string,
  variant: 'presentation' | 'document' = 'presentation',
): string {
  if (!Number.isInteger(n) || n < 1 || n > 1000)
    throw new Error('Количество задач: целое число от 1 до 1000.');
  if (taskNumber === 13) {
    const tasks = bankTasks.filter((task) => task.variant13 === variant);
    const document = variant === 'document';
    if (n > tasks.length)
      throw new Error('Количество кураторских наборов не должно превышать 12.');
    return (
      [
        `# Задание №13.${document ? '2' : '1'} — ${String(n)} авторских наборов`,
        ...tasks.slice(0, n).map((task, index) => {
          const prefix = `${filesPrefix ?? (document ? '13-2-files' : '13-1-files')}/${String(index + 1).padStart(2, '0')}`;
          return `## ${String(index + 1)}. ${task.seed}\n\n${task.statement}\n\n[Набор файлов](${prefix}/dataset.zip) · [Манифест](${prefix}/manifest.json)${document ? ` · [Образец ODT](${prefix}/files/layout/sample.odt)` : ''} · [Эталон ${document ? 'ODT' : 'ODP'}](${prefix}/files/reference/answer.${document ? 'odt' : 'odp'})\n\n### Решение\n\n${task.solution.map((step, i) => `${String(i + 1)}. ${step.text}`).join('\n')}\n\n### Учебные критерии\n\n${task.criteria?.levels.map((level) => `- ${String(level.score)}: ${level.description}`).join('\n') ?? ''}`;
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
      ...(task.taskNumber === 16 && filesPrefix
        ? [
            `[Эталон Python](${filesPrefix}/${String(index + 1).padStart(2, '0')}/files/reference/answer.py) · [Тесты](${filesPrefix}/${String(index + 1).padStart(2, '0')}/files/tests/index.json)`,
          ]
        : []),
      ...(task.taskNumber === 15 && filesPrefix
        ? [
            `[Пример поля PNG](${filesPrefix}/${String(index + 1).padStart(2, '0')}/files/source/example.png) · [Эталон TXT](${filesPrefix}/${String(index + 1).padStart(2, '0')}/files/reference/answer.txt)`,
          ]
        : []),
      ...(task.taskNumber === 14 && filesPrefix
        ? [
            `[Эталон ODS](${filesPrefix}/${String(index + 1).padStart(2, '0')}/files/reference/answer.ods)`,
          ]
        : []),
      ...(task.criteria
        ? [
            '### Учебные критерии',
            ...task.criteria.levels.map(
              (level) => `- ${String(level.score)}: ${level.description}`,
            ),
          ]
        : []),
      '### Решение',
      ...task.solution.map(
        (step, i) =>
          `${String(i + 1)}. ${step.text}${step.formula ? `\n\n$$${step.formula}$$` : ''}${step.code ? `\n\n\`\`\`\n${step.code}\n\`\`\`` : ''}`,
      ),
    );
  }
  return blocks.join('\n\n') + '\n';
}
