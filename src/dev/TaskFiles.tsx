import { useEffect, useId, useState } from 'react';
import type { Dataset } from '../core/datasets';
import type { TaskInstance } from '../core/types';
import { createTaskDataset } from '../core/generators/task-dataset';
import { readHtm } from '../core/datasets/htm';

export default function TaskFiles({ task }: { task: TaskInstance }) {
  const id = useId();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [links, setLinks] = useState<{ zip: string; manifest: string } | null>(
    null,
  );
  const [path, setPath] = useState('README.txt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Links are created with the dataset; the effect only releases replaced ones.
  useEffect(() => {
    if (!links) return;
    return () => {
      URL.revokeObjectURL(links.zip);
      URL.revokeObjectURL(links.manifest);
    };
  }, [links]);
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
              .then((next) => {
                setDataset(next);
                setLinks({
                  zip: URL.createObjectURL(
                    new Blob([Uint8Array.from(next.archive)], {
                      type: 'application/zip',
                    }),
                  ),
                  manifest: URL.createObjectURL(
                    new Blob([JSON.stringify(next.manifest, null, 2) + '\n'], {
                      type: 'application/json',
                    }),
                  ),
                });
              })
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
          <p>{dataset.manifest.files.length} файлов · CC0-1.0</p>
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
              ? /\.(?:ods|odt|odp|png|tiff|jpeg|pdf)$/u.test(path)
                ? /\.(?:png|tiff|jpeg)$/u.test(path)
                  ? 'Изображение находится в ZIP. Скачай и открой его в просмотрщике изображений.'
                  : path.endsWith('.pdf')
                    ? 'Документ PDF находится в ZIP. Скачай и открой его в программе чтения PDF.'
                    : 'Офисный файл. Скачай ZIP и открой файл в LibreOffice.'
                : path.endsWith('.htm')
                  ? readHtm(bytes)
                      .blocks.map(({ text }) => text)
                      .join('\n\n')
                  : new TextDecoder().decode(bytes)
              : ''}
          </pre>
        </>
      )}
    </div>
  );
}
