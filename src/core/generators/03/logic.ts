import { Rng } from '../../rng.ts';
import type { Generator, TaskInstance } from '../../types.ts';
import { taskFrom } from '../task.ts';

type Kind =
  'logic-and' | 'logic-not-or' | 'logic-divisibility' | 'logic-exclusive';
const titles: Record<Kind, string> = {
  'logic-and': 'Наименьшее число: пересечение условий',
  'logic-not-or': 'Наибольшее число: отрицание дизъюнкции',
  'logic-divisibility': 'Подсчёт чисел с условием делимости',
  'logic-exclusive': 'Исключающее ИЛИ: ровно одно условие',
};

function lcm(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return (a * b) / x;
}

function verify(kind: Kind, task: TaskInstance): boolean {
  if (task.answer.type !== 'integer') return false;
  const domain = /^Рассматриваются целые X от 0 до (\d+) включительно\./u.exec(
    task.statement,
  );
  const limit = Number(domain?.[1]);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return false;
  const expression = /Выражение: `([^`]+)`\./u.exec(task.statement)?.[1] ?? '';
  let predicate: (x: number) => boolean;
  if (kind === 'logic-and' || kind === 'logic-not-or') {
    const match = (
      kind === 'logic-and'
        ? /^\(X > (\d+)\) И \(X <= (\d+)\)$/u
        : /^НЕ \(\(X < (\d+)\) ИЛИ \(X > (\d+)\)\)$/u
    ).exec(expression);
    if (!match) return false;
    const lower = Number(match[1]);
    const upper = Number(match[2]);
    if (lower >= upper || upper > limit) return false;
    predicate =
      kind === 'logic-and'
        ? (x) => !(x <= lower || x > upper)
        : (x) => x >= lower && x <= upper;
  } else {
    const match = (
      kind === 'logic-divisibility'
        ? /^\(X кратно (\d+)\) И НЕ \(X кратно (\d+)\)$/u
        : /^\(X кратно (\d+)\) ИСКЛЮЧАЮЩЕЕ ИЛИ \(X кратно (\d+)\)$/u
    ).exec(expression);
    if (!match) return false;
    const p = Number(match[1]);
    const q = Number(match[2]);
    if (p < 2 || q < 2 || p > 10 || q > 10 || p === q) return false;
    predicate =
      kind === 'logic-divisibility'
        ? (x) => x % p === 0 && x % q !== 0
        : (x) => (x % p === 0 && x % q !== 0) || (x % p !== 0 && x % q === 0);
  }
  const accepted: number[] = [];
  for (let x = 0; x <= limit; x += 1) if (predicate(x)) accepted.push(x);
  if (accepted.length === 0) return false;
  const expected =
    kind === 'logic-and'
      ? accepted[0]
      : kind === 'logic-not-or'
        ? accepted.at(-1)
        : accepted.length;
  return task.answer.value === String(expected);
}

function logic(kind: Kind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 3,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const rng = new Rng(seed);
      const a = rng.int(5, 20);
      const b = a + rng.int(4, 15);
      if (kind === 'logic-and' || kind === 'logic-not-or') {
        const minimum = kind === 'logic-and';
        const answer = minimum ? a + 1 : b;
        const expression = minimum
          ? `(X > ${String(a)}) И (X <= ${String(b)})`
          : `НЕ ((X < ${String(a)}) ИЛИ (X > ${String(b)}))`;
        return taskFrom(kind, 3, seed, {
          statement: `Рассматриваются целые X от 0 до ${String(b + 10)} включительно. Выражение: \`${expression}\`. Найди ${minimum ? 'наименьшее' : 'наибольшее'} X, при котором выражение истинно. Знаки < и > — строгие сравнения; <= означает «меньше или равно».`,
          answer: { type: 'integer', value: String(answer) },
          solution: [
            {
              text: minimum
                ? 'Операция И требует одновременной истинности обоих условий.'
                : `По закону де Моргана отрицание ИЛИ даёт (X >= ${String(a)}) И (X <= ${String(b)}). Границы входят в ответный диапазон.`,
            },
            {
              text: `Подходят целые числа от ${String(minimum ? a + 1 : a)} до ${String(b)} включительно.`,
            },
            {
              text: minimum
                ? `Наименьшее: ${String(answer)}. Число ${String(a)} не удовлетворяет строгому условию X > ${String(a)}.`
                : `Наибольшее: ${String(answer)}. При X = ${String(b + 1)} исходное ИЛИ истинно, поэтому его отрицание ложно.`,
            },
          ],
          hints: [
            'Разбери каждое сравнение отдельно.',
            minimum
              ? 'И означает пересечение допустимых значений.'
              : 'Отрицание меняет ИЛИ на И, а строгие сравнения — на нестрогие противоположные.',
            minimum
              ? 'Выбери левую допустимую целую границу.'
              : 'Выбери правую допустимую целую границу.',
          ],
          commonMistakes: minimum
            ? [
                {
                  answer: String(a),
                  explanation:
                    'В условии строгое X > границы. Равенство не подходит.',
                },
                {
                  answer: String(b),
                  explanation:
                    'Это наибольшее подходящее значение, а требуется наименьшее.',
                },
              ]
            : [
                {
                  answer: String(b - 1),
                  explanation:
                    'После отрицания верхняя граница включается. Её не нужно уменьшать на единицу.',
                },
                {
                  answer: String(a),
                  explanation:
                    'Это нижняя граница. Вопрос просит наибольшее подходящее значение.',
                },
              ],
        });
      }
      const exclusive = kind === 'logic-exclusive';
      const p = rng.int(2, 5);
      const q = rng.pick(
        [2, 3, 4, 5, 6, 7].filter(
          (value) => value !== p && (exclusive || p % value !== 0),
        ),
      );
      const limit = rng.int(60, 120);
      const common = lcm(p, q);
      const left = Math.floor(limit / p);
      const right = Math.floor(limit / q);
      const both = Math.floor(limit / common);
      const result = exclusive ? left + right - 2 * both : left - both;
      const expression = `(X кратно ${String(p)}) ${exclusive ? 'ИСКЛЮЧАЮЩЕЕ ИЛИ' : 'И НЕ'} (X кратно ${String(q)})`;
      return taskFrom(kind, 3, seed, {
        statement: `Рассматриваются целые X от 0 до ${String(limit)} включительно. Выражение: \`${expression}\`. Сколько значений X делают выражение истинным? «Кратно» означает делимость без остатка. ${exclusive ? 'ИСКЛЮЧАЮЩЕЕ ИЛИ истинно, когда истинно ровно одно из двух условий.' : 'И требует истинности обоих операндов, НЕ отрицает условие в следующих скобках.'} Ноль кратен любому положительному целому числу.`,
        answer: { type: 'integer', value: String(result) },
        solution: [
          {
            text: `Ноль не подходит: обе делимости для него истинны. Количество положительных кратных ${String(p)}: ${String(limit)} ÷ ${String(p)} с округлением вниз = ${String(left)}.${exclusive ? ` Кратных ${String(q)}: ${String(right)}.` : ''}`,
          },
          {
            text: `Общие кратные делятся на НОК(${String(p)}, ${String(q)}) = ${String(common)}. Их количество: ${String(both)}.`,
          },
          {
            text: exclusive
              ? `Общие кратные вошли в сумму дважды, а нужны числа только из одной группы: ${String(left)} + ${String(right)} − 2 × ${String(both)} = ${String(result)}.`
              : `Исключи из первой группы общие кратные: ${String(left)} − ${String(both)} = ${String(result)}.`,
          },
        ],
        hints: [
          'Отдельно проверь ноль.',
          'Найди количество кратных каждому делителю и их общих кратных.',
          exclusive
            ? 'Общие кратные не подходят; из суммы двух групп их нужно вычесть дважды.'
            : 'Из кратных первому делителю убери кратные обоим.',
        ],
        commonMistakes: exclusive
          ? [
              {
                answer: String(left + right - both),
                explanation:
                  'Это обычное ИЛИ. При исключающем ИЛИ значения, для которых оба условия истинны, не подходят.',
              },
              {
                answer: String(left + right),
                explanation:
                  'Общие кратные посчитаны дважды, хотя они вообще не должны попасть в результат.',
              },
            ]
          : [
              {
                answer: String(left + 1),
                explanation:
                  'Ты учёл все кратные первому делителю, включая ноль, и пропустил условие НЕ.',
              },
              {
                answer: String(result + 1),
                explanation:
                  'Ноль не подходит: он делится на оба числа, поэтому условие НЕ для него ложно.',
              },
            ],
      });
    },
    verify: (task) => verify(kind, task),
  };
}

export const logicAnd = logic('logic-and');
export const logicNotOr = logic('logic-not-or');
export const logicDivisibility = logic('logic-divisibility');
export const logicExclusive = logic('logic-exclusive');
