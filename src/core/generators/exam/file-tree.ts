import type { SourceFile } from '../../datasets/index.ts';
import { makeHtm, readHtm } from '../../datasets/htm.ts';
import { makeTiff } from '../../datasets/tiff.ts';
import { originalJpeg } from '../../datasets/jpeg.ts';
import { makePdf } from '../../datasets/pdf.ts';
import { Rng } from '../../rng.ts';
import { authors, readingSources } from './reading-corpus.ts';

export interface FileQuery {
  folders: readonly string[];
  extensions: readonly string[];
}
const roots = ['Проза', 'Проза-архив', 'Заметки', 'Иллюстрации', 'Письма'];
interface TreeFile extends SourceFile {
  extension: string;
}
function illustration(index: number): Uint8Array {
  const width = 96 + (index % 3) * 8,
    height = 64 + (index % 4) * 8,
    pixels = Uint8Array.from({ length: width * height }, (_, i) => {
      const x = i % width,
        y = Math.floor(i / width),
        horizon = Math.floor(height * 0.5);
      if ((x - width * 0.75) ** 2 + (y - height * 0.2) ** 2 < 50) return 230;
      if (y < horizon - Math.sin(x / 13 + index) * 7) return 190;
      if (
        Math.abs(x - width / 2 - (y - horizon) * 0.4) <
        (y - horizon) * 0.35 + 4
      )
        return 130;
      if (x > 8 && x < 25 && y > horizon && y < horizon + 15)
        return x > 14 && x < 18 && y > horizon + 7 ? 35 : 100;
      return 65 + ((x + y + index) % 5) * 4;
    });
  return makeTiff(width, height, pixels);
}
let tree: readonly TreeFile[] | undefined;
function records(): readonly TreeFile[] {
  if (tree) return tree;
  const texts = readingSources().filter((source) => source.format === 'htm');
  tree = Array.from({ length: 95 }, (_, i): TreeFile => {
    const format = (['htm', 'tiff', 'pdf', 'jpeg'] as const)[i % 4] ?? 'htm',
      root = roots[Math.floor(i / 19)] ?? '',
      author =
        authors[(Math.floor(i / 4) % 2) + (Math.floor(i / 19) % 3) * 2] ?? '',
      path = `${root}/${author}/${i % 3 === 0 ? 'Черновики/' : ''}работа-${String((i % 19) + 1).padStart(2, '0')}.${format}`;
    let bytes: Uint8Array;
    if (format === 'htm') {
      const candidates = texts.filter((text) =>
        text.path.startsWith(`Тексты/${author}/`),
      );
      const source = candidates[Math.floor(i / 4) % candidates.length];
      if (!source) throw new Error('Нет авторского текста.');
      const document = readHtm(source.bytes);
      bytes = makeHtm({
        title: `Путевые страницы ${String(i + 1)}`,
        blocks: document.blocks.slice(0, 17),
      });
    } else if (format === 'tiff') bytes = illustration(i);
    else if (format === 'jpeg') bytes = originalJpeg(Math.floor(i / 4) % 8);
    else
      bytes = makePdf([
        'River observations',
        'Original educational notes. CC0-1.0.',
        `Sheet ${String(i + 1)}`,
        `Day ${String(1 + (i % 28))} August`,
        `Air temperature: ${String(12 + (i % 14))} degrees C`,
        `Water level: ${String(110 + (i % 60))} cm`,
        'Compare the measurements before drawing conclusions.',
        'Record the date, place and instrument used.',
      ]);
    return { path, bytes, format, extension: '.' + format, license: 'CC0-1.0' };
  });
  return tree;
}
export function fileTreeSources(): SourceFile[] {
  return [
    ...records().map(({ path, bytes, format, license }) => ({
      path,
      bytes: bytes.slice(),
      format,
      license,
    })),
    {
      path: 'README.txt',
      format: 'txt',
      license: 'CC0-1.0',
      bytes: new TextEncoder().encode(
        'Авторский файловый набор №12: 95 текстов, путевых листов и иллюстраций. Все события вымышлены. Лицензия CC0-1.0.\nHTM и PDF — документы, TIFF и JPEG — изображения. Распакуй ZIP, затем ищи по расширениям в указанных каталогах со всеми вложенными папками. Каждое найденное имя в отдельном каталоге обозначает отдельный файл.\n',
      ),
    },
  ];
}
export function fileConstruction(seed: string): {
  query: FileQuery;
  count: number;
  paths: readonly string[];
} {
  const rng = new Rng('file-extensions:' + seed),
    all = records(),
    candidates = [
      ...roots,
      ...new Set(all.map(({ path }) => path.split('/').slice(0, 2).join('/'))),
    ],
    folders: string[] = [],
    limit = rng.int(2, 4);
  for (const folder of rng.shuffle(candidates)) {
    if (
      folders.every(
        (other) =>
          !other.startsWith(folder + '/') && !folder.startsWith(other + '/'),
      )
    )
      folders.push(folder);
    if (folders.length === limit) break;
  }
  const matches = all.filter(({ path }) =>
      folders.some((folder) => path.startsWith(folder + '/')),
    ),
    choices = [['.htm'], ['.htm', '.tiff'], ['.jpeg', '.pdf']].filter(
      (extensions) =>
        matches.some((file) => extensions.includes(file.extension)),
    ),
    extensions = rng.pick(choices);
  return {
    query: { folders, extensions },
    count: matches.filter((file) => extensions.includes(file.extension)).length,
    paths: matches
      .filter((file) => extensions.includes(file.extension))
      .map(({ path }) => path)
      .sort(),
  };
}
/** Walk complete path segments, count each actual file once, fold only extension case. */
export function selectedFilePaths(
  files: ReadonlyMap<string, Uint8Array>,
  query: FileQuery,
): string[] {
  return [...files.keys()]
    .filter((path) => {
      const parts = path.split('/'),
        name = parts.pop() ?? '',
        extension = name.slice(name.lastIndexOf('.')).toLowerCase();
      return (
        query.extensions.includes(extension) &&
        query.folders.some((folder) => {
          const scope = folder.split('/');
          return (
            scope.length <= parts.length &&
            scope.every((part, i) => part === parts[i])
          );
        })
      );
    })
    .sort();
}
