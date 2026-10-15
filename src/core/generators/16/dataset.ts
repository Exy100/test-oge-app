import { createDataset, type Dataset, type SourceFile } from '../../datasets';
import type { TaskInstance } from '../../types';
import { isProgramKind, programCases, programParameters } from './problems';
import { pythonGenerators, referencePython } from './programs';
import { localPythonChecker } from './local-checker';

export async function createPythonDataset(
  task: TaskInstance,
): Promise<Dataset> {
  const generator = pythonGenerators.find(
    (item) => item.id === task.generatorId,
  );
  if (!generator || !isProgramKind(task.subtype) || !generator.verify(task))
    throw new Error('Неизвестный набор программы.');
  const p = programParameters(task.subtype, task.seed),
    cases = programCases(p, task.seed),
    sources: SourceFile[] = [];
  const put = (path: string, format: SourceFile['format'], text: string) => {
    sources.push({
      path,
      format,
      bytes: new TextEncoder().encode(text.trimEnd() + '\n'),
      license: 'CC0-1.0',
    });
  };
  const json = (path: string, value: unknown) => {
    put(path, 'json', JSON.stringify(value, null, 2));
  };
  put(
    'README.txt',
    'txt',
    'Авторский учебный набор №16. Все материалы CC0-1.0. Персональные данные не нужны.\n1. Прочитай assignment.txt. Напиши собственную программу на Python 3 и сохрани как answer.py в UTF-8.\n2. В tests/index.json перечислены десять пар файлов ввода и ожидаемого вывода, включая пример и границы. В каждой строке входа одно целое число. Параметры задачи — source/parameters.json.\n3. Запусти в терминале из распакованного каталога: python3 check.py answer.py (Windows: py -3 check.py answer.py). Скрипт запускает программу заново для каждого теста, подаёт стандартный ввод и сравнивает целые числа стандартного вывода. Пробелы и переводы строк между числами не влияют на результат; лишние слова, пропущенные числа, авария или превышение 2 секунд делают тест непройденным.\n4. Для одного теста в обычном терминале: python3 answer.py < tests/01.input.txt. В среде разработки можно ввести те же строки вручную.\n5. После самостоятельного решения сравни с reference/answer.py. Его можно проверить командой python3 check.py reference/answer.py.\nПроверяющий скрипт исполняет выбранный локальный файл с обычными правами пользователя; это не песочница. Запускай только свой или доверенный код. Проверяется конечный набор тестов, а не доказательство корректности для всех вводов. Сохранение файла само по себе не подтверждает решение. Критерии учебные, не официальный рубрикатор экзамена.',
  );
  put('assignment.txt', 'txt', task.statement);
  json('source/parameters.json', p);
  put('reference/answer.py', 'py', referencePython(p));
  put('check.py', 'py', localPythonChecker);
  json('criteria.json', {
    kind: 'educational-self-assessment',
    ...task.criteria,
  });
  json('tests/index.json', {
    parameters: p,
    timeoutSeconds: 2,
    cases: cases.map((item) => ({
      id: item.id,
      label: item.label,
      input: `tests/${item.id}.input.txt`,
      expected: `tests/${item.id}.expected.txt`,
    })),
  });
  for (const item of cases) {
    put(`tests/${item.id}.input.txt`, 'txt', item.input);
    put(`tests/${item.id}.expected.txt`, 'txt', item.output);
  }
  return createDataset(
    task.datasetId ?? '',
    task.seed,
    task.generatorId,
    sources,
  );
}
