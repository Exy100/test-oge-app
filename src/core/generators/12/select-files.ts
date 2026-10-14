import { Rng } from '../../rng.ts';
import type { Generator, TaskInstance } from '../../types.ts';
import { bytes as byteCount, quantity, taskFrom } from '../task.ts';

export type SelectionKind =
  | 'file-extension-count'
  | 'file-mask-count'
  | 'file-size-count'
  | 'file-total-volume';
export const selectionKinds: readonly SelectionKind[] = [
  'file-extension-count',
  'file-mask-count',
  'file-size-count',
  'file-total-volume',
];
export type TextFormat = 'txt' | 'csv' | 'json' | 'py' | 'kum';
export const textFormats: readonly TextFormat[] = [
  'txt',
  'csv',
  'json',
  'py',
  'kum',
];
export type Condition =
  | { kind: 'file-extension-count'; catalog: string; extension: TextFormat }
  | { kind: 'file-mask-count'; catalog: string; mask: string; near: string }
  | {
      kind: 'file-size-count';
      catalog: string;
      extension: TextFormat;
      kib: number;
    }
  | { kind: 'file-total-volume'; catalog: string; extension: TextFormat };
/** catalog: the asked directory with all nested levels; direct: its own files; prefix: name-prefix confusion. */
export type Scope = 'catalog' | 'direct' | 'prefix';
export interface SelectionOptions {
  scope?: Scope;
  mask?: string;
  ignoreSize?: boolean;
}

const titles: Record<SelectionKind, string> = {
  'file-extension-count': 'Количество файлов с заданным расширением',
  'file-mask-count': 'Количество файлов по маске имени',
  'file-size-count': 'Количество файлов больше заданного размера',
  'file-total-volume': 'Суммарный объём отобранных файлов',
};
const catalogs = ['Проекты', 'Материалы', 'Кружок', 'Практикум', 'Олимпиада'];
const subfolders = [
  'Данные',
  'Отчёты',
  'Программы',
  'Тексты',
  'Задачи',
  'Таблицы',
];
const deepFolders = ['2024', '2025', 'Старое', 'Итоги', 'Копии'];
const outsideFolder = 'Загрузки';
const stems: Record<TextFormat, readonly string[]> = {
  txt: ['заметки', 'план', 'описание', 'итоги', 'список', 'идеи', 'вопросы'],
  csv: ['оценки', 'замеры', 'расписание', 'погода', 'участники', 'расходы'],
  json: ['настройки', 'маршрут', 'карта', 'словарь', 'уровни'],
  py: ['подсчёт', 'сортировка', 'поиск', 'проверка', 'деление'],
  kum: ['робот', 'лабиринт', 'коридор', 'стена', 'клетки'],
};
const sentences = [
  'Участники кружка проверили записи и сверили результаты.',
  'Каждая строка этого файла — учебный пример.',
  'Данные собраны во время практической работы.',
  'В конце недели группа обсудила итоги и наметила план.',
  'Таблица результатов хранится в соседнем каталоге.',
  'Все значения вымышлены и подходят для тренировки.',
];
const moves = ['вправо', 'влево', 'вверх', 'вниз', 'закрасить'];

