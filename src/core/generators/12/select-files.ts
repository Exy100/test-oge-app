import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';

export type SelectionKind =
  'file-mask-count' | 'file-size-total' | 'file-largest';
export const selectionKinds: readonly SelectionKind[] = [
  'file-mask-count',
  'file-size-total',
  'file-largest',
];
export function isSelectionKind(value: string): value is SelectionKind {
  return selectionKinds.some((kind) => kind === value);
}
export const selectionDatasetId = (kind: SelectionKind, seed: string): string =>
  `${kind}-v1:files:${seed}`;
export interface SelectionRule {
  folder: string;
  recursive: boolean;
  mask: string;
  minimum: number;
}
const encoder = new TextEncoder();

export function selectionSources(
  kind: SelectionKind,
  seed: string,
): {
  files: Map<string, Uint8Array>;
  rule: SelectionRule;
} {
  const rng = new Rng(`${kind}:${seed}`);
  const extension = rng.pick(['txt', 'csv']);
  const folder = rng.pick(['project', 'archive']);
  const rule = {
    folder,
    recursive: kind !== 'file-largest',
    mask:
      kind === 'file-mask-count'
        ? rng.pick(['note_?.txt', 'note_*.txt', '*_a.*'])
        : `*.${extension}`,
    minimum: kind === 'file-size-total' ? rng.int(2, 4) * 1024 : 0,
  };
  const files = new Map<string, Uint8Array>();
  const names = [
    'note_a.txt',
    `note_${rng.pick(['b', 'bb', 'bbb'])}.txt`,
    'note_ab.txt',
    `${rng.pick(['notes', 'log'])}_a.txt`,
    'note_a.csv',
    'table_b.csv',
  ];
  for (const root of ['project', 'archive']) {
    const sizes = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const [index, name] of [
      ...names,
      ...names.map((name) => `old/${name}`),
    ].entries()) {
      const size = (sizes[index] ?? 1) * 1024;
      const header = name.endsWith('.csv')
        ? 'record;value\n'
        : 'Original training notes. License: CC0-1.0.\n';
      const row = name.endsWith('.csv')
        ? 'sample;1\n'
        : 'A team records weather observations and checks instruments.\n';
      const remaining = size - encoder.encode(header).length;
      // ASCII makes both text and CSV byte counts explicit; the final CSV row has two fields.
      const tail = name.endsWith('.csv') ? ';0\n' : '\n';
      const repeats = Math.floor((remaining - tail.length) / row.length);
      const padding = remaining - repeats * row.length - tail.length;
      files.set(
        `${root}/${name}`,
        encoder.encode(
          header + row.repeat(repeats) + 'a'.repeat(padding) + tail,
        ),
      );
    }
  }
  files.set(
    'README.txt',
    encoder.encode(
      'Авторский учебный набор №12. Лицензия CC0-1.0.\nТексты и таблицы UTF-8. Размер — число байтов файла, а не место на диске или размер ZIP.\nПравила отбора указаны в условии задания.\n',
    ),
  );
  return { files, rule };
}

