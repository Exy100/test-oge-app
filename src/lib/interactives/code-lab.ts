import { Rng } from '../../core/rng';
import { analyzeSignal, encodeMessage, type CodeEntry } from './decoder';

export type CodeScenario = 'read' | 'branches' | 'repeats';
export type CodeFrame = { path: string; note: string; dead: boolean };
export function repeatedLetters(message: string) {
  return [...new Set(message)]
    .filter((letter) => message.split(letter).length > 2)
    .sort()
    .join('');
}

/** Walk every locally valid branch. A completed path alone does not prove uniqueness. */
export function codeWalk(entries: readonly CodeEntry[], signal: string) {
  const analysis = analyzeSignal(entries, signal);
  if (analysis.count !== 1n)
    throw new RangeError(
      'Учебное задание должно иметь единственную расшифровку.',
    );
  const frames: CodeFrame[] = [
    {
      path: '',
      note: 'Начнём с первого знака. Сравни начало сигнала с кодами в таблице.',
      dead: false,
    },
  ];
  const candidates = [...entries].sort((a, b) => b.code.length - a.code.length);
  function visit(path: string, offset: number) {
    if (frames.length > 256)
      throw new RangeError('Слишком много шагов для разбора.');
    const matches = candidates.filter(({ code }) =>
      signal.startsWith(code, offset),
    );
    if (offset === signal.length) return;
    for (const entry of matches) {
      const next = offset + entry.code.length;
      const dead =
        next < signal.length &&
        !entries.some(({ code }) => signal.startsWith(code, next));
      frames.push({
        path: path + entry.letter,
        dead,
        note: dead
          ? `Код ${entry.code} подходит, но оставшийся сигнал ${signal.slice(next)} прочитать нельзя. Вернёмся к развилке.`
          : next === signal.length
            ? 'Весь сигнал прочитан. Проверим, остались ли другие пути.'
            : `Код ${entry.code} соответствует букве ${entry.letter}. Теперь проверим остаток.`,
      });
      visit(path + entry.letter, next);
      frames.push({
        path,
        dead: false,
        note: 'Возвращаемся на шаг назад, чтобы проверить другие подходящие коды.',
      });
    }
  }
  visit('', 0);
  frames.push({
    path: analysis.messages[0] ?? '',
    dead: false,
    note: 'Все пути проверены. Только этот разбор использует весь сигнал без остатка.',
  });
  return frames;
}

export function codeProblem(scenario: CodeScenario, variant: number) {
  if (!Number.isSafeInteger(variant) || variant < 0)
    throw new RangeError('Неверный номер варианта.');
  const rng = new Rng(`code-lab-v1:${scenario}:${String(variant)}`);
  const letters =
    variant === 0 ? ['А', 'Б', 'В', 'Г'] : rng.shuffle(['А', 'К', 'М', 'Р']);
  const codes =
    scenario === 'read' ? ['0', '10', '110', '111'] : ['0', '01', '11', '101'];
  const entries = codes.map((code, index) => ({
    letter: letters[index] ?? '',
    code: variant % 2 ? code.replaceAll('0', '.').replaceAll('1', '-') : code,
  }));
  let message = '';
  let signal = '';
  for (let attempt = 0; attempt < 500; attempt++) {
    const pattern =
      variant === 0 && attempt === 0
        ? scenario === 'read'
          ? '0120'
          : scenario === 'branches'
            ? '020'
            : '0200'
        : Array.from({ length: rng.int(4, 6) }, () =>
            String(rng.int(0, 3)),
          ).join('');
    message = Array.from(pattern, (index) => letters[Number(index)] ?? '').join(
      '',
    );
    signal = encodeMessage(entries, message);
    const analysis = analyzeSignal(entries, signal);
    if (analysis.count !== 1n || analysis.messages[0] !== message) continue;
    if (
      scenario === 'repeats' &&
      (!repeatedLetters(message) ||
        repeatedLetters(message).length === new Set(message).size)
    )
      continue;
    if (scenario !== 'read') {
      const walk = codeWalk(entries, signal);
      if (!walk.some((f) => f.dead) || walk.length > 40) continue;
    }
    break;
  }
  const analysis = analyzeSignal(entries, signal);
  if (analysis.count !== 1n || analysis.messages[0] !== message)
    throw new RangeError('Не удалось создать задание.');
  const answer = scenario === 'repeats' ? repeatedLetters(message) : message;
  const frames =
    scenario === 'read'
      ? [
          {
            path: '',
            note: 'Выбери код, с которого начинается сигнал.',
            dead: false,
          },
          ...Array.from(message, (_, index) => ({
            path: message.slice(0, index + 1),
            note:
              index === message.length - 1
                ? 'Весь сигнал прочитан. Ни один код таблицы не является началом другого, поэтому расшифровка единственна.'
                : 'Буква найдена. Продолжим с первого непрочитанного знака.',
            dead: false,
          })),
        ]
      : codeWalk(entries, signal);
  return { entries, signal, message, answer, frames };
}
