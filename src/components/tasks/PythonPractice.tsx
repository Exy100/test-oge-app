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
  mode = 'practice',
  value,
  onChange,
  maxLength,
}: {
  kind: ProgramKind;
  seed: string;
  mode?: 'practice' | 'exam';
  value?: string;
  onChange?: (code: string) => void;
  maxLength?: number;
}) {
  const [localCode, setLocalCode] = useState('');
  const code = value ?? localCode;
  const cases = useMemo(() => {
    const examples = programCases(programParameters(kind, seed), seed);
    return mode === 'exam' ? examples.slice(0, 1) : examples;
  }, [kind, seed, mode]);
  const [index, setIndex] = useState(0);
  const example = cases[index];
  return (
    <section aria-label="Практика Python">
      <h3>Напиши и проверь программу</h3>
      <CodeEditor
        value={code}
        onChange={onChange ?? setLocalCode}
        language="python"
        maxLength={maxLength ?? (mode === 'exam' ? 20000 : 32000)}
      />
      {mode === 'exam' ? (
        <>
          <p>
            Скачай свой код как answer.py в UTF-8. Открой терминал в папке с
            файлом и запусти Python 3:
          </p>
          <pre tabIndex={0} role="region" aria-label="Команда запуска Python">
            <code>python3 answer.py</code>
          </pre>
          <p>
            В Windows: «py -3 answer.py». Введи строки примера ниже, нажимая
            Enter после каждой строки, и сравни вывод. В среде разработки открой
            answer.py и используй её команду запуска. Python выполняется на
            твоём компьютере. Здесь доступен только пример из условия; остальные
            тесты и эталон откроются после завершения экзамена.
          </p>
        </>
      ) : (
        <>
          <p>
            Скачай свой код и набор файлов задания, распакуй ZIP. Python
            выполняется на твоём компьютере. Сохрани answer.py рядом с check.py
            и запусти в терминале:
          </p>
          <pre tabIndex={0} role="region" aria-label="Команда запуска Python">
            <code>python3 check.py answer.py</code>
          </pre>
          <p>
            В Windows можно использовать «py check.py answer.py». Нужен Python
            3. Проверяющий файл запускает твою программу на тестах; результат
            учебный. Балл выбирай по критериям.
          </p>
        </>
      )}
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