export function matchesMask(name: string, mask: string): boolean {
  const pattern = Array.from(mask, (char) =>
    char === '*'
      ? '.*'
      : char === '?'
        ? '.'
        : char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
  ).join('');
  return new RegExp(`^${pattern}$`, 'u').test(name);
}
export function selectFiles(
  files: ReadonlyMap<string, Uint8Array>,
  rule: SelectionRule,
): [string, Uint8Array][] {
  return [...files].filter(([path, bytes]) => {
    if (!path.startsWith(`${rule.folder}/`)) return false;
    const relative = path.slice(rule.folder.length + 1);
    return (
      (rule.recursive || !relative.includes('/')) &&
      matchesMask(relative.split('/').at(-1) ?? '', rule.mask) &&
      bytes.byteLength >= rule.minimum
    );
  });
}
function measure(
  kind: SelectionKind,
  selected: readonly [string, Uint8Array][],
): number {
  if (kind === 'file-mask-count') return selected.length;
  if (kind === 'file-size-total')
    return (
      selected.reduce((sum, [, bytes]) => sum + bytes.byteLength, 0) / 1024
    );
  return Math.max(0, ...selected.map(([, bytes]) => bytes.byteLength));
}
function statement(kind: SelectionKind, rule: SelectionRule): string {
  const scope = rule.recursive
    ? 'включая все вложенные папки'
    : 'без вложенных папок';
  const question =
    kind === 'file-mask-count'
      ? 'Сколько файлов соответствует этим условиям?'
      : kind === 'file-size-total'
        ? 'Найди суммарный размер отобранных файлов в КиБ. 1 КиБ = 1024 байта.'
        : 'Найди размер самого большого подходящего файла в байтах.';
  return `Скачай и распакуй авторский набор №12. Рассматривай папку ${rule.folder}, ${scope}. Маска имени файла: \`«${rule.mask}»\`. Регистр учитывается; * заменяет любую последовательность символов (в том числе пустую), ? — ровно один символ. Маска применяется только к имени файла с расширением, а не к пути. Другую корневую папку и README.txt не учитывай.\n\nМинимальный размер: ${String(rule.minimum)} байт включительно. Размер — число байтов содержимого файла, а не размер ZIP и не место на диске. ${question} Ответ запиши целым числом.`;
}
// Independent wildcard matcher: dynamic programming, without regular expressions.
function matchByTable(name: string, mask: string): boolean {
  let row = Array.from({ length: name.length + 1 }, (_, i) => i === 0);
  for (const token of mask) {
    const next = Array<boolean>(name.length + 1).fill(false);
    next[0] = token === '*' && (row[0] ?? false);
    for (let i = 1; i <= name.length; i++)
      next[i] =
        token === '*'
          ? (row[i] ?? false) || (next[i - 1] ?? false)
          : (token === '?' || token === name[i - 1]) && (row[i - 1] ?? false);
    row = next;
  }
  return row[name.length] ?? false;
}
const titles: Record<SelectionKind, string> = {
  'file-mask-count': 'Количество файлов по маске',
  'file-size-total': 'Суммарный объём отобранных файлов',
  'file-largest': 'Размер самого большого файла',
};
function selectionGenerator(kind: SelectionKind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 12,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const { files, rule } = selectionSources(kind, seed);
      const selected = selectFiles(files, rule);
      const answer = measure(kind, selected);
      if (!selected.length || !Number.isInteger(answer))
        throw new Error('Неподходящий файловый набор.');
      const total = selected.reduce(
        (sum, [, bytes]) => sum + bytes.byteLength,
        0,
      );
      const wrong =
        kind === 'file-mask-count'
          ? selectFiles(files, { ...rule, recursive: false }).length
          : kind === 'file-size-total'
            ? total
            : selected.length;
      return {
        ...taskFrom(kind, 12, seed, {
          statement: statement(kind, rule),
          answer: { type: 'integer', value: String(answer) },
          solution: [
            {
              text: `Открой ${rule.folder}. ${rule.recursive ? 'Включи вложенные папки.' : 'Исключи вложенные папки.'} Примени маску \`${rule.mask}\` и нижнюю границу ${String(rule.minimum)} байт.`,
            },
            {
              text: `Подходящие файлы и точные размеры: ${selected.map(([path, bytes]) => `${path} — ${String(bytes.byteLength)} байт`).join('; ')}.`,
            },
            {
              text:
                kind === 'file-mask-count'
                  ? `Считай каждый файл один раз, даже если имя повторяется в другой папке. Получено ${String(answer)} файлов. Ответ: ${String(answer)}.`
                  : kind === 'file-size-total'
                    ? `Сумма размеров: ${String(total)} байт. Делим на 1024: ${String(answer)} КиБ. Ответ: ${String(answer)}.`
                    : `Сравни размеры отобранных файлов. Максимум равен ${String(answer)} байт. Ответ: ${String(answer)}.`,
            },
          ],
          hints: [
            'Проверь корневую папку и правило обработки вложенных папок.',
            'Применяй маску к имени с расширением. Сверяй точный размер в байтах.',
            kind === 'file-mask-count'
              ? 'Одинаковые имена в разных каталогах обозначают разные файлы.'
              : kind === 'file-size-total'
                ? 'Сначала сложи размеры в байтах, затем раздели на 1024.'
                : 'Сортируй по числовому размеру после отбора файлов.',
          ],
          commonMistakes: [
            {
              answer: String(wrong),
              explanation:
                kind === 'file-mask-count'
                  ? 'Не учтены вложенные папки.'
                  : kind === 'file-size-total'
                    ? 'Ответ дан в байтах, а требуется в КиБ.'
                    : 'Посчитаны файлы вместо размера самого большого.',
            },
            {
              answer: String(
                kind === 'file-mask-count'
                  ? answer * 2
                  : kind === 'file-size-total'
                    ? selected.length
                    : total,
              ),
              explanation:
                kind === 'file-mask-count'
                  ? 'Включены файлы из обеих корневых папок, но указана только одна.'
                  : kind === 'file-size-total'
                    ? 'Посчитаны файлы вместо их суммарного объёма.'
                    : 'Сложены размеры файлов вместо выбора максимального.',
            },
          ],
        }),
        datasetId: selectionDatasetId(kind, seed),
      };
    },
    verify(task) {
      if (
        task.taskNumber !== 12 ||
        task.subtype !== kind ||
        task.generatorId !== `${kind}-v1` ||
        task.datasetId !== selectionDatasetId(kind, task.seed) ||
        task.answer.type !== 'integer'
      )
        return false;
      const { files, rule } = selectionSources(kind, task.seed);
      if (task.statement !== statement(kind, rule)) return false;
      let count = 0,
        total = 0,
        largest = 0;
      for (const [path, bytes] of files) {
        const parts = path.split('/');
        if (
          parts[0] !== rule.folder ||
          (!rule.recursive && parts.length !== 2) ||
          !matchByTable(parts.at(-1) ?? '', rule.mask) ||
          bytes.length < rule.minimum
        )
          continue;
        count++;
        total += bytes.length;
        if (bytes.length > largest) largest = bytes.length;
      }
      return (
        task.answer.value ===
        String(
          kind === 'file-mask-count'
            ? count
            : kind === 'file-size-total'
              ? total / 1024
              : largest,
        )
      );
    },
  };
}
export const fileMaskCount = selectionGenerator('file-mask-count');
export const fileSizeTotal = selectionGenerator('file-size-total');
export const fileLargest = selectionGenerator('file-largest');
