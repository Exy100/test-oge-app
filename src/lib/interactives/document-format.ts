import { documentSets } from '../../core/banks/document-content';
export interface DocumentSettings {
  fontSize: number;
  titleAlign: 'left' | 'center';
  bodyAlign: 'left' | 'justify';
  indent: number;
  lineHeight: number;
  gap: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  merged: boolean;
  firstWidth: number;
  secondWidth: number;
  tableCentered: boolean;
  verticalMiddle: boolean;
}
export function documentSet(id: string) {
  const set = documentSets.find((set) => set.id === id);
  if (!set) throw new RangeError('Неизвестный учебный документ.');
  return set;
}
export function documentTarget(id: string): DocumentSettings {
  const set = documentSet(id);
  return {
    fontSize: 14,
    titleAlign: 'center',
    bodyAlign: 'justify',
    indent: 1,
    lineHeight: set.format.lineHeight,
    gap: 14,
    bold: true,
    italic: true,
    underline: true,
    merged: set.family !== 'instructions',
    firstWidth: 7,
    secondWidth: 8,
    tableCentered: true,
    verticalMiddle: true,
  };
}
export function documentInitial(
  id: string,
  focus: 'text' | 'table',
): DocumentSettings {
  const target = documentTarget(id);
  return focus === 'text'
    ? {
        ...target,
        fontSize: 12,
        titleAlign: 'left',
        bodyAlign: 'left',
        indent: 0,
        lineHeight: 100,
        gap: 0,
        bold: false,
        italic: false,
        underline: false,
      }
    : {
        ...target,
        merged: !target.merged,
        firstWidth: 8,
        secondWidth: 8,
        tableCentered: false,
        verticalMiddle: false,
      };
}
export function documentChecks(id: string, settings: DocumentSettings) {
  const target = documentTarget(id);
  const labels: Record<keyof DocumentSettings, string> = {
    fontSize: 'Размер шрифта',
    titleAlign: 'Заголовок по центру',
    bodyAlign: 'Основной текст по ширине',
    indent: 'Отступ первой строки',
    lineHeight: 'Межстрочный интервал',
    gap: 'Интервал после абзаца',
    bold: 'Полужирное первое слово абзаца 1',
    italic: 'Курсив первого слова абзаца 2',
    underline: 'Подчёркивание первого слова абзаца 2',
    merged: 'Объединение строк заголовков',
    firstWidth: 'Ширина столбца 1',
    secondWidth: 'Ширина столбца 2',
    tableCentered: 'Таблица по центру',
    verticalMiddle: 'Вертикальное выравнивание ячеек',
  };
  return (Object.keys(labels) as (keyof DocumentSettings)[]).map((key) => ({
    key,
    label: labels[key],
    correct: settings[key] === target[key],
  }));
}
