import type { Dataset, SourceFile } from '../../datasets/index.ts';
import type { Generator, TaskInstance } from '../../types.ts';
import { quantity, taskFrom } from '../task.ts';
import {
  readingConstruction,
  readingSources,
  findReadingEvidence,
} from './reading-corpus.ts';
import {
  fileConstruction,
  fileTreeSources,
  selectedFilePaths,
} from './file-tree.ts';

function readingTask(seed: string): TaskInstance {
  const data = readingConstruction(seed),
    q = data.query,
    question =
      q.mode === 'nickname'
        ? 'Как звали щенка, который был рядом с героем в этом эпизоде?'
        : q.mode === 'character'
          ? `Какова фамилия человека, произнёсшего слова «Это ${data.adjective} труд» в этом эпизоде?`
          : 'Как называется профессия человека, произнёсшего реплику о труде в этом эпизоде?',
    task = taskFrom('context-reading', 11, seed, {
      statement: `Скачай и распакуй корпус рассказов. Автор рассказа — ${q.author}. Найди эпизод: ${q.hero} ${q.episode}. ${question} Запиши одно слово.`,
      answer: { type: 'word', value: data.answer, caseSensitive: false },
      solution: [
        {
          text: `Открой папку Тексты/${q.author}. Ищи имя ${q.hero} и слова «${q.episode}»: одного совпадения имени недостаточно, нужен указанный эпизод.`,
        },
        {
          text: `Прочитай эпизод и соседние абзацы. ${q.mode === 'nickname' ? 'Кличка щенка названа при описании встречи на причале, перед событием.' : `Реплика: «Это ${data.adjective} труд». ${q.mode === 'role' ? 'Профессия этого человека названа при встрече на причале, перед описанием события.' : 'Проверь, кому принадлежит реплика и о каком событии идёт речь.'}`}`,
        },
        {
          text: `${q.mode === 'nickname' ? 'Кличка щенка' : q.mode === 'character' ? 'Фамилия говорящего' : 'Профессия говорящего'} — ${data.answer}. Для проверки сопоставь найденное слово с героем ${q.hero} и событием «${q.episode}», а не с соседним рассказом. Ответ: ${data.answer}.`,
        },
      ],
      hints: [
        `Открой папку «Тексты/${q.author}» и найди упоминания имени ${q.hero}.`,
        `Среди найденных мест выбери событие «${q.episode}». Другой эпизод с героем ${q.hero} не подходит.`,
        q.mode === 'nickname'
          ? `От события «${q.episode}» вернись к началу этой главы: там сказано, как звали щенка. Не подставляй имя ${q.hero}.`
          : `Найди реплику «Это ${data.adjective} труд» рядом с событием «${q.episode}». ${q.mode === 'character' ? 'Проверь фамилию говорящего.' : 'Вернись к началу этой главы: профессия названа при встрече на причале.'}`,
      ],
      commonMistakes: [
        {
          answer: q.hero,
          explanation:
            'Имя главного героя не отвечает на вопрос. Проверь, о ком именно спрашивается в условии.',
        },
        {
          answer: q.mode === 'nickname' ? 'щенок' : 'путешественник',
          explanation:
            q.mode === 'nickname'
              ? 'Нужна кличка, а не название животного. Она названа в соседнем абзаце.'
              : 'Это общее описание героя; нужное имя или профессия названы в эпизоде.',
        },
      ],
    });
  return {
    ...task,
    id: `context-reading-v2:${seed}`,
    generatorId: 'context-reading-v2',
    datasetId: `context-reading-v2:files:${seed}`,
    difficulty: q.mode !== 'character' && data.distance >= 3 ? 3 : 2,
  };
}
function selectionTask(seed: string): TaskInstance {
  const { query: q, count, paths: files } = fileConstruction(seed),
    task = taskFrom('file-extensions', 12, seed, {
      statement: `Скачай и распакуй файловый набор. Сколько файлов с ${q.extensions.length === 1 ? 'расширением' : 'расширениями'} ${q.extensions.join(', ')} находится в следующих каталогах, включая все вложенные папки?\n\n${q.folders.map((folder) => `- ${folder}`).join('\n')}\n\nДругие каталоги не учитывай.`,
      answer: { type: 'integer', value: String(count) },
      solution: [
        {
          text: `В каждом указанном каталоге включи поиск во вложенных папках. Отбирай ${q.extensions.join(', ')} по расширению файла.`,
        },
        {
          text: `Подходящие файлы:\n\n${files.map((path) => `- ${path}`).join('\n')}`,
        },
        {
          text: `Проверка по каталогам: ${q.folders.map((folder) => `${folder} — ${String(files.filter((path) => path.startsWith(folder + '/')).length)}`).join('; ')}. Всего ${quantity(count, ['файл', 'файла', 'файлов'])}. Одинаковые имена в разных каталогах обозначают разные файлы; каждый полный путь учтён один раз.`,
        },
      ],
      hints: [
        `Ищи только в ${q.folders.join('; ')}, включая вложенные папки. Остальные корневые каталоги не учитывай.`,
        `Нужны расширения ${q.extensions.join(', ')} в конце имени. ${q.extensions.length > 1 ? 'Объедини результаты по этим расширениям.' : 'Папка с похожим именем не считается файлом этого расширения.'}`,
        `В ${q.folders.join('; ')} считай каждый полный путь один раз. Два файла с одинаковым именем в разных вложенных папках — два разных файла.`,
      ],
      commonMistakes: [
        {
          answer: String(count - 1),
          explanation:
            'Пропущен файл. Проверь вложенные папки и все перечисленные расширения.',
        },
        {
          answer: String(count * 2),
          explanation:
            'Результаты нельзя удваивать: каждый полный путь считается один раз.',
        },
      ],
    });
  return {
    ...task,
    id: `file-extensions-v2:${seed}`,
    generatorId: 'file-extensions-v2',
    datasetId: `file-extensions-v2:files:${seed}`,
    difficulty:
      q.folders.length === 4 ||
      (q.folders.length >= 3 && q.extensions.length >= 2)
        ? 3
        : q.folders.length === 2 && q.extensions.length === 1
          ? 1
          : 2,
  };
}
const reading: Generator = {
  id: 'context-reading-v2',
  taskNumber: 11,
  subtype: 'context-reading',
  title: 'Поиск по автору, герою и эпизоду',
  generate: readingTask,
  verify(task) {
    if (JSON.stringify(task) !== JSON.stringify(readingTask(task.seed)))
      return false;
    const data = readingConstruction(task.seed),
      hits = findReadingEvidence(
        new Map(
          readingSources(data.query.author).map(({ path, bytes }) => [
            path,
            bytes,
          ]),
        ),
        data.query,
      );
    return (
      hits.length === 1 &&
      task.answer.type === 'word' &&
      task.answer.value === hits[0]?.answer
    );
  },
};
const selection: Generator = {
  id: 'file-extensions-v2',
  taskNumber: 12,
  subtype: 'file-extensions',
  title: 'Файлы по расширениям в нескольких каталогах',
  generate: selectionTask,
  verify(task) {
    if (JSON.stringify(task) !== JSON.stringify(selectionTask(task.seed)))
      return false;
    const { query } = fileConstruction(task.seed),
      paths = selectedFilePaths(
        new Map(fileTreeSources().map(({ path, bytes }) => [path, bytes])),
        query,
      );
    return (
      task.answer.type === 'integer' &&
      task.answer.value === String(paths.length)
    );
  },
};
export const confirmedFileGenerators: readonly Generator[] = [
  reading,
  selection,
];
export function confirmedFileSources(task: TaskInstance): SourceFile[] {
  const generator = confirmedFileGenerators.find(
    ({ id }) => id === task.generatorId,
  );
  if (!generator?.verify(task))
    throw new Error('Файловое задание не соответствует своему seed.');
  return task.taskNumber === 11 ? readingSources() : fileTreeSources();
}
export async function createConfirmedFileDataset(
  task: TaskInstance,
): Promise<Dataset> {
  const generator = confirmedFileGenerators.find(
    ({ id }) => id === task.generatorId,
  );
  if (!generator?.verify(task))
    throw new Error('Файловое задание не соответствует своему seed.');
  if (!task.datasetId) throw new Error('Отсутствует идентификатор набора.');
  const [{ createDataset }, { DatasetManifestSchema }] = await Promise.all([
    import('../../datasets/index.ts'),
    import('../../schemas/dataset.ts'),
  ]);
  let pending = templates.get(task.taskNumber);
  if (!pending) {
    pending = createDataset(
      `${task.generatorId}:shared-corpus`,
      'shared-corpus-v2',
      task.generatorId,
      task.taskNumber === 11 ? readingSources() : fileTreeSources(),
    );
    templates.set(task.taskNumber, pending);
  }
  const template = await pending;
  return {
    manifest: DatasetManifestSchema.parse({
      ...template.manifest,
      id: task.datasetId,
      seed: task.seed,
    }),
    files: new Map(
      [...template.files].map(([path, bytes]) => [path, bytes.slice()]),
    ),
    archive: template.archive.slice(),
  };
}
// Exactly two fixed source collections. Returned buffers/manifests never expose cache state.
const templates = new Map<number, Promise<Dataset>>();