interface MaskSpec {
  mask: string;
  near: string;
  nearRule: string;
  match(rng: Rng): string;
  nearMiss(rng: Rng): string;
  other(rng: Rng): string;
}
const two = (rng: Rng) => String(rng.int(1, 40)).padStart(2, '0');
const maskSpecs: readonly MaskSpec[] = [
  {
    mask: 'отчёт-??.txt',
    near: 'отчёт-*.txt',
    nearRule:
      'Каждый знак `?` заменяет ровно один символ: после дефиса нужны ровно два символа.',
    match: (rng) => `отчёт-${two(rng)}.txt`,
    nearMiss: (rng) =>
      rng.pick([
        `отчёт-${String(rng.int(1, 9))}.txt`,
        `отчёт-${String(rng.int(100, 140))}.txt`,
        `отчёт-${two(rng)}-копия.txt`,
      ]),
    other: (rng) =>
      rng.pick([
        `отчёт-${two(rng)}.csv`,
        `итог-${two(rng)}.txt`,
        `отчёт${two(rng)}.txt`,
      ]),
  },
  {
    mask: '*-2025.csv',
    near: '*2025*.csv',
    nearRule:
      'Имя должно заканчиваться на «-2025» прямо перед расширением .csv; дефис обязателен.',
    match: (rng) =>
      rng.chance(0.5)
        ? `${rng.pick(stems.csv)}-2025.csv`
        : `${rng.pick(stems.csv)}-${String(rng.int(2, 9))}-2025.csv`,
    nearMiss: (rng) =>
      rng.pick([
        `${rng.pick(stems.csv)}2025.csv`,
        `${rng.pick(stems.csv)}-2025-копия.csv`,
        `${rng.pick(stems.csv)}-20251.csv`,
      ]),
    other: (rng) =>
      rng.pick([
        `${rng.pick(stems.csv)}-2024.csv`,
        `${rng.pick(stems.csv)}-2025.txt`,
        `${rng.pick(stems.csv)}-2025.json`,
      ]),
  },
  {
    mask: '?а*.py',
    near: '*а*.py',
    nearRule:
      'Буква «а» должна стоять второй: перед ней ровно один символ, а не любое количество.',
    match: (rng) =>
      `${rng.pick(['карта', 'задача', 'таблица', 'массив', 'шаги', 'рамка', 'пары', 'ладья'])}${rng.chance(0.5) ? `-${String(rng.int(2, 9))}` : ''}.py`,
    nearMiss: (rng) =>
      `${rng.pick(['сумма', 'строка', 'сортировка', 'проверка', 'граф', 'отладка'])}${rng.chance(0.5) ? `-${String(rng.int(2, 9))}` : ''}.py`,
    other: (rng) =>
      rng.pick([
        `${rng.pick(['поиск', 'цикл', 'деление', 'вывод', 'список'])}.py`,
        `${rng.pick(['карта', 'задача', 'таблица'])}.txt`,
      ]),
  },
  {
    mask: 'урок?.*',
    near: 'урок*.*',
    nearRule:
      'После слова «урок» должен стоять ровно один символ, а затем точка.',
    match: (rng) => `урок${String(rng.int(1, 9))}.${rng.pick(textFormats)}`,
    nearMiss: (rng) =>
      rng.chance(0.7)
        ? `урок${String(rng.int(10, 19))}.${rng.pick(textFormats)}`
        : `урок.${rng.pick(textFormats)}`,
    other: (rng) =>
      rng.pick([
        `тема${String(rng.int(1, 9))}.${rng.pick(textFormats)}`,
        `план-урок${String(rng.int(1, 9))}.${rng.pick(textFormats)}`,
      ]),
  },
];
export const selectionMasks = maskSpecs.map(({ mask, near }) => ({
  mask,
  near,
}));
const encoder = new TextEncoder();
/** UTF-8 length without allocating; a surrogate pair is one 4-byte code point. */
function byteLength(text: string): number {
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      length += 4;
      i++;
    } else length += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return length;
}

export function isSelectionKind(value: string): value is SelectionKind {
  return selectionKinds.some((kind) => kind === value);
}
export function selectionDatasetId(kind: SelectionKind, seed: string): string {
  return `${kind}-v1:files:${seed}`;
}
export function formatOf(path: string): TextFormat {
  const extension = path.slice(path.lastIndexOf('.') + 1);
  const format = textFormats.find((item) => item === extension);
  if (!format) throw new Error(`Неизвестный формат файла: ${path}.`);
  return format;
}

