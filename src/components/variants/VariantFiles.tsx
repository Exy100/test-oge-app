import { useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import type { Dataset } from '../../core/datasets';
import { fixedVariants } from '../../core/variants/catalog';
import { variantPrintHref } from '../../lib/variant-links';
import type { ExamIdentity } from './VariantExam';
import FileMemo from './FileMemo';
import { Button } from '../ui/Button';
import { useHydrated } from '../useHydrated';
import '../../styles/variant-files.css';

// Keep Firefox from restoring an enabled button before hydration on reload.
const reloadAttributes: ButtonHTMLAttributes<HTMLButtonElement> & {
  autoComplete: 'off';
} = { autoComplete: 'off' };

export default function VariantFiles({ variantId, seed }: ExamIdentity) {
  const ready = useHydrated();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [links, setLinks] = useState<{ zip: string; manifest: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState('');
  const alive = useRef(false);
  const id = useId();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!links) return;
    return () => {
      URL.revokeObjectURL(links.zip);
      URL.revokeObjectURL(links.manifest);
    };
  }, [links]);
  async function prepare() {
    setBusy(true);
    setError('');
    try {
      const [
        { createVariantSourceDataset },
        { buildFixedVariant, buildVariant },
      ] = await Promise.all([
        import('../../core/variants/source-dataset'),
        import('../../core/variants'),
      ]);
      const variant = fixedVariants.some((row) => row.id === variantId)
        ? buildFixedVariant(variantId)
        : buildVariant(seed);
      const next = await createVariantSourceDataset(variant);
      if (!alive.current) return;
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
    } catch {
      if (alive.current)
        setError(
          'Не удалось подготовить комплект. Повтори попытку или скачай исходники из нужного задания.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function verify(file: File) {
    setBusy(true);
    setVerification('');
    setError('');
    try {
      const [{ verifyArchive }, { limits }] = await Promise.all([
        import('../../core/datasets'),
        import('../../core/datasets/zip'),
      ]);
      if (file.size > limits.archive)
        throw new Error(
          'Архив больше 10 МиБ. Выбери исходный ZIP этого варианта.',
        );
      if (!dataset) return;
      await verifyArchive(
        dataset.manifest,
        new Uint8Array(await file.arrayBuffer()),
      );
      if (alive.current)
        setVerification(
          'Комплект совпадает: состав, размеры и SHA-256 всех файлов проверены.',
        );
    } catch (cause: unknown) {
      if (alive.current)
        setError(
          `Комплект не прошёл проверку. ${cause instanceof Error ? cause.message : 'Не удалось прочитать ZIP.'} Скачай исходный комплект ещё раз.`,
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <details className="variant-files">
      <summary>
        <h2>Файлы и памятка</h2>
      </summary>
      <div className="variant-files-body">
        <p>
          Один комплект: исходники №11–14, обе работы №13 и условия всех 16
          номеров. Ответов, решений и эталонов в нём нет.
        </p>
        {!dataset && (
          <Button
            {...reloadAttributes}
            variant="secondary"
            disabled={busy || !ready}
            onClick={() => {
              void prepare();
            }}
          >
            {busy ? 'Готовим комплект…' : 'Подготовить комплект варианта'}
          </Button>
        )}
        {links && (
          <>
            <p className="task-actions">
              <a href={links.zip} download="oge-sources.zip">
                Скачать комплект ZIP
              </a>
              <a href={links.manifest} download="oge-sources.manifest.json">
                Скачать манифест
              </a>
            </p>
            <p role="status">
              Комплект готов. Прочитай README.txt после распаковки.
            </p>
            <label htmlFor={id}>Проверить скачанный комплект ZIP</label>
            <input
              id={id}
              type="file"
              accept=".zip,application/zip"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void verify(file);
              }}
            />
          </>
        )}
        {busy && dataset && <p role="status">Проверяем архив…</p>}
        {verification && <p role="status">{verification}</p>}
        {error && <p role="alert">{error}</p>}
        <p>
          <a
            href={variantPrintHref({ variantId, seed })}
            target="_blank"
            rel="noopener"
          >
            Условия и памятка для печати (новая вкладка)
          </a>
        </p>
        <FileMemo />
      </div>
    </details>
  );
}
