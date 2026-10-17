import { useMemo, useState } from 'react';
import {
  programCases,
  programParameters,
  type ProgramKind,
} from '../../core/generators/16/problems';
import CodeEditor from './CodeEditor';

export default function PythonPractice({
  kind,
  seed,
}: {
  kind: ProgramKind;
  seed: string;
}) {
  const [code, setCode] = useState('');
  const cases = useMemo(
    () => programCases(programParameters(kind, seed), seed),
    [kind, seed],
  );
  const [index, setIndex] = useState(0);
  const example = cases[index];
  return (
    <section aria-label="Практика Python">
      <h3>Напиши и проверь программу</h3>
      <CodeEditor value={code} onChange={setCode} language="python" />
      <p>
        Скачай свой код и набор файлов задания, распакуй ZIP. Python выполняется
        на твоём компьютере. Сохрани answer.py рядом с check.py и запусти в
        терминале:
      </p>
      <pre tabIndex={0} role="region" aria-label="Команда запуска Python">
        <code>python3 check.py answer.py</code>
      </pre>
      <p>
        В Windows можно использовать «py check.py answer.py». Нужен Python 3.
        Проверяющий файл запускает твою программу на тестах; результат учебный.
        Балл выбирай по критериям.
      </p>
      <label>
        Пример ввода и вывода
        <select
          value={index}
          onChange={(event) => {
            setIndex(Number(event.target.value));
          }}
        >
          {cases.map((item, position) => (
            <option key={item.id} value={position}>
              {position + 1}. {item.label}
            </option>
          ))}
        </select>
      </label>
      {example && (
        <div className="program-example">
          <div>
            <h4>Ввод</h4>
            <pre tabIndex={0} role="region" aria-label="Входные данные">
              {example.input}
            </pre>
          </div>
          <div>
            <h4>Ожидаемый вывод</h4>
            <pre tabIndex={0} role="region" aria-label="Ожидаемый результат">
              {example.output}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
