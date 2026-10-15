import { useEffect, useId, useState } from 'react';
import type { Dataset } from '../core/datasets';
import type { TaskInstance } from '../core/types';
import { createTaskDataset } from '../core/generators/task-dataset';

export default function TaskFiles({ task }: { task: TaskInstance }) {
  const id = useId();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [links, setLinks] = useState<{ zip: string; manifest: string } | null>(
    null,
  );
  const [path, setPath] = useState('README.txt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!dataset) return;
    const zip = URL.createObjectURL(
      new Blob([Uint8Array.from(dataset.archive)], { type: 'application/zip' }),
    );
    const manifest = URL.createObjectURL(
      new Blob([JSON.stringify(dataset.manifest, null, 2) + '\n'], {
        type: 'application/json',
      }),
    );
    setLinks({ zip, manifest });
    return () => {
      URL.revokeObjectURL(zip);
      URL.revokeObjectURL(manifest);
    };
  }, [dataset]);
  const bytes = dataset?.files.get(path);
  return (
    <div className="task-files">
      <h3>Файлы задания</h3>
      {!dataset && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            void createTaskDataset(task)
              .then(setDataset)
              .catch((cause: unknown) => {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Не удалось подготовить файлы.',
                );
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {busy ? 'Подготовка файлов…' : 'Подготовить файлы'}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {dataset && (
        <>
          <p>{dataset.manifest.files.length} файлов · UTF-8 · CC0-1.0</p>
          {links && (
            <p>
              <a href={links.zip} download={`${task.subtype}.zip`}>
                Скачать ZIP
              </a>
              {' · '}
              <a
                href={links.manifest}
                download={`${task.subtype}-manifest.json`}
              >
                Скачать манифест
              </a>
            </p>
          )}
          <label htmlFor={id}>Файл для просмотра</label>
          <select
            id={id}
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
            }}
          >
            {dataset.manifest.files.map((file) => (
              <option key={file.path} value={file.path}>
                {file.path} ({file.size} байт)
              </option>
            ))}
          </select>
          <pre className="task-file-preview">
            {bytes
              ? /\.(?:ods|odt|odp|png)$/u.test(path)
                ? path.endsWith('.png')
                  ? 'Изображение поля находится в ZIP. Скачай и открой его в просмотрщике изображений.'
                  : 'Офисный файл. Скачай ZIP и открой файл в LibreOffice.'
                : new TextDecoder().decode(bytes)
              : ''}
          </pre>
        </>
      )}
    </div>
  );
}