/** A file of exactly `size` UTF-8 bytes; padding is ASCII so the size is exact. */
function renderFile(
  format: TextFormat,
  name: string,
  size: number,
  rng: Rng,
): Uint8Array {
  if (format === 'json') {
    const head = `{\n  "файл": ${JSON.stringify(name)},\n  "описание": "Учебные данные. Значения вымышлены.",\n  "записи": [\n`;
    const tail = '\n  ],\n  "заполнитель": "';
    const end = '"\n}\n';
    const records: string[] = [];
    let total = byteLength(head) + byteLength(tail) + byteLength(end);
    for (;;) {
      const record = `    {"номер": ${String(records.length + 1)}, "значение": ${String(rng.int(1, 999))}}`;
      const extra = byteLength(record) + (records.length ? 2 : 0);
      if (total + extra > size) break;
      records.push(record);
      total += extra;
    }
    if (!records.length) throw new Error('Размер файла слишком мал.');
    return encoder.encode(
      `${head}${records.join(',\n')}${tail}${'-'.repeat(size - total)}${end}`,
    );
  }
  const layout: Record<
    Exclude<TextFormat, 'json'>,
    {
      head: string[];
      line: (index: number) => string;
      tail: string[];
      pad: string;
    }
  > = {
    txt: {
      head: [`Файл: ${name}`, 'Учебный текст. Все сведения вымышлены.'],
      line: () => rng.pick(sentences),
      tail: [],
      pad: '',
    },
    csv: {
      head: ['номер;название;значение'],
      line: (index) =>
        `${String(index)};запись ${String(index)};${String(rng.int(1, 999))}`,
      tail: [],
      pad: 'итог;заполнитель;',
    },
    py: {
      head: [`# Учебная программа ${name}`, 'total = 0'],
      line: () => `total = total + ${String(rng.int(1, 99))}`,
      tail: ['print(total)'],
      pad: '# ',
    },
    kum: {
      head: [`| Учебный алгоритм ${name}`, 'использовать Робот', 'алг', 'нач'],
      line: () => `  ${rng.pick(moves)}`,
      tail: ['кон'],
      pad: '| ',
    },
  };
  const { head, line, tail, pad } = layout[format];
  const lines = [...head];
  const reserved =
    tail.reduce((sum, item) => sum + byteLength(item) + 1, 0) +
    byteLength(pad) +
    1;
  let total = lines.reduce((sum, item) => sum + byteLength(item) + 1, 0);
  if (total + reserved > size) throw new Error('Размер файла слишком мал.');
  for (let index = 1; ; index++) {
    const next = line(index);
    if (total + byteLength(next) + 1 + reserved > size) break;
    lines.push(next);
    total += byteLength(next) + 1;
  }
  lines.push(...tail);
  total += reserved - byteLength(pad) - 1;
  lines.push(pad + '-'.repeat(size - total - byteLength(pad) - 1));
  return encoder.encode(lines.join('\n') + '\n');
}

const thresholds = (kib: number) => ({
  big: Math.ceil((kib * 1024 * 11) / 10),
  small: Math.floor(kib * 900),
});

