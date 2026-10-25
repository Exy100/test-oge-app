import { Fragment, useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  documentSet,
  documentTarget,
  documentInitial,
  documentChecks,
  type DocumentSettings,
} from '../lib/interactives/document-format';
import OfficeDownload from '../components/lessons/OfficeDownload';
export default function DocumentFormat({ id, parameters }: InteractiveProps) {
  const initial = parameters.dataset ?? 'D01',
    focus = parameters.focus ?? 'text';
  if (typeof initial !== 'string' || (focus !== 'text' && focus !== 'table'))
    throw new RangeError('Проверь набор и учебную цель документа.');
  documentSet(initial);
  const [preset, setPreset] = useState(initial),
    [settings, setSettings] = useState(() => documentInitial(initial, focus)),
    [checked, setChecked] = useState(false),
    [error, setError] = useState(''),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  const set = documentSet(preset),
    target = documentTarget(preset),
    checks = documentChecks(preset, settings);
  const numberLimits: Record<string, readonly [number, number]> = {
    fontSize: [8, 30],
    indent: [0, 3],
    lineHeight: [100, 200],
    gap: [0, 30],
    firstWidth: [3, 10],
    secondWidth: [3, 10],
  };
  const invalidNumber = Object.entries(drafts).some(([key, raw]) => {
    const limit = numberLimits[key];
    return (
      !limit ||
      !raw.trim() ||
      !Number.isFinite(Number(raw)) ||
      Number(raw) < limit[0] ||
      Number(raw) > limit[1]
    );
  });
  function edit<K extends keyof DocumentSettings>(
    key: K,
    value: DocumentSettings[K],
  ) {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setChecked(false);
    setError('');
  }
  function header(text: string) {
    return (
      <tr>
        <th colSpan={settings.merged ? 2 : 1}>{text}</th>
        {!settings.merged && <th aria-label="Пустая ячейка">—</th>}
      </tr>
    );
  }
  return (
    <div className="information-lab">
      <p>
        Учебная проверка свойств, а не экспертный балл за №13.2. Предпросмотр
        схематичен: печатный вид проверь, открыв ODT в офисном редакторе.
      </p>
      <label htmlFor={`${id}-dataset`}>Набор документа</label>
      <select
        id={`${id}-dataset`}
        value={preset}
        onChange={(event) => {
          setPreset(event.target.value);
          setSettings(documentInitial(event.target.value, focus));
          setDrafts({});
          setChecked(false);
        }}
      >
        {['D01', 'D02', 'D03'].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <p>
        Образец фрагмента: весь текст {target.fontSize} пт; заголовок по центру,
        абзацы по ширине; первая строка {target.indent} см, межстрочный{' '}
        {target.lineHeight}%, интервал после абзаца {target.gap} пт. Первое
        слово абзаца 1 — полужирное, абзаца 2 — курсив и подчёркивание. Столбцы{' '}
        {target.firstWidth} и {target.secondWidth} см, таблица по центру, ячейки
        по вертикали по центру.{' '}
        {target.merged
          ? 'Строки заголовков объединены на два столбца.'
          : 'Заголовки двух столбцов не объединены.'}
      </p>
      {(
        [
          ['fontSize', 'Размер шрифта, пт', 8, 30, 1],
          ['indent', 'Первая строка, см', 0, 3, 0.1],
          ['lineHeight', 'Межстрочный интервал, %', 100, 200, 1],
          ['gap', 'После абзаца, пт', 0, 30, 1],
          ['firstWidth', 'Столбец 1, см', 3, 10, 0.1],
          ['secondWidth', 'Столбец 2, см', 3, 10, 0.1],
        ] as const
      ).map(([key, label, min, max, step]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            value={drafts[key] ?? settings[key]}
            min={min}
            max={max}
            step={step}
            onChange={(event) => {
              const value = event.target.valueAsNumber,
                raw = event.target.value;
              setDrafts((previous) => ({ ...previous, [key]: raw }));
              setChecked(false);
              if (Number.isFinite(value) && value >= min && value <= max)
                edit(key, value);
              else
                setError(
                  `Для поля «${label}» допустимы значения ${String(min)}–${String(max)}.`,
                );
            }}
          />
        </label>
      ))}
      <label htmlFor={`${id}-title-align`}>Выравнивание заголовка</label>
      <select
        id={`${id}-title-align`}
        value={settings.titleAlign}
        onChange={(event) => {
          edit('titleAlign', event.target.value as 'left' | 'center');
        }}
      >
        <option value="left">По левому краю</option>
        <option value="center">По центру</option>
      </select>
      <label htmlFor={`${id}-body-align`}>Выравнивание основного текста</label>
      <select
        id={`${id}-body-align`}
        value={settings.bodyAlign}
        onChange={(event) => {
          edit('bodyAlign', event.target.value as 'left' | 'justify');
        }}
      >
        <option value="left">По левому краю</option>
        <option value="justify">По ширине</option>
      </select>
      {(
        [
          ['bold', 'Полужирное слово в абзаце 1'],
          ['italic', 'Курсив слова в абзаце 2'],
          ['underline', 'Подчёркивание слова в абзаце 2'],
          ['merged', 'Объединить строки заголовков'],
          ['tableCentered', 'Таблица по центру'],
          ['verticalMiddle', 'Ячейки по вертикали по центру'],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={(event) => {
              edit(key, event.target.checked);
            }}
          />{' '}
          {label}
        </label>
      ))}
      {(error || invalidNumber) && (
        <p role="alert">
          {invalidNumber
            ? 'Укажи числа в пределах подписей полей; проверка и сохранение ждут допустимых значений.'
            : error}
        </p>
      )}
      <h3>Предпросмотр учебного документа</h3>
      <div
        className="office-document"
        style={{ fontSize: `${String(settings.fontSize / 14)}rem` }}
      >
        <p style={{ textAlign: settings.titleAlign }}>{set.title}</p>
        {set.paragraphs.map((text, index) => {
          const parts = /^(\S+)([\s\S]*)$/u.exec(text);
          return (
            <p
              key={text}
              style={{
                textAlign: settings.bodyAlign,
                textIndent: `${String(settings.indent)}cm`,
                lineHeight: settings.lineHeight / 100,
                marginBlockEnd: `${String(settings.gap)}pt`,
              }}
            >
              <span
                style={{
                  fontWeight: index === 0 && settings.bold ? 'bold' : 'normal',
                  fontStyle:
                    index === 1 && settings.italic ? 'italic' : 'normal',
                  textDecoration:
                    index === 1 && settings.underline ? 'underline' : 'none',
                }}
              >
                {parts?.[1]}
              </span>
              {parts?.[2]}
            </p>
          );
        })}
        <table
          style={{
            width: `${String(Math.min(100, ((settings.firstWidth + settings.secondWidth) / 17) * 100))}%`,
            marginInline: settings.tableCentered ? 'auto' : '0',
          }}
        >
          <caption>Таблица из {preset}</caption>
          <colgroup>
            <col
              style={{
                width: `${String((settings.firstWidth / (settings.firstWidth + settings.secondWidth)) * 100)}%`,
              }}
            />
            <col />
          </colgroup>
          <thead>
            {set.headers.length === 1 ? (
              header(set.headers[0] ?? '')
            ) : (
              <tr>
                {set.headers.map((text) => (
                  <th key={text} scope="col">
                    {text}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {set.rows.map((row, index) => (
              <Fragment key={index}>
                {set.family === 'sections' &&
                  index === 5 &&
                  header(set.sectionTitle)}
                <tr>
                  {row.map((text, index) => (
                    <td
                      key={index}
                      style={{
                        verticalAlign: settings.verticalMiddle
                          ? 'middle'
                          : 'top',
                      }}
                    >
                      {text}
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button button-dark"
          disabled={invalidNumber}
          onClick={() => {
            setChecked(true);
          }}
        >
          Проверить свойства
        </button>
        <button
          type="button"
          className="button button-light"
          onClick={() => {
            setSettings(documentInitial(preset, focus));
            setDrafts({});
            setError('');
            setChecked(false);
          }}
        >
          Вернуть начальные свойства
        </button>
      </div>
      <div role="status">
        {checked && (
          <>
            <p>
              {checks.every((check) => check.correct)
                ? 'Верно: учебные свойства совпали с образцом.'
                : 'Проверь свойства, отмеченные как требующие исправления.'}{' '}
              Это не оценка всего офисного файла.
            </p>
            <ul>
              {checks.map((check) => (
                <li key={check.key}>
                  {check.correct ? 'Совпало' : 'Исправь'}: {check.label}.
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <OfficeDownload
        name={`lab-${preset}.odt`}
        disabled={invalidNumber}
        create={async () => {
          const { exportDocument } =
            await import('../lib/interactives/office-export');
          return exportDocument(preset, settings);
        }}
      />
    </div>
  );
}
