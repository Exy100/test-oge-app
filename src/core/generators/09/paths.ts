import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';

type Kind = 'paths-all' | 'paths-via' | 'paths-without' | 'paths-length';
const towns = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж'];
const titles: Record<Kind, string> = {
  'paths-all': 'Количество направленных путей',
  'paths-via': 'Пути через обязательный пункт',
  'paths-without': 'Пути в обход пункта',
  'paths-length': 'Пути с заданным числом дорог',
};
const intro =
  'Схема дорог задана таблицей: 1 в строке X и столбце Y означает единственную дорогу из X в Y; 0 — её отсутствие. Двигаться можно только по направлению дороги. Других дорог нет. Путь определяется последовательностью посещённых пунктов.';

function readGraph(
  statement: string,
): { graph: number[][]; order: number[] } | null {
  if (!statement.startsWith(intro)) return null;
  const rows = statement
    .split('\n')
    .filter((line) => /^\| [АБВГДЕЖ] \|/u.test(line));
  if (rows.length !== 7) return null;
  const graph: number[][] = [];
  for (const [i, line] of rows.entries()) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (
      cells.length !== 8 ||
      cells[0] !== towns[i] ||
      cells.slice(1).some((cell) => cell !== '0' && cell !== '1') ||
      cells[i + 1] !== '0'
    )
      return null;
    graph.push(cells.slice(1).map(Number));
  }
  const indegree = towns.map((_, i) =>
    graph.reduce((sum, row) => sum + (row[i] ?? 0), 0),
  );
  const pending = indegree.flatMap((count, i) => (count === 0 ? [i] : []));
  const order: number[] = [];
  for (let i = 0; i < pending.length; i++) {
    const from = pending[i] ?? -1;
    order.push(from);
    for (let to = 0; to < 7; to++)
      if (graph[from]?.[to]) {
        indegree[to] = (indegree[to] ?? 0) - 1;
        if (indegree[to] === 0) pending.push(to);
      }
  }
  return order.length === 7 ? { graph, order } : null;
}