/** Single source for the virtual directory, archive and answer computation. */
export function selectionSources(
  kind: SelectionKind,
  seed: string,
): { files: Map<string, Uint8Array>; condition: Condition } {
  const rng = new Rng(`${kind}:${seed}`);
  const catalog = rng.pick(catalogs);
  const [first = '', second = '', third = ''] = rng.shuffle(subfolders);
  const deep = `${catalog}/${first}/${rng.pick(deepFolders)}`;
  const inside = [
    catalog,
    `${catalog}/${first}`,
    `${catalog}/${second}`,
    `${catalog}/${third}`,
    deep,
  ];
  const archive = `${catalog}-архив`;
  const planned: { path: string; size: number }[] = [];
  const used = new Set<string>();
  const place = (dir: string, name: () => string, size: number) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const path = `${dir}/${name()}`;
      if (used.has(path.toLowerCase())) continue;
      used.add(path.toLowerCase());
      planned.push({ path, size });
      return;
    }
    throw new Error('Не удалось подобрать уникальное имя файла.');
  };
  const plain = (format: TextFormat) => () =>
    `${rng.pick(stems[format])}${rng.chance(0.5) ? `-${String(rng.int(2, 9))}` : ''}.${format}`;
  const anyPlain = (formats: readonly TextFormat[]) => () =>
    plain(rng.pick(formats))();
  const targetDir = (index: number) =>
    index === 0 ? catalog : index === 1 ? deep : rng.pick(inside);
  const smallSize = () => rng.int(260, 1600);
  let condition: Condition;
  if (kind === 'file-extension-count') {
    const extension = rng.pick(textFormats);
    const others = textFormats.filter((format) => format !== extension);
    const count = rng.int(3, 8);
    for (let i = 0; i < count; i++)
      place(targetDir(i), plain(extension), smallSize());
    place(
      rng.pick(inside),
      () => `${rng.pick(stems[extension])}.${extension}.${rng.pick(others)}`,
      smallSize(),
    );
    for (let i = rng.int(4, 7); i > 0; i--)
      place(rng.pick(inside), anyPlain(others), smallSize());
    for (let i = rng.int(1, 3); i > 0; i--)
      place(archive, plain(extension), smallSize());
    place(archive, anyPlain(others), smallSize());
    for (let i = rng.int(2, 3); i > 0; i--)
      place(outsideFolder, anyPlain(textFormats), smallSize());
    condition = { kind, catalog, extension };
  } else if (kind === 'file-mask-count') {
    const spec = rng.pick(maskSpecs);
    const nearPattern = maskPattern(spec.near);
    const filler = () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const name = anyPlain(textFormats)();
        if (!nearPattern.test(name)) return name;
      }
      throw new Error('Не удалось подобрать имя вне маски.');
    };
    const count = rng.int(2, 6);
    const misses = rng.int(1, 2);
    const copies = misses === 1 ? rng.int(2, 3) : 1;
    for (let i = 0; i < count; i++)
      place(targetDir(i), () => spec.match(rng), smallSize());
    for (let i = 0; i < misses; i++)
      place(rng.pick(inside), () => spec.nearMiss(rng), smallSize());
    for (let i = rng.int(1, 2); i > 0; i--)
      place(rng.pick(inside), () => spec.other(rng), smallSize());
    for (let i = rng.int(3, 6); i > 0; i--)
      place(rng.pick(inside), filler, smallSize());
    for (let i = 0; i < copies; i++)
      place(archive, () => spec.match(rng), smallSize());
    place(archive, filler, smallSize());
    for (let i = rng.int(2, 3); i > 0; i--)
      place(outsideFolder, filler, smallSize());
    condition = { kind, catalog, mask: spec.mask, near: spec.near };
  } else if (kind === 'file-size-count') {
    const extension = rng.pick(textFormats);
    const others = textFormats.filter((format) => format !== extension);
    const kib = rng.int(2, 6);
    const limit = thresholds(kib);
    const big = () => rng.int(limit.big, kib * 2048);
    const small = () => rng.int(Math.max(260, kib * 300), limit.small);
    const count = rng.int(2, 6);
    const below = rng.int(1, 3);
    const copies = below === 1 ? rng.int(2, 3) : 1;
    for (let i = 0; i < count; i++)
      place(targetDir(i + 1), plain(extension), big());
    for (let i = 0; i < below; i++)
      place(targetDir(i), plain(extension), small());
    for (let i = rng.int(3, 5); i > 0; i--)
      place(
        rng.pick(inside),
        anyPlain(others),
        rng.chance(0.5) ? big() : small(),
      );
    for (let i = 0; i < copies; i++) place(archive, plain(extension), big());
    place(archive, anyPlain(others), small());
    for (let i = rng.int(2, 3); i > 0; i--)
      place(outsideFolder, anyPlain(textFormats), small());
    condition = { kind, catalog, extension, kib };
  } else {
    const extension = rng.pick(textFormats);
    const others = textFormats.filter((format) => format !== extension);
    const count = rng.int(3, 6);
    for (let i = 0; i < count; i++)
      place(targetDir(i), plain(extension), rng.int(1, 6) * 1024);
    for (let i = rng.int(3, 5); i > 0; i--)
      place(rng.pick(inside), anyPlain(others), rng.int(300, 5000));
    for (let i = rng.int(1, 2); i > 0; i--)
      place(archive, plain(extension), rng.int(1, 4) * 1024);
    place(archive, anyPlain(others), rng.int(300, 5000));
    for (let i = rng.int(2, 3); i > 0; i--)
      place(outsideFolder, anyPlain(textFormats), rng.int(300, 5000));
    condition = { kind, catalog, extension };
  }
  const files = new Map<string, Uint8Array>();
  files.set(
    'README.txt',
    encoder.encode(
      [
        'Авторский учебный набор для задания №12.',
        'Все каталоги, имена файлов и данные вымышлены. Лицензия: CC0-1.0.',
        'Текстовые файлы имеют кодировку UTF-8. Распакуй архив и открой папку в файловом менеджере.',
        'Размер смотри в свойствах файла в байтах: 1 Кбайт = 1024 байта.',
        'Условие отбора указано в задании. Ответов в этом файле нет.',
      ].join('\n') + '\n',
    ),
  );
  for (const { path, size } of planned) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    files.set(path, renderFile(formatOf(path), name, size, rng));
  }
  return { files, condition };
}

