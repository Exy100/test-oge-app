import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  folders,
  trainingFiles,
  selectTrainingFiles,
} from '../lib/interactives/training-files';
import TrainingFileControls from '../components/lessons/TrainingFileControls';
function Branch({ folder }: { folder: string }) {
  const prefix = folder ? folder + '/' : '';
  return (
    <ul>
      {folders
        .filter(
          (path) =>
            path &&
            path.startsWith(prefix) &&
            !path.slice(prefix.length).includes('/'),
        )
        .map((path) => (
          <li key={path}>
            <details open>
              <summary>Папка: {path.split('/').at(-1)}</summary>
              <Branch folder={path} />
            </details>
          </li>
        ))}
      {trainingFiles
        .filter(
          ({ path }) =>
            path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
        )
        .map(({ path }) => (
          <li key={path}>Файл: {path.split('/').at(-1)}</li>
        ))}
    </ul>
  );
}
export default function FileTree({ id, parameters }: InteractiveProps) {
  const initial = parameters.folder ?? 'Тексты/Нина';
  if (typeof initial !== 'string' || !folders.includes(initial))
    throw new RangeError('Неизвестный каталог.');
  const [folder, setFolder] = useState(initial),
    [recursive, setRecursive] = useState(false),
    [answer, setAnswer] = useState(''),
    [checked, setChecked] = useState(false);
  const selection = selectTrainingFiles(folder, recursive, '*');
  return (
    <div className="information-lab">
      <h3>Дерево набора</h3>
      <p>
        Раскрывай папки клавишами Tab и Enter. Одинаковое имя в разных папках
        обозначает разные файлы.
      </p>
      <div className="lab-file-tree">
        <Branch folder="" />
      </div>
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
      <p>
        Соседний каталог Тексты-архив не входит в Тексты. Корень набора здесь
        обозначается пустым путём, а разделитель папок — /.
      </p>
      <label htmlFor={`${id}-answer`}>
        Сколько файлов в выбранной области?
      </label>
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
        Проверить область
      </button>
      <p role="status">
        {checked
          ? /^\d+$/u.test(answer.trim()) &&
            Number(answer) === selection.files.length
            ? `Верно. Файлов в области: ${String(selection.files.length)}. Считаем полные пути, а не папки.`
            : 'Пока неверно. Проверь границу каталога и флажок вложенных папок.'
          : ''}
      </p>
      <details>
        <summary>Показать полные пути выбранных файлов</summary>
        <ul>
          {selection.files.map(({ path }) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
        {selection.files.length === 0 && <p>В этой области файлов нет.</p>}
      </details>
    </div>
  );
}
