import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  folders,
  searchTrainingFiles,
} from '../lib/interactives/training-files';
import TrainingFileControls from '../components/lessons/TrainingFileControls';
export default function TextFileSearch({ id, parameters }: InteractiveProps) {
  const initial = parameters.folder ?? 'Тексты/Нина';
  if (typeof initial !== 'string' || !folders.includes(initial))
    throw new RangeError('Неизвестный каталог.');
  const [folder, setFolder] = useState(initial),
    [query, setQuery] = useState('полезный труд'),
    [wholeWord, setWholeWord] = useState(false),
    [answer, setAnswer] = useState(''),
    [checked, setChecked] = useState(false);
  let hits: ReturnType<typeof searchTrainingFiles> = [],
    error = '';
  try {
    hits = searchTrainingFiles(folder, query, wholeWord);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь запрос.';
  }
  return (
    <div className="information-lab">
      <TrainingFileControls id={id} folder={folder} onFolder={setFolder} />
      <p>
        Задача по контексту: у автора Нина герой Мирон починил компас после
        дождя. Какова фамилия человека, назвавшего это полезным трудом? Найди
        реплику и прочитай соседние абзацы.
      </p>
      <label htmlFor={`${id}-query`}>Текст для поиска внутри файлов</label>
      <input
        id={`${id}-query`}
        maxLength={80}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <label>
        <input
          type="checkbox"
          checked={wholeWord}
          onChange={(event) => {
            setWholeWord(event.target.checked);
          }}
        />{' '}
        Только целое слово или фраза
      </label>
      <p>
        Поиск без учёта регистра, с вложенными папками; е и ё различаются.
        Совпадение имени файла не ищется. Целое слово ограничено буквами,
        цифрами и подчёркиванием.
      </p>
      {error && <p role="alert">{error}</p>}
      <p role="status">
        {!error &&
          `Найдено файлов: ${String(hits.length)}; совпадений: ${String(hits.reduce((sum, hit) => sum + hit.positions.length, 0))}. Совпадение — подсказка, ответ требует проверки автора и героя.`}
      </p>
      {hits.map(({ file, positions, length }) => (
        <article key={file.path}>
          <h3 className="lab-path">{file.path}</h3>
          <p>
            Совпадений: {positions.length}. Показан весь текст учебного файла.
          </p>
          <pre
            className="lab-file-preview"
            tabIndex={0}
            role="region"
            aria-label={`Текст ${file.path}`}
          >
            {positions.map((position, index) => (
              <span key={position}>
                {file.text.slice(
                  index === 0 ? 0 : (positions[index - 1] ?? 0) + length,
                  position,
                )}
                <mark>{file.text.slice(position, position + length)}</mark>
              </span>
            ))}
            {file.text.slice((positions.at(-1) ?? 0) + length)}
          </pre>
        </article>
      ))}
      <label htmlFor={`${id}-answer`}>Фамилия по контексту</label>
      <input
        id={`${id}-answer`}
        value={answer}
        maxLength={80}
        onChange={(event) => {
          setAnswer(event.target.value);
          setChecked(false);
        }}
      />
      <button
        type="button"
        className="button button-dark"
        onClick={() => {
          setChecked(true);
        }}
      >
        Проверить контекст
      </button>
      <p role="status">
        {checked
          ? answer.trim().toLocaleLowerCase('ru') === 'орлов'
            ? 'Верно: Орлов. Автор Нина, герой Мирон и событие совпадают; профессия названа в предыдущем абзаце.'
            : 'Пока неверно. Сверь автора, героя и событие; фамилия названа перед репликой. Дымок и Туман относятся к другим рассказам.'
          : ''}
      </p>
    </div>
  );
}