function maskPattern(mask: string): RegExp {
  let source = '';
  for (const char of mask)
    source +=
      char === '*'
        ? '.*'
        : char === '?'
          ? '.'
          : char.replace(/[.+^${}()|[\]\\]/u, '\\$&');
  return new RegExp(`^${source}$`, 'u');
}
function inScope(path: string, catalog: string, scope: Scope): boolean {
  if (scope === 'prefix') return path.startsWith(catalog);
  if (!path.startsWith(`${catalog}/`)) return false;
  return scope === 'catalog' || !path.slice(catalog.length + 1).includes('/');
}
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const extensionOf = (name: string) =>
  name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';

/** Answer (or a typical-mistake value) computed from real file bytes; null if the condition is ambiguous. */
export function selectionValue(
  condition: Condition,
  files: ReadonlyMap<string, Uint8Array>,
  options: SelectionOptions = {},
): string | null {
  const scope = options.scope ?? 'catalog';
  const selected = [...files].filter(([path]) =>
    inScope(path, condition.catalog, scope),
  );
  if (condition.kind === 'file-mask-count') {
    const pattern = maskPattern(options.mask ?? condition.mask);
    const count = selected.filter(([path]) =>
      pattern.test(nameOf(path)),
    ).length;
    return count ? String(count) : null;
  }
  const typed = selected.filter(
    ([path]) => extensionOf(nameOf(path)) === condition.extension,
  );
  if (condition.kind === 'file-extension-count')
    return typed.length ? String(typed.length) : null;
  if (condition.kind === 'file-size-count') {
    const limit = thresholds(condition.kib);
    if (
      typed.some(
        ([, bytes]) => bytes.length > limit.small && bytes.length < limit.big,
      )
    )
      return null;
    const count = options.ignoreSize
      ? typed.length
      : typed.filter(([, bytes]) => bytes.length >= limit.big).length;
    return count ? String(count) : null;
  }
  if (!typed.length || typed.some(([, bytes]) => bytes.length % 1024 !== 0))
    return null;
  return String(typed.reduce((sum, [, bytes]) => sum + bytes.length, 0) / 1024);
}

interface DirectoryNode {
  files: Map<string, number>;
  dirs: Map<string, DirectoryNode>;
}
function directoryTree(files: ReadonlyMap<string, Uint8Array>): DirectoryNode {
  const root: DirectoryNode = { files: new Map(), dirs: new Map() };
  for (const [path, bytes] of files) {
    const parts = path.split('/');
    const name = parts.pop() ?? '';
    let node = root;
    for (const part of parts) {
      let child = node.dirs.get(part);
      if (!child) {
        child = { files: new Map(), dirs: new Map() };
        node.dirs.set(part, child);
      }
      node = child;
    }
    node.files.set(name, bytes.length);
  }
  return root;
}
function walk(node: DirectoryNode): [string, number][] {
  return [
    ...node.files,
    ...[...node.dirs.values()].flatMap((child) => walk(child)),
  ];
}
/** Classic wildcard dynamic programming over code points, independent of RegExp. */
export function wildcardMatch(mask: string, name: string): boolean {
  const pattern = Array.from(mask);
  const text = Array.from(name);
  let row = [true, ...text.map(() => false)];
  for (const symbol of pattern) {
    const next = [symbol === '*' && (row[0] ?? false)];
    for (let i = 1; i <= text.length; i++)
      next.push(
        symbol === '*'
          ? (row[i] ?? false) || (next[i - 1] ?? false)
          : (row[i - 1] ?? false) && (symbol === '?' || symbol === text[i - 1]),
      );
    row = next;
  }
  return row[text.length] ?? false;
}
function independentValue(
  condition: Condition,
  files: ReadonlyMap<string, Uint8Array>,
): string | null {
  const node = directoryTree(files).dirs.get(condition.catalog);
  if (!node) return null;
  const entries = walk(node);
  if (condition.kind === 'file-mask-count') {
    const count = entries.filter(([name]) =>
      wildcardMatch(condition.mask, name),
    ).length;
    return count > 0 ? String(count) : null;
  }
  const typed = entries.filter(([name]) => {
    const parts = name.split('.');
    return parts.length > 1 && parts[parts.length - 1] === condition.extension;
  });
  if (condition.kind === 'file-extension-count')
    return typed.length > 0 ? String(typed.length) : null;
  if (condition.kind === 'file-size-count') {
    const bytes = condition.kib * 1024;
    let count = 0;
    for (const [, size] of typed) {
      if (size * 10 >= bytes * 11) count++;
      else if (size > condition.kib * 900) return null;
    }
    return count > 0 ? String(count) : null;
  }
  let kib = 0;
  for (const [, size] of typed) {
    if (size % 1024 !== 0) return null;
    kib += size / 1024;
  }
  return kib > 0 ? String(kib) : null;
}

