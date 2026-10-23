import { Rng } from '../../core/rng';
export type SheetCell = number | string;
const rng = new Rng('office-lab-v1');
export const labRows: readonly (readonly SheetCell[])[] = [
  ['Участник', 'Школа', 'Класс', 'Баллы'],
  ...Array.from({ length: 12 }, (_, i) => [
    i + 1,
    1 + (i % 3),
    i === 11 ? 7 : 7 + (Math.floor(i / 2) % 3),
    i === 0 ? 0 : rng.int(80, 300),
  ]),
];
interface Token {
  kind: 'number' | 'string' | 'ref' | 'name' | 'symbol';
  text: string;
  start: number;
  end: number;
}
export function tokens(raw: string): Token[] {
  if (raw.length > 240 || !raw.trim().startsWith('='))
    throw new RangeError('Начни формулу с =; максимум 240 знаков.');
  const result: Token[] = [];
  let at = raw.indexOf('=') + 1;
  while (at < raw.length) {
    if (/\s/u.test(raw[at] ?? '')) {
      at++;
      continue;
    }
    const rest = raw.slice(at),
      match =
        /^("(?:[^"\n]|"")*"|\$?[A-Za-z]{1,2}\$?[1-9]\d{0,3}(?![\wА-Яа-я])|\d+(?:[.,]\d+)?|[A-Za-zА-Яа-яЁё]+|[+*/();:-])/u.exec(
          rest,
        );
    if (!match) throw new RangeError('Неизвестный знак или адрес в формуле.');
    const text = match[0],
      kind: Token['kind'] = text.startsWith('"')
        ? 'string'
        : /^\$?[A-Za-z]{1,2}\$?\d/u.test(text)
          ? 'ref'
          : /^\d/u.test(text)
            ? 'number'
            : /^[A-Za-zА-Яа-яЁё]/u.test(text)
              ? 'name'
              : 'symbol';
    result.push({ kind, text, start: at, end: at + text.length });
    at += text.length;
    if (result.length > 160)
      throw new RangeError('Слишком много элементов формулы.');
  }
  return result;
}
function column(text: string) {
  return Array.from(text.toUpperCase()).reduce(
    (value, char) => value * 26 + char.charCodeAt(0) - 64,
    0,
  );
}
function columnName(value: number) {
  let result = '';
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
function address(text: string) {
  const match = /^(\$?)([A-Za-z]{1,2})(\$?)([1-9]\d{0,3})$/u.exec(text);
  if (!match) throw new RangeError('Адрес вида A1 или $A$1.');
  return {
    col: column(match[2] ?? ''),
    row: Number(match[4]),
    colFixed: match[1] === '$',
    rowFixed: match[3] === '$',
  };
}
export function copyFormula(raw: string, columns: number, rows: number) {
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    Math.abs(columns) > 100 ||
    Math.abs(rows) > 100
  )
    throw new RangeError('Сдвиг — целые числа в пределах 100.');
  let result = '',
    at = 0;
  for (const token of tokens(raw)) {
    result += raw.slice(at, token.start);
    if (token.kind === 'ref') {
      const a = address(token.text),
        col = a.col + (a.colFixed ? 0 : columns),
        row = a.row + (a.rowFixed ? 0 : rows);
      if (col < 1 || col > 702 || row < 1 || row > 9999)
        throw new RangeError(
          'Копирование вывело адрес за границы лаборатории A–ZZ, 1–9999.',
        );
      result +=
        (a.colFixed ? '$' : '') +
        columnName(col) +
        (a.rowFixed ? '$' : '') +
        String(row);
    } else result += token.text;
    at = token.end;
  }
  return result + raw.slice(at);
}
export const functionNames: Readonly<Record<string, string>> = {
  СУММ: 'SUM',
  ОКРУГЛ: 'ROUND',
  СРЗНАЧ: 'AVERAGE',
  СЧЁТ: 'COUNT',
  СЧЕТ: 'COUNT',
  МИН: 'MIN',
  МАКС: 'MAX',
  СЧЁТЕСЛИ: 'COUNTIF',
  СЧЕТЕСЛИ: 'COUNTIF',
  СЧЁТЕСЛИМН: 'COUNTIFS',
  СЧЕТЕСЛИМН: 'COUNTIFS',
  СУММЕСЛИ: 'SUMIF',
  СРЗНАЧЕСЛИ: 'AVERAGEIF',
};
type Value = SheetCell | SheetCell[];
export function evaluateFormula(
  raw: string,
  data: readonly (readonly SheetCell[])[] = labRows,
): number {
  const list = tokens(raw);
  let at = 0,
    depth = 0;
  const peek = () => list[at]?.text;
  const take = (symbol: string) => {
    if (peek() !== symbol) throw new RangeError(`Ожидается ${symbol}.`);
    at++;
  };
  function numeric(value: Value): number {
    if (typeof value !== 'number')
      throw new RangeError(
        'Для арифметики нужны числа, не текст или диапазон.',
      );
    return value;
  }
  function cells(first: string, last: string): SheetCell[] {
    const a = address(first),
      b = address(last),
      result: SheetCell[] = [];
    if (
      a.col > b.col ||
      a.row > b.row ||
      (b.row - a.row + 1) * (b.col - a.col + 1) > 200
    )
      throw new RangeError('Нужен прямой диапазон до 200 ячеек.');
    for (let row = a.row; row <= b.row; row++)
      for (let col = a.col; col <= b.col; col++) {
        const value = data[row - 1]?.[col - 1];
        if (value === undefined)
          throw new RangeError('Адрес вне учебных данных A1:D13.');
        result.push(value);
      }
    return result;
  }
  function criterion(value: SheetCell, rule: Value): boolean {
    if (Array.isArray(rule))
      throw new RangeError('Критерий должен быть числом или строкой.');
    const match = /^(<=|>=|<>|=|>|<)?(.*)$/u.exec(String(rule));
    const operator = match?.[1] ?? '=',
      text = match?.[2] ?? '',
      number = Number(text.replace(',', '.'));
    if (/[?*]/u.test(text))
      throw new RangeError(
        'Подстановки в критериях этой лаборатории не поддерживаются.',
      );
    const numericRule = text.trim() !== '' && Number.isFinite(number);
    if (numericRule && typeof value !== 'number') return false;
    const left =
        typeof value === 'number' ? value : value.toLocaleLowerCase('ru'),
      right = numericRule ? number : text.toLocaleLowerCase('ru');
    if (operator === '=') return left === right;
    if (operator === '<>') return left !== right;
    if (typeof left !== 'number' || typeof right !== 'number')
      throw new RangeError('Неравенства здесь применяются к числам.');
    return operator === '>'
      ? left > right
      : operator === '<'
        ? left < right
        : operator === '>='
          ? left >= right
          : left <= right;
  }
  function call(name: string, args: Value[]): number {
    name = functionNames[name] ?? name;
    const values = args
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((v): v is number => typeof v === 'number');
    if (name === 'ROUND') {
      const [number, digits] = args;
      if (
        args.length !== 2 ||
        typeof number !== 'number' ||
        typeof digits !== 'number' ||
        !Number.isInteger(digits) ||
        Math.abs(digits) > 6
      )
        throw new RangeError(
          'ROUND: число и целое количество разрядов от -6 до 6.',
        );
      const [coefficient = '0', exponent = '0'] = Math.abs(number)
        .toString()
        .split('e');
      const shifted = Number(
        coefficient + 'e' + String(Number(exponent) + digits),
      );
      const [rounded = '0', outExponent = '0'] = Math.round(shifted)
        .toString()
        .split('e');
      return (
        Math.sign(number) *
        Number(rounded + 'e' + String(Number(outExponent) - digits))
      );
    }
    if (['SUM', 'COUNT', 'AVERAGE', 'MIN', 'MAX'].includes(name)) {
      if (!args.length) throw new RangeError('Укажи аргументы функции.');
      if (name === 'COUNT') return values.length;
      if (name === 'SUM') return values.reduce((a, b) => a + b, 0);
      if (!values.length)
        throw new RangeError(
          'Нет числовых данных для среднего или экстремума.',
        );
      return name === 'AVERAGE'
        ? values.reduce((a, b) => a + b, 0) / values.length
        : name === 'MIN'
          ? Math.min(...values)
          : Math.max(...values);
    }
    if (name === 'COUNTIF' || name === 'COUNTIFS') {
      if (
        args.length < 2 ||
        args.length % 2 !== 0 ||
        (name === 'COUNTIF' && args.length !== 2)
      )
        throw new RangeError('Нужны пары диапазон; критерий.');
      const first = args[0];
      if (!Array.isArray(first)) throw new RangeError('Укажи диапазон.');
      return first.filter((_, i) => {
        for (let p = 0; p < args.length; p += 2) {
          const range = args[p],
            rule = args[p + 1];
          if (
            !Array.isArray(range) ||
            range.length !== first.length ||
            rule === undefined
          )
            throw new RangeError('Диапазоны должны быть одинаковой длины.');
          if (!criterion(range[i] ?? '', rule)) return false;
        }
        return true;
      }).length;
    }
    if (name === 'SUMIF' || name === 'AVERAGEIF') {
      const [range, rule, amount = range] = args;
      if (
        args.length < 2 ||
        args.length > 3 ||
        !Array.isArray(range) ||
        !Array.isArray(amount) ||
        rule === undefined ||
        range.length !== amount.length
      )
        throw new RangeError(
          'Нужны диапазон; критерий; числовой диапазон одинаковой длины.',
        );
      const selected = amount.filter(
        (value, i) =>
          typeof value === 'number' && criterion(range[i] ?? '', rule),
      ) as number[];
      if (name === 'AVERAGEIF' && !selected.length)
        throw new RangeError('Нет числовых данных для среднего.');
      return (
        selected.reduce((sum, value) => sum + value, 0) /
        (name === 'AVERAGEIF' ? selected.length : 1)
      );
    }
    throw new RangeError(
      'Поддерживаются SUM, COUNT, AVERAGE, MIN, MAX, ROUND, COUNTIF(S), SUMIF, AVERAGEIF и русские имена этих функций.',
    );
  }
  function primary(): Value {
    if (++depth > 24) throw new RangeError('Слишком глубокая вложенность.');
    try {
      const token = list[at++];
      if (!token) throw new RangeError('Формула не закончена.');
      if (token.text === '+' || token.text === '-')
        return (token.text === '-' ? -1 : 1) * numeric(primary());
      if (token.text === '(') {
        const value = expression();
        take(')');
        return value;
      }
      if (token.kind === 'number') return Number(token.text.replace(',', '.'));
      if (token.kind === 'string')
        return token.text.slice(1, -1).replaceAll('""', '"');
      if (token.kind === 'ref') {
        if (peek() === ':') {
          at++;
          const last = list[at++];
          if (last?.kind !== 'ref')
            throw new RangeError('После : нужен адрес.');
          return cells(token.text, last.text);
        }
        return cells(token.text, token.text)[0] ?? '';
      }
      if (token.kind === 'name') {
        take('(');
        const args: Value[] = [];
        if (peek() !== ')') {
          args.push(expression());
          while (peek() === ';') {
            at++;
            args.push(expression());
          }
        }
        take(')');
        return call(token.text.toUpperCase(), args);
      }
      throw new RangeError('Ожидается число, адрес или функция.');
    } finally {
      depth--;
    }
  }
  function product(): Value {
    let value = primary();
    while (peek() === '*' || peek() === '/') {
      const op = peek();
      at++;
      const right = numeric(primary());
      if (op === '/' && right === 0) throw new RangeError('Деление на ноль.');
      value = op === '*' ? numeric(value) * right : numeric(value) / right;
    }
    return value;
  }
  function expression(): Value {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const op = peek();
      at++;
      const right = numeric(product());
      value = op === '+' ? numeric(value) + right : numeric(value) - right;
    }
    return value;
  }
  const value = numeric(expression());
  if (at !== list.length || !Number.isFinite(value) || Math.abs(value) > 1e12)
    throw new RangeError('Проверь окончание формулы и диапазон результата.');
  return value;
}
export function selectedRows(school: number, grade: number, threshold: number) {
  return labRows
    .slice(1)
    .filter(
      (row) =>
        (school === 0 || row[1] === school) &&
        (grade === 0 || row[2] === grade) &&
        Number(row[3]) > threshold,
    );
}
export function chartCounts(rows: readonly (readonly SheetCell[])[]) {
  return [7, 8, 9].map(
    (grade) => rows.filter((row) => row[2] === grade).length,
  );
}
