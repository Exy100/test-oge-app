import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  bases,
  convert,
  numeral,
  numeralSum,
  type Base,
} from '../lib/interactives/numerals';
export default function NumeralLab({ id, parameters }: InteractiveProps) {
  const mode = parameters.mode ?? 'place';
  if (
    typeof mode !== 'string' ||
    !['place', 'convert', 'compare'].includes(mode)
  )
    throw new RangeError('Неизвестный режим разрядов.');
  const [raw, setRaw] = useState(
      mode === 'convert' ? '26' : mode === 'compare' ? 'FF' : '1011',
    ),
    [base, setBase] = useState<Base>(
      mode === 'convert' ? 10 : mode === 'compare' ? 16 : 2,
    ),
    [target, setTarget] = useState<Base>(mode === 'convert' ? 2 : 16),
    [binary, setBinary] = useState('1011'),
    [octal, setOctal] = useState('17'),
    [hex, setHex] = useState('1A'),
    [answer, setAnswer] = useState(''),
    [checked, setChecked] = useState(false),
    [other, setOther] = useState('11111111'),
    [otherBase, setOtherBase] = useState<Base>(2);
  let comparison = '';
  if (mode === 'compare') {
    try {
      const first = numeral(raw, base).value,
        second = numeral(other, otherBase).value;
      comparison = `${String(first)} ${first === second ? '=' : first < second ? '<' : '>'} ${String(second)}: сравнили десятичные значения.`;
    } catch {
      comparison = 'Для сравнения нужны две допустимые записи.';
    }
  }
  let data: ReturnType<typeof numeral> | undefined,
    converted: ReturnType<typeof convert> | undefined,
    sum: number | undefined,
    error = '',
    sumError = '';
  try {
    data = numeral(raw, base);
    converted = convert(data.value, target);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь запись.';
  }
  try {
    sum = numeralSum(binary, octal, hex);
  } catch (cause) {
    sumError = cause instanceof Error ? cause.message : 'Проверь слагаемые.';
  }
  return (
    <div className="information-lab">
      <label htmlFor={`${id}-raw`}>Исходная запись числа</label>
      <input
        id={`${id}-raw`}
        value={raw}
        maxLength={16}
        spellCheck={false}
        onChange={(event) => {
          setRaw(event.target.value);
        }}
      />
      <label htmlFor={`${id}-base`}>Основание исходной записи</label>
      <select
        id={`${id}-base`}
        value={base}
        onChange={(event) => {
          setBase(Number(event.target.value) as Base);
        }}
      >
        {bases.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <label htmlFor={`${id}-target`}>Основание результата</label>
      <select
        id={`${id}-target`}
        value={target}
        onChange={(event) => {
          setTarget(Number(event.target.value) as Base);
        }}
      >
        {bases.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <p>
        Цифры 0–9, A–F; A = 10, F = 15. Значение в пределах 0–65535. Правый
        разряд имеет номер 0.
      </p>
      {error && <p role="alert">{error}</p>}
      {data && converted && (
        <>
          <svg
            role="img"
            viewBox="0 0 360 100"
            aria-labelledby={`${id}-diagram`}
          >
            <title id={`${id}-diagram`}>
              Вес разряда растёт влево в число раз, равное основанию
            </title>
            <path
              d="M320 38 H40 M40 38 L54 28 M40 38 L54 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text x="48" y="80" fill="currentColor">
              Влево: умножаем вес на {base}
            </text>
          </svg>
          <div
            className="lab-table-scroll lab-table-wide"
            tabIndex={0}
            role="region"
            aria-label="Разряды и их вклады"
          >
            <table>
              <caption>Сумма вкладов — десятичное значение</caption>
              <thead>
                <tr>
                  <th scope="col">Цифра</th>
                  <th scope="col">Разряд</th>
                  <th scope="col">Вес</th>
                  <th scope="col">Вклад</th>
                </tr>
              </thead>
              <tbody>
                {data.terms.map((term) => (
                  <tr key={term.power}>
                    <td>
                      {'0123456789ABCDEF'[term.digit]} ({term.digit})
                    </td>
                    <td>{term.power}</td>
                    <td>{term.weight}</td>
                    <td>{term.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p role="status">
            В десятичной системе: {data.value}. В основании {target}:{' '}
            {converted.text}.
          </p>
          <details>
            <summary>Деление с остатком: прочитай остатки снизу вверх</summary>
            <ol>
              {converted.divisions.map((step, index) => (
                <li key={index}>
                  {step.dividend} : {target} = {step.quotient}, остаток{' '}
                  {step.remainder} ({'0123456789ABCDEF'[step.remainder]}).
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {mode === 'compare' && (
        <>
          <h3>Сравнение двух записей</h3>
          <label htmlFor={`${id}-other`}>Вторая запись для сравнения</label>
          <input
            id={`${id}-other`}
            value={other}
            maxLength={16}
            onChange={(event) => {
              setOther(event.target.value);
            }}
          />
          <label htmlFor={`${id}-other-base`}>Основание второй записи</label>
          <select
            id={`${id}-other-base`}
            value={otherBase}
            onChange={(event) => {
              setOtherBase(Number(event.target.value) as Base);
            }}
          >
            {bases.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <p role="status">{comparison}</p>
        </>
      )}
      <h3>Сложение в формате №10</h3>
      <p>
        Переведи каждое слагаемое в десятичную систему, затем сложи. Запиши
        только десятичное число.
      </p>
      {[
        { value: binary, setter: setBinary, label: 'Двоичное слагаемое' },
        { value: octal, setter: setOctal, label: 'Восьмеричное слагаемое' },
        { value: hex, setter: setHex, label: 'Шестнадцатеричное слагаемое' },
      ].map(({ value, setter, label }, index) => (
        <label key={index}>
          {label}
          <input
            value={value}
            maxLength={16}
            spellCheck={false}
            onChange={(event) => {
              setter(event.target.value);
              setChecked(false);
            }}
          />
        </label>
      ))}
      {sumError && <p role="alert">{sumError}</p>}
      <label htmlFor={`${id}-answer`}>Сумма в десятичной системе</label>
      <input
        id={`${id}-answer`}
        value={answer}
        inputMode="numeric"
        onChange={(event) => {
          setAnswer(event.target.value);
          setChecked(false);
        }}
      />
      <button
        type="button"
        className="button button-dark"
        disabled={sum === undefined}
        onClick={() => {
          setChecked(true);
        }}
      >
        Проверить сумму
      </button>
      <p role="status">
        {checked && sum !== undefined
          ? /^\d+$/u.test(answer.trim()) && Number(answer) === sum
            ? 'Верно: сумма найдена в десятичной системе.'
            : 'Пока неверно. Проверь вклады всех разрядов и сложи три десятичных значения.'
          : ''}
      </p>
    </div>
  );
}