function paths(kind: Kind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 9,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const rng = new Rng(seed);
      const permutation = [0, ...rng.shuffle([1, 2, 3, 4, 5]), 6];
      const graph = Array.from({ length: 7 }, () => Array<number>(7).fill(0));
      const edges = new Set([
        '0:1',
        '1:2',
        '2:3',
        '3:4',
        '4:5',
        '5:6',
        '0:2',
        '2:4',
        '4:6',
        '0:3',
        '3:6',
      ]);
      for (let from = 0; from < 5; from++)
        for (let to = from + 2; to < 7; to++)
          if (rng.chance(0.25)) edges.add(`${String(from)}:${String(to)}`);
      for (const edge of edges) {
        const [from = 0, to = 0] = edge.split(':').map(Number);
        const row = graph[permutation[from] ?? 0];
        if (row) row[permutation[to] ?? 0] = 1;
      }
      const all: number[][] = [];
      function walk(path: number[]): void {
        const last = path.at(-1) ?? 0;
        if (last === 6) {
          all.push(path);
          return;
        }
        for (let next = 0; next < 7; next++)
          if (graph[last]?.[next]) walk([...path, next]);
      }
      walk([0]);
      const required = permutation[3] ?? 3;
      const length = rng.pick([...new Set(all.map((path) => path.length - 1))]);
      const selected = all.filter((path) =>
        kind === 'paths-via'
          ? path.includes(required)
          : kind === 'paths-without'
            ? !path.includes(required)
            : kind === 'paths-length'
              ? path.length - 1 === length
              : true,
      );
      const result = selected.length;
      const constraint =
        kind === 'paths-via'
          ? `Обязательно посетить пункт ${towns[required] ?? ''}.`
          : kind === 'paths-without'
            ? `Пункт ${towns[required] ?? ''} посещать нельзя.`
            : kind === 'paths-length'
              ? `Использовать ровно ${String(length)} дорог.`
              : 'Дополнительных ограничений нет.';
      const table = [
        '| Из / в | ' + towns.join(' | ') + ' |',
        '| --- | ' + towns.map(() => '---').join(' | ') + ' |',
        ...graph.map(
          (row, i) => `| ${towns[i] ?? ''} | ${row.map(String).join(' | ')} |`,
        ),
      ].join('\n');
      return taskFrom(kind, 9, seed, {
        statement: `${intro}\n\n${table}\n\nСколько различных путей ведёт из А в Ж? ${constraint} Ответ запиши целым числом.`,
        answer: { type: 'integer', value: String(result) },
        solution: [
          {
            text: `Начни в А и следуй только единицам в строке текущего пункта. ${constraint}`,
          },
          {
            text: `Подходящие пути: ${selected.map((path) => path.map((i) => towns[i]).join(' → ')).join('; ')}.`,
          },
          {
            text: `В списке ${String(result)} различных последовательностей. Каждую учитываем один раз. Ответ: ${String(result)}.`,
          },
        ],
        hints: [
          'Не путай строку отправления со столбцом назначения.',
          kind === 'paths-via'
            ? 'Можно отдельно посчитать пути до обязательного пункта и от него до конца.'
            : kind === 'paths-without'
              ? 'Исключи закрытый пункт вместе со всеми входящими и исходящими дорогами.'
              : kind === 'paths-length'
                ? 'Считай дороги, а не пункты: в пути из k дорог k + 1 пунктов.'
                : 'Число путей до пункта равно сумме чисел путей до его непосредственных предшественников.',
          'Разные дороги могут сходиться в одном пункте: пришедшие по ним пути остаются разными.',
        ],
        commonMistakes: [
          {
            answer: String(kind === 'paths-all' ? result * 2 : all.length),
            explanation:
              kind === 'paths-all'
                ? 'Каждый путь посчитан дважды. Возвращение из Ж в А не требуется.'
                : 'Посчитаны все пути без дополнительного ограничения.',
          },
          {
            answer: String(result - 1),
            explanation:
              'Пропущен один подходящий путь. Проверь все развилки и места слияния дорог.',
          },
        ],
      });
    },
    verify(task) {
      if (task.answer.type !== 'integer') return false;
      const parsed = readGraph(task.statement);
      if (!parsed) return false;
      const { graph, order } = parsed;
      const via = /Обязательно посетить пункт ([БВГДЕ])\./u.exec(
        task.statement,
      )?.[1];
      const without = /Пункт ([БВГДЕ]) посещать нельзя\./u.exec(
        task.statement,
      )?.[1];
      const length = Number(
        /Использовать ровно ([1-6]) дорог\./u.exec(task.statement)?.[1],
      );
      if (
        !task.statement.includes('Сколько различных путей ведёт из А в Ж?') ||
        (kind === 'paths-via' && !via) ||
        (kind === 'paths-without' && !without) ||
        (kind === 'paths-length' && !length) ||
        (kind === 'paths-all' &&
          !task.statement.includes('Дополнительных ограничений нет.'))
      )
        return false;
      const closed = towns.indexOf(without ?? '');
      function count(start: number, end: number): number {
        const counts = Array<number>(7).fill(0);
        counts[start] = 1;
        for (const from of order)
          for (let to = 0; to < 7; to++)
            if (from !== closed && to !== closed && graph[from]?.[to])
              counts[to] = (counts[to] ?? 0) + (counts[from] ?? 0);
        return counts[end] ?? 0;
      }
      let expected: number;
      if (kind === 'paths-via') {
        const node = towns.indexOf(via ?? '');
        expected = count(0, node) * count(node, 6);
      } else if (kind === 'paths-length') {
        let layer = Array<number>(7).fill(0);
        layer[0] = 1;
        for (let step = 0; step < length; step++)
          layer = towns.map((_, to) =>
            graph.reduce(
              (sum, row, from) => sum + (row[to] ? (layer[from] ?? 0) : 0),
              0,
            ),
          );
        expected = layer[6] ?? 0;
      } else expected = count(0, 6);
      return String(expected) === task.answer.value;
    },
  };
}
export const pathsAll = paths('paths-all');
export const pathsVia = paths('paths-via');
export const pathsWithout = paths('paths-without');
export const pathsLength = paths('paths-length');
