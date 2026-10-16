import type { TaskInstance } from '../types.ts';
import { describeFigure } from '../figures/describe.ts';

/** Review exports must retain the actual answer policy, not only one example. */
export function reviewAnswer(task: TaskInstance): string {
  const answer = task.answer;
  if (answer.type === 'artifact') return answer.referenceId;
  if (answer.type === 'sequence' && answer.alternatives)
    return [answer.value, ...answer.alternatives].join(', ');
  if (answer.type === 'integer' && answer.acceptedRange) {
    const { min, max } = answer.acceptedRange;
    return `любое целое ${[
      min !== undefined ? `A ≥ ${min}` : null,
      max !== undefined ? `A ≤ ${max}` : null,
    ]
      .filter(Boolean)
      .join(' и ')}`;
  }
  return answer.value;
}

/** GitHub renders Mermaid in Markdown; the text description also works offline. */
export function reviewFigure(task: TaskInstance): string[] {
  const figure = task.figure;
  if (!figure) return [];
  if (figure.kind !== 'directed-graph')
    throw new Error('Для этого рисунка не определён формат экспорта.');
  const nodeIds = new Map(
    figure.nodes.map((node, i) => [node.id, `n${String(i)}`]),
  );
  const escape = (label: string) =>
    label
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replace(/[\r\n]/gu, ' ');
  return [
    figure.description,
    '```mermaid\nflowchart LR\n' +
      [
        ...figure.nodes.map(
          (node) =>
            `    ${nodeIds.get(node.id) ?? ''}["${escape(node.label)}"]`,
        ),
        ...figure.edges.map(
          ({ from, to }) =>
            `    ${nodeIds.get(from) ?? ''} --> ${nodeIds.get(to) ?? ''}`,
        ),
      ].join('\n') +
      '\n```',
    `Текстовое описание: ${describeFigure(figure)}`,
  ];
}
