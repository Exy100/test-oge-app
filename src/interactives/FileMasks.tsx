import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  folders,
  selectTrainingFiles,
} from '../lib/interactives/training-files';
import TrainingFileControls from '../components/lessons/TrainingFileControls';
export default function FileMasks({ id, parameters }: InteractiveProps) {
  const initial = parameters.folder ?? 'Данные';
  if (typeof initial !== 'string' || !folders.includes(initial))
    throw new RangeError('Неизвестный каталог.');
  const [folder, setFolder] = useState(initial),
    [recursive, setRecursive] = useState(true),
    [mask, setMask] = useState('note_?.txt'),
    [answer, setAnswer] = useState(''),
    [checked, setChecked] = useState(false);
  let selection: ReturnType<typeof selectTrainingFiles> | undefined,
    error = '';
  try {
    selection = selectTrainingFiles(folder, recursive, mask);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь маску.';
  }
  return (
    <div className="information-lab">
      <TrainingFileControls
        id={id}
        folder={folder}
        onFolder={(value) => {
          setFolder(value);
          setChecked(false);
        }}
        recursive={recursive}
        onRecursive={(value) => {
          setRecursive(value);
          setChecked(false);
        }}
      />
      <label htmlFor={`${id}-mask`}>Маска имени файла</label>
      <input
        id={`${id}-mask`}
        maxLength={80}
        spellCheck={false}
        value={mask}
        onChange={(event) => {
          setMask(event.target.value);
          setChecked(false);
        }}
      />
      <p>
        * заменяет ноль или больше знаков; ? заменяет ровно один. Сравниваем
        полное имя без пути, без учёта регистра. Поддерживаются только эти две
        подстановки; точка — обычный знак.
      </p>
      <p>
        Маски и объём — учебное расширение. В подтверждённом №12 нужно считать
        файлы перечисленных расширений в нескольких каталогах со вложениями.
      </p>
      {error && <p role="alert">{error}</p>}
      {selection && (
        <>
          <div
            className="lab-table-scroll lab-table-wide"
            role="region"
            tabIndex={0}
            aria-label="Отобранные файлы и размеры"
          >
            <table>
              <caption>Результат отбора: реальные байты UTF-8</caption>
              <thead>
                <tr>
                  <th scope="col">Полный путь</th>
                  <th scope="col">Байт</th>
                </tr>
              </thead>
              <tbody>
                {selection.files.map(({ path, text }) => (
                  <tr key={path}>
                    <td className="lab-path">{path}</td>
                    <td>{new TextEncoder().encode(text).byteLength}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p role="status">
            Файлов: {selection.files.length}. Объём: {selection.bytes} байт;{' '}
            {selection.bytes / 1024} КиБ (1 КиБ = 1024 байта). Размер архива и
            занятое место на диске здесь не используются.
          </p>
          <label htmlFor={`${id}-answer`}>Суммарный размер в байтах</label>
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
            onClick={() => {
              setChecked(true);
            }}
          >
            Проверить объём
          </button>
          <p role="status">
            {checked
              ? /^\d+$/u.test(answer.trim()) &&
                Number(answer) === selection.bytes
                ? 'Верно: сложены размеры только выбранных файлов.'
                : 'Пока неверно. Сложи байты выбранных файлов, не количество символов.'
              : ''}
          </p>
        </>
      )}
    </div>
  );
}
