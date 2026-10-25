import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  labRows,
  evaluateFormula,
  copyFormula,
  selectedRows,
  chartCounts,
} from '../lib/interactives/spreadsheet';
import OfficeDownload from '../components/lessons/OfficeDownload';
import OfficePie from '../components/lessons/OfficePie';
export default function SpreadsheetLab({ id, parameters }: InteractiveProps) {
  const mode = parameters.mode ?? 'references';
  if (mode !== 'references' && mode !== 'selection' && mode !== 'chart')
    throw new RangeError('Неизвестный режим таблицы.');
  const [first, setFirst] = useState(
      mode === 'references'
        ? '=SUM(D2:D13)'
        : '=COUNTIFS(C2:C13;7;D2:D13;">200")',
    ),
    [second, setSecond] = useState('=AVERAGEIF(B2:B13;1;D2:D13)'),
    [school, setSchool] = useState(mode === 'chart' ? 1 : 0),
    [grade, setGrade] = useState(0),
    [threshold, setThreshold] = useState(-1),
    [chartSource, setChartSource] = useState(
      mode === 'chart' ? 'selected' : 'all',
    ),
    [legend, setLegend] = useState(mode !== 'chart'),
    [labels, setLabels] = useState(mode !== 'chart'),
    [checked, setChecked] = useState(false),
    [copy, setCopy] = useState('=$D2+D$2+$D$2'),
    [shiftX, setShiftX] = useState(1),
    [shiftY, setShiftY] = useState(1),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  const invalidNumber = Object.entries(drafts).some(([key, raw]) => {
    const n = Number(raw);
    return (
      !raw.trim() ||
      !Number.isFinite(n) ||
      n < (key === 'threshold' ? -1 : -100) ||
      n > (key === 'threshold' ? 400 : 100) ||
      (key !== 'threshold' && !Number.isInteger(n))
    );
  });
  let one: number | undefined,
    two: number | undefined,
    formulaError = '',
    copied = '',
    copyError = '';
  try {
    one = evaluateFormula(first);
    two = evaluateFormula(second);
  } catch (cause) {
    formulaError = cause instanceof Error ? cause.message : 'Проверь формулы.';
  }
  try {
    copied = copyFormula(copy, shiftX, shiftY);
  } catch (cause) {
    copyError = cause instanceof Error ? cause.message : 'Проверь сдвиг.';
  }
  const selected = selectedRows(school, grade, threshold),
    chartRows = chartSource === 'all' ? labRows.slice(1) : selected,
    counts = chartCounts(chartRows),
    allCounts = chartCounts(labRows.slice(1));
  const correctFirst =
    mode === 'references'
      ? labRows.slice(1).reduce((sum, row) => sum + Number(row[3]), 0)
      : labRows.slice(1).filter((row) => row[2] === 7 && Number(row[3]) > 200)
          .length;
  const sample = labRows.slice(1).filter((row) => row[1] === 1),
    correctSecond =
      sample.reduce((sum, row) => sum + Number(row[3]), 0) / sample.length;
  return (
    <div className="information-lab">
      <p>
        Учебная таблица: 12 записей, заголовки A1:D1, данные A2:D13. Полный №14
        использует большой набор из примеров. Эта лаборатория проверяет расчёты
        и данные диаграммы, а не выставляет экспертный балл за файл.
      </p>
      <p>
        Цель первого расчёта:{' '}
        {mode === 'references'
          ? 'сумма баллов всех участников.'
          : 'число участников 7 класса с баллом строго больше 200.'}{' '}
        Второго: средний балл участников школы 1, включая нулевой балл.
        Диаграмма: количество участников каждого класса во всём наборе.
      </p>
      <label htmlFor={`${id}-school`}>Школа в отборе</label>
      <select
        id={`${id}-school`}
        value={school}
        onChange={(event) => {
          setSchool(Number(event.target.value));
          setChecked(false);
        }}
      >
        <option value={0}>Все школы</option>
        {[1, 2, 3].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <label htmlFor={`${id}-grade`}>Класс в отборе</label>
      <select
        id={`${id}-grade`}
        value={grade}
        onChange={(event) => {
          setGrade(Number(event.target.value));
          setChecked(false);
        }}
      >
        <option value={0}>Все классы</option>
        {[7, 8, 9].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <label htmlFor={`${id}-threshold`}>Баллы строго больше</label>
      <input
        id={`${id}-threshold`}
        type="number"
        value={drafts.threshold ?? threshold}
        min={-1}
        max={400}
        onChange={(event) => {
          const value = event.target.valueAsNumber;
          setDrafts((previous) => ({
            ...previous,
            threshold: event.target.value,
          }));
          setChecked(false);
          if (Number.isFinite(value) && value >= -1 && value <= 400) {
            setThreshold(value);
            setChecked(false);
          }
        }}
      />
      {invalidNumber && (
        <p role="alert">
          Укажи допустимые числа для отбора и сдвига; проверка и сохранение пока
          недоступны.
        </p>
      )}
      <p role="status">
        Выбрано строк: {selected.length}. Условия отбора соединены И. Отбор для
        просмотра не меняет диапазоны введённых формул.
      </p>
      <div
        className="lab-table-scroll lab-table-wide"
        role="region"
        tabIndex={0}
        aria-label="Учебные ячейки A1:D13"
      >
        <table>
          <caption>
            Адреса и значения; отобранные строки отмечены текстом
          </caption>
          <thead>
            <tr>
              <th scope="col">Строка</th>
              {['A', 'B', 'C', 'D'].map((col) => (
                <th key={col} scope="col">
                  {col}
                </th>
              ))}
              <th scope="col">Отбор</th>
            </tr>
          </thead>
          <tbody>
            {labRows.map((row, index) => (
              <tr
                key={index}
                data-current={index > 0 && selected.includes(row)}
              >
                <th scope="row">{index + 1}</th>
                {row.map((cell, col) => (
                  <td key={col}>{cell}</td>
                ))}
                <td>
                  {index === 0
                    ? 'Заголовок'
                    : selected.includes(row)
                      ? 'Выбрана'
                      : 'Не выбрана'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label htmlFor={`${id}-first`}>Формула первого расчёта</label>
      <input
        id={`${id}-first`}
        value={first}
        maxLength={240}
        spellCheck={false}
        onChange={(event) => {
          setFirst(event.target.value);
          setChecked(false);
        }}
      />
      <label htmlFor={`${id}-second`}>Формула среднего</label>
      <input
        id={`${id}-second`}
        value={second}
        maxLength={240}
        spellCheck={false}
        onChange={(event) => {
          setSecond(event.target.value);
          setChecked(false);
        }}
      />
      {formulaError ? (
        <p role="alert">{formulaError}</p>
      ) : (
        <p role="status">
          Первый результат: {one}. Второй результат:{' '}
          {two?.toLocaleString('ru', { maximumFractionDigits: 6 })}. Для
          проверки сравнивается значение, а не единственная запись формулы.
        </p>
      )}
      <details open={mode === 'references'}>
        <summary>Копирование относительных и абсолютных ссылок</summary>
        <label htmlFor={`${id}-copy`}>Формула для копирования</label>
        <input
          id={`${id}-copy`}
          value={copy}
          maxLength={240}
          spellCheck={false}
          onChange={(event) => {
            setCopy(event.target.value);
          }}
        />
        {(
          [
            ['По столбцам', shiftX, setShiftX],
            ['По строкам', shiftY, setShiftY],
          ] as const
        ).map(([label, value, setter]) => (
          <label key={label}>
            {label}
            <input
              type="number"
              value={drafts[label] ?? value}
              min={-100}
              max={100}
              onChange={(event) => {
                const value = event.target.valueAsNumber,
                  raw = event.target.value;
                setDrafts((previous) => ({ ...previous, [label]: raw }));
                setChecked(false);
                if (Number.isInteger(value) && Math.abs(value) <= 100)
                  setter(value);
              }}
            />
          </label>
        ))}
        {copyError ? (
          <p role="alert">{copyError}</p>
        ) : (
          <p role="status">
            После копирования: <code className="lab-path">{copied}</code>. Знак
            $ закрепляет следующую за ним часть адреса.
          </p>
        )}
      </details>
      <label htmlFor={`${id}-chart`}>Источник диаграммы</label>
      <select
        id={`${id}-chart`}
        value={chartSource}
        onChange={(event) => {
          setChartSource(event.target.value);
          setChecked(false);
        }}
      >
        <option value="all">Все записи A2:D13</option>
        <option value="selected">Только строки текущего отбора</option>
      </select>
      <label>
        <input
          type="checkbox"
          checked={legend}
          onChange={(event) => {
            setLegend(event.target.checked);
            setChecked(false);
          }}
        />{' '}
        Легенда на диаграмме
      </label>
      <label>
        <input
          type="checkbox"
          checked={labels}
          onChange={(event) => {
            setLabels(event.target.checked);
            setChecked(false);
          }}
        />{' '}
        Числовые подписи секторов
      </label>
      <OfficePie
        id={`${id}-pie`}
        values={counts}
        legend={legend}
        labels={labels}
      />
      <table>
        <caption>Численности выбранного источника диаграммы</caption>
        <thead>
          <tr>
            <th scope="col">Класс</th>
            <th scope="col">Количество</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((count, index) => (
            <tr key={index}>
              <th scope="row">{index + 7}</th>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="button button-dark"
        disabled={Boolean(formulaError) || invalidNumber}
        onClick={() => {
          setChecked(true);
        }}
      >
        Проверить расчёты и диаграмму
      </button>
      <div role="status">
        {checked && (
          <>
            <p>
              {one === correctFirst &&
              Math.abs((two ?? Infinity) - correctSecond) < 1e-8 &&
              legend &&
              labels &&
              counts.every((count, index) => count === allCounts[index])
                ? 'Верно: учебные значения и диаграмма соответствуют цели.'
                : 'Проверь результаты и источник диаграммы.'}{' '}
              Это не проверка всего файла №14.
            </p>
            <ul>
              <li>
                Первый расчёт:{' '}
                {one === correctFirst
                  ? 'совпало'
                  : 'проверь диапазон и строгость условия'}
                .
              </li>
              <li>
                Среднее:{' '}
                {Math.abs((two ?? Infinity) - correctSecond) < 1e-8
                  ? 'совпало'
                  : 'сумма и количество должны относиться к школе 1; ноль учитывается'}
                .
              </li>
              <li>
                Диаграмма:{' '}
                {legend &&
                labels &&
                counts.every((count, index) => count === allCounts[index])
                  ? 'совпало'
                  : 'нужны численности всех трёх классов, легенда и значения'}
                .
              </li>
            </ul>
          </>
        )}
      </div>
      <OfficeDownload
        name="lab-table.ods"
        disabled={Boolean(formulaError) || invalidNumber}
        create={async () => {
          const { exportSheet } =
            await import('../lib/interactives/office-export');
          return exportSheet({ first, second, chartRows, legend, labels });
        }}
      />
      <p>
        Поддерживаются арифметика, скобки, адреса, диапазоны до 200 ячеек,
        SUM/COUNT/AVERAGE/MIN/MAX/ROUND/COUNTIF/COUNTIFS/SUMIF/AVERAGEIF и
        русские имена этих функций; аргументы разделяются ;. В критериях нет
        подстановок. Внешние ссылки, макросы, другие листы и вычисляемые ячейки
        вне A1:D13 не поддерживаются. Это ограниченный учебный язык, не весь
        Calc.
      </p>
    </div>
  );
}
