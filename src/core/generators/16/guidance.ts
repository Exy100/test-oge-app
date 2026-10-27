import type { ProgramCase, ProgramParameters } from './problems.ts';

interface ProgramGuidance {
  steps: readonly [string, string, string];
  hints: readonly [string, string, string];
}

/** Explain the current parameters and verify the algorithm on actual numbers. */
export function programGuidance(
  p: ProgramParameters,
  example: ProgramCase,
): ProgramGuidance {
  if (p.kind === 'python-digits') {
    const number = Number(example.input.trim());
    const selected = Array.from(String(number), Number).filter(
      (digit) => digit % p.divisor === 0,
    );
    const sum = selected.reduce((total, digit) => total + digit, 0);
    return {
      steps: [
        `Нужны цифры, кратные ${String(p.divisor)}. Число 0 обрабатывай отдельно: его запись содержит одну цифру 0, и остаток от её деления на ${String(p.divisor)} равен 0.`,
        `Для положительного числа остаток n % 10 даёт последнюю цифру. Если digit % ${String(p.divisor)} == 0, увеличь счётчик и прибавь цифру к сумме. Затем выполни n //= 10; число уменьшается, и цикл завершится.`,
        `Проверка примера ${String(number)}: подходящие цифры — ${selected.join(', ') || 'нет'}. Их количество ${String(selected.length)}, сумма ${String(sum)}; вывод ${example.output.trim()} совпадает с примером. Порядок просмотра цифр на эти две величины не влияет.`,
      ],
      hints: [
        `В примере введено ${String(number)}. Получай цифры остатком от деления на 10; нужны только те, которые делятся на ${String(p.divisor)}.`,
        `Условие отбора цифры: digit % ${String(p.divisor)} == 0. После проверки отбрось последнюю цифру операцией n //= 10.`,
        `Отдельно проверь ввод 0: цифра 0 кратна ${String(p.divisor)}, поэтому её нужно учесть в количестве. Проверь и число без подходящих цифр.`,
      ],
    };
  }
  const values = example.input.trim().split(/\s+/u).slice(1).map(Number);
  if (p.kind === 'python-filter') {
    const selected = values.filter(
      (value) => value % p.divisor === 0 && value >= p.threshold,
    );
    const sum = selected.reduce((total, value) => total + value, 0);
    return {
      steps: [
        `После N прочитай ровно N чисел. Начни со счётчика 0 и суммы 0; в ответ попадают только числа, кратные ${String(p.divisor)} и не меньше ${String(p.threshold)}.`,
        `Для каждого x проверь одновременно x % ${String(p.divisor)} == 0 и x >= ${String(p.threshold)}. Знак >= включает границу ${String(p.threshold)}. Только при выполнении обеих проверок увеличивай счётчик и сумму.`,
        `Проверка на примере: подходят ${selected.join(', ') || 'ни одно число'}. Количество ${String(selected.length)}, сумма ${String(sum)}; это даёт вывод ${example.output.trim()}. Если подходящих чисел нет, начальные нули сохраняются.`,
      ],
      hints: [
        `Выпиши два условия для x: кратность ${String(p.divisor)} и граница ${String(p.threshold)}. Нужны сразу оба условия.`,
        `Используй x % ${String(p.divisor)} == 0 and x >= ${String(p.threshold)}. Подходящее число увеличивает количество и добавляется к сумме.`,
        `Проверь N = 1 с числом ${String(p.threshold)} и с числом ${String(p.threshold - 1)}. Затем проверь набор без подходящих чисел: должен получиться вывод 0 0.`,
      ],
    };
  }
  if (p.kind === 'python-pairs') {
    const check = [-2 * p.divisor, -p.divisor, 0];
    const sums = check
      .slice(1)
      .map((value, index) => value + (check[index] ?? 0));
    return {
      steps: [
        `После N отдельно прочитай первое число как previous. Каждое из оставшихся N − 1 чисел образует пару с предыдущим. Сумма пары должна делиться на ${String(p.divisor)}. При N = 1 пар нет.`,
        `Проверь (previous + current) % ${String(p.divisor)} == 0. Для первой подходящей пары присвой её сумму максимуму, даже если она отрицательная. Проверка на числах ${check.join(', ')}: суммы ${sums.join(', ')}, количество ${String(sums.length)}, максимум ${String(Math.max(...sums))}. Начальный максимум 0 дал бы ошибку.`,
        `После каждой пары сохрани current как previous: соседние пары могут перекрываться. Для примера из условия получается ${example.output.trim()}. Если подходящих пар нет, выведи 0 0; иначе — их количество и наибольшую сумму.`,
      ],
      hints: [
        `Ищи соседние пары с суммой, кратной ${String(p.divisor)}. Запомни первое число; следующее проверяй вместе с ним.`,
        `Условие: (previous + current) % ${String(p.divisor)} == 0. После проверки current становится предыдущим для следующей пары.`,
        `Проверь три числа ${check.join(', ')}: обе суммы отрицательны и кратны ${String(p.divisor)}. Максимум нужно брать из подходящих сумм, а не из начального нуля. Проверь также N = 1.`,
      ],
    };
  }
  const runs: number[] = [];
  let current = 0;
  for (const value of values) {
    if (value >= p.threshold) current++;
    else if (current) {
      runs.push(current);
      current = 0;
    }
  }
  if (current) runs.push(current);
  return {
    steps: [
      `Подходят числа не меньше ${String(p.threshold)}. Храни длину текущей цепочки и наибольшую длину; обе начни с 0.`,
      `При x >= ${String(p.threshold)} увеличь текущую длину и сразу обнови максимум. При x < ${String(p.threshold)} сбрось только текущую длину: ранее найденный максимум нужно сохранить.`,
      `В примере цепочки имеют длины ${runs.join(', ') || '0'}; наибольшая — ${String(Math.max(0, ...runs))}, вывод ${example.output.trim()}. Обновление максимума внутри цикла учитывает и цепочку в конце ввода.`,
    ],
    hints: [
      `Граница ${String(p.threshold)} включена: число ${String(p.threshold)} продолжает цепочку, а ${String(p.threshold - 1)} прерывает её.`,
      `Для x >= ${String(p.threshold)} увеличивай текущую длину и сравнивай её с максимумом. При меньшем x устанавливай текущую длину в 0.`,
      `Проверь числа ${String(p.threshold - 1)}, ${String(p.threshold)}, ${String(p.threshold + 1)}: подходящая цепочка находится в конце ввода. Её нельзя потерять при завершении цикла.`,
    ],
  };
}