const fileCount = (value: number) =>
  quantity(value, ['файл', 'файла', 'файлов']);
function selectFiles(kind: SelectionKind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 12,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const { files: sources, condition } = selectionSources(kind, seed);
      const result = selectionValue(condition, sources);
      const prefix = selectionValue(condition, sources, { scope: 'prefix' });
      const second =
        condition.kind === 'file-mask-count'
          ? selectionValue(condition, sources, { mask: condition.near })
          : condition.kind === 'file-size-count'
            ? selectionValue(condition, sources, { ignoreSize: true })
            : selectionValue(condition, sources, { scope: 'direct' });
      if (
        result === null ||
        prefix === null ||
        second === null ||
        new Set([result, prefix, second]).size !== 3
      )
        throw new Error('Неоднозначный или неполный набор файлов.');
      const { catalog } = condition;
      const archive = `${catalog}-архив`;
      const scopeRule = `Учитывай файлы во всех подкаталогах каталога ${catalog} на любой глубине. Файлы вне каталога ${catalog} не учитывай.`;
      const selected = [...sources].filter(
        ([path]) =>
          inScope(path, catalog, 'catalog') &&
          (condition.kind === 'file-mask-count'
            ? maskPattern(condition.mask).test(nameOf(path))
            : extensionOf(nameOf(path)) === condition.extension),
      );
      const listed = (entries: [string, Uint8Array][], sizes = false) =>
        entries
          .map(
            ([path, bytes]) =>
              `${path}${sizes ? ` (${byteCount(bytes.length)})` : ''}`,
          )
          .join(', ');
      let question: string;
      let solution: string[];
      let hints: [string, string, string];
      let mistake: string;
      if (condition.kind === 'file-extension-count') {
        const doubled = [...sources]
          .map(([path]) => path)
          .find(
            (path) =>
              inScope(path, catalog, 'catalog') &&
              nameOf(path).includes(`.${condition.extension}.`),
          );
        question = `Сколько файлов с расширением .${condition.extension} находится в каталоге ${catalog}? ${scopeRule} Расширение — часть имени после последней точки. Ответ запиши целым числом.`;
        solution = [
          `Открой каталог ${catalog} и просмотри все вложенные каталоги. Расширение определяй по части имени после последней точки.`,
          `Подходящие файлы: ${listed(selected)}.`,
          `Всего ${fileCount(Number(result))}.${doubled ? ` Файл ${doubled} имеет другое расширение и не подходит.` : ''} Каталог ${archive} не входит в каталог ${catalog}. Ответ: ${result}.`,
        ];
        hints = [
          `Проверь все уровни вложенности каталога ${catalog}.`,
          'В имени может быть несколько точек: расширение — только часть после последней.',
          'Каталог с похожим названием — это другой каталог.',
        ];
        mistake = `Посчитаны только файлы, лежащие прямо в каталоге ${catalog}. Нужны и все его подкаталоги.`;
      } else if (condition.kind === 'file-mask-count') {
        const rule =
          maskSpecs.find((spec) => spec.mask === condition.mask)?.nearRule ??
          '';
        question = `Сколько файлов в каталоге ${catalog} соответствует маске \`${condition.mask}\`? Знак \`?\` означает ровно один любой символ, знак \`*\` — любую последовательность символов, в том числе пустую. Маска применяется к полному имени файла вместе с расширением; все имена записаны строчными буквами. ${scopeRule} Ответ запиши целым числом.`;
        solution = [
          `Разбери маску \`${condition.mask}\`. ${rule}`,
          `Подходящие файлы: ${listed(selected)}.`,
          `Всего ${fileCount(Number(result))}. Имена, которые подходят только под более широкую маску \`${condition.near}\`, не учитываются. Ответ: ${result}.`,
        ];
        hints = [
          'Знак `?` заменяет ровно один символ, знак `*` — любое количество символов.',
          'Маска должна совпасть с именем целиком, включая расширение.',
          `Проверь все подкаталоги каталога ${catalog} и не заходи в другие каталоги.`,
        ];
        mistake = `Маска применена неточно. ${rule}`;
      } else if (condition.kind === 'file-size-count') {
        const limit = condition.kib * 1024;
        const big = selected.filter(([, bytes]) => bytes.length > limit);
        question = `Сколько файлов с расширением .${condition.extension} в каталоге ${catalog} имеет размер больше ${String(condition.kib)} Кбайт? 1 Кбайт = 1024 байта; сравнивай точный размер файла в байтах. ${scopeRule} Ответ запиши целым числом.`;
        solution = [
          `Переведи порог в байты: ${String(condition.kib)} · 1024 = ${byteCount(limit)}.`,
          `Файлы .${condition.extension} в каталоге ${catalog}: ${listed(selected, true)}.`,
          `Больше ${String(limit)} байт: ${listed(big)}. Это ${fileCount(big.length)}. Ответ: ${result}.`,
        ];
        hints = [
          'Переведи порог в байты: умножь число Кбайт на 1024.',
          'Нужны только файлы с указанным расширением.',
          'Сравнивай размер в байтах, а не округлённое значение в Кбайтах.',
        ];
        mistake = `Посчитаны все файлы .${condition.extension} без проверки размера.`;
      } else {
        const total = selected.reduce((sum, [, data]) => sum + data.length, 0);
        question = `Определи суммарный объём всех файлов с расширением .${condition.extension} в каталоге ${catalog}. ${scopeRule} Ответ запиши в Кбайтах целым числом; 1 Кбайт = 1024 байта.`;
        solution = [
          `Найди все файлы .${condition.extension} в каталоге ${catalog}, включая подкаталоги.`,
          `Размеры: ${listed(selected, true)}.`,
          `Сумма: ${byteCount(total)}; ${String(total)} : 1024 = ${result} Кбайт. Ответ: ${result}.`,
        ];
        hints = [
          'Сложи размеры в байтах и раздели сумму на 1024.',
          `Учитывай файлы во всех подкаталогах каталога ${catalog}.`,
          'Файлы других расширений и других каталогов в сумму не входят.',
        ];
        mistake = `Сложены только файлы, лежащие прямо в каталоге ${catalog}; подкаталоги пропущены.`;
      }
      return {
        ...taskFrom(kind, 12, seed, {
          statement: `Скачай и распакуй файловый набор этого задания. Каталоги, имена и содержимое файлов — авторские, данные вымышлены.\n\n${question}`,
          answer: { type: 'integer', value: result },
          solution: solution.map((text) => ({ text })),
          hints,
          commonMistakes: [
            {
              answer: prefix,
              explanation: `Учтены файлы из каталога ${archive}. Это отдельный каталог, а не подкаталог ${catalog}.`,
            },
            { answer: second, explanation: mistake },
          ],
        }),
        datasetId: selectionDatasetId(kind, seed),
      };
    },
    verify(task: TaskInstance) {
      if (
        task.datasetId !== selectionDatasetId(kind, task.seed) ||
        task.generatorId !== `${kind}-v1` ||
        task.answer.type !== 'integer'
      )
        return false;
      const { files: sources, condition } = selectionSources(kind, task.seed);
      const required = [
        `в каталоге ${condition.catalog}`,
        condition.kind === 'file-mask-count'
          ? `маске \`${condition.mask}\``
          : `расширением .${condition.extension}`,
        ...(condition.kind === 'file-size-count'
          ? [`больше ${String(condition.kib)} Кбайт`]
          : []),
      ];
      if (required.some((part) => !task.statement.includes(part))) return false;
      return independentValue(condition, sources) === task.answer.value;
    },
  };
}
export const fileExtensionCount = selectFiles('file-extension-count');
export const fileMaskCount = selectFiles('file-mask-count');
export const fileSizeCount = selectFiles('file-size-count');
export const fileTotalVolume = selectFiles('file-total-volume');
