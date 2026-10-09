import type { FigureSpec } from '../types';

export const logicLabels = {
  input: 'Вход',
  not: 'НЕ',
  and: 'И',
  or: 'ИЛИ',
  xor: 'ИСКЛ. ИЛИ',
} as const;

export function describeFigure(spec: FigureSpec): string {
  const cell = (value: { row: number; column: number }) =>
    `(${String(value.row + 1)}, ${String(value.column + 1)})`;
  let details: string;
  switch (spec.kind) {
    case 'weighted-graph':
    case 'directed-graph': {
      const names = new Map(spec.nodes.map((node) => [node.id, node.label]));
      details = `Вершины: ${spec.nodes.map((node) => node.label).join(', ')}. ${spec.kind === 'weighted-graph' ? 'Неориентированные рёбра' : 'Дуги'}: ${spec.edges.map((edge) => `${names.get(edge.from) ?? edge.from} ${spec.kind === 'weighted-graph' ? '—' : '→'} ${names.get(edge.to) ?? edge.to}${'weight' in edge ? `, вес ${String(edge.weight)}` : ''}`).join('; ') || 'нет'}.`;
      break;
    }
    case 'logic-circuit':
      details = `${spec.nodes.map((node) => (node.operation === 'input' ? `Вход ${node.id}: ${node.label}` : `${node.id} = ${logicLabels[node.operation]}(${node.inputs.join(', ')})`)).join('; ')}. Выход: ${spec.output}.`;
      break;
    case 'table':
      details = `Столбцы: ${spec.columns.join(', ')}. ${spec.rows.map((row, index) => `Строка ${String(index + 1)}: ${row.map(String).join('; ')}`).join('. ')}.`;
      break;
    case 'place-value':
      details = `Основание ${String(spec.base)}. ${spec.digits.map((digit, index) => `Цифра ${digit.toString(spec.base).toUpperCase()}, вес ${String(BigInt(spec.base) ** BigInt(spec.digits.length - index - 1))}`).join('; ')}.`;
      break;
    case 'code-table':
      details =
        spec.entries
          .map((entry) => `${entry.symbol}: ${entry.code}`)
          .join('; ') + '.';
      break;
    case 'file-tree':
      details =
        spec.entries
          .map(
            (entry) =>
              `${entry.kind === 'directory' ? 'Каталог' : 'Файл'} ${entry.path}${entry.kind === 'file' ? `, ${String(entry.size)} байт` : ''}`,
          )
          .join('; ') + '.';
      break;
    case 'network-address':
      details = `Протокол ${spec.protocol}; сервер ${spec.host}; путь ${spec.path}. Адрес: ${spec.protocol}://${spec.host}/${spec.path}.`;
      break;
    case 'robot-field':
      details = `Поле ${String(spec.rows)} × ${String(spec.columns)}. Координаты: строка, столбец, начиная с 1. Старт ${cell(spec.start)}. Закрашены: ${spec.painted.map(cell).join(', ') || 'нет'}. Цели: ${spec.targets.map(cell).join(', ') || 'нет'}. Стены между клетками: ${spec.walls.map((wall) => `${cell(wall.from)} и ${cell(wall.to)}`).join('; ') || 'нет'}.`;
      break;
  }
  return `${spec.description} ${details}`;
}
