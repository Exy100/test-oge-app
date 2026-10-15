import { useEffect, useState } from 'react';
import { useHydrated } from '../components/useHydrated';
import type { Variant } from '../core/types';
import {
  buildFixedVariant,
  buildVariant,
  fixedVariants,
  selectedVariant13,
  variant13Alternatives,
  variantSeed,
  type Variant13Choice,
} from '../core/variants';
import { createVariantDataset } from '../core/variants/dataset';
import RichText from '../components/RichText';

export default function VariantGallery() {
  const ready = useHydrated();
  const [id, setId] = useState('V01'),
    [selection, setSelection] = useState<Variant13Choice>('presentation'),
    [seed, setSeed] = useState('review');
  const [variant, setVariant] = useState<Variant | null>(null),
    [link, setLink] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // The link is created with the archive; the effect only releases replaced ones.
  useEffect(() => {
    if (!link) return;
    return () => {
      URL.revokeObjectURL(link);
    };
  }, [link]);
  const assemble = (fixed: boolean) => {
    setError('');
    setLink(null);
    try {
      setVariant(
        fixed
          ? buildFixedVariant(id, selection)
          : buildVariant(seed, selection),
      );
    } catch (cause) {
      setVariant(null);
      setError(
        cause instanceof Error ? cause.message : 'Не удалось собрать вариант.',
      );
    }
  };
  const alternatives = variant
    ? variant13Alternatives(variantSeed(variant))
    : null;
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          assemble(true);
        }}
      >
        <fieldset disabled={!ready || busy}>
          <legend>Параметры варианта</legend>
          <label>
            Фиксированный вариант
            <select
              value={id}
              onChange={(event) => {
                setId(event.target.value);
              }}
            >
              {fixedVariants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Работа №13
            <select
              value={selection}
              onChange={(event) => {
                setSelection(event.target.value as Variant13Choice);
              }}
            >
              <option value="presentation">13.1 Презентация</option>
              <option value="document">13.2 Документ</option>
            </select>
          </label>
          <button className="button button-dark" type="submit">
            Собрать фиксированный
          </button>
          <label>
            Seed
            <input
              maxLength={200}
              value={seed}
              onChange={(event) => {
                setSeed(event.target.value);
              }}
            />
          </label>
          <button
            className="button button-light"
            type="button"
            onClick={() => {
              assemble(false);
            }}
          >
            Собрать по seed
          </button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-label="Состав варианта">
        {variant
          ? `${variant.kind === 'fixed' ? variant.id : 'Вариант по seed'}: 16 заданий, максимум 21 балл. Выбрана работа №${selectedVariant13(variant) === 'presentation' ? '13.1' : '13.2'}.`
          : 'Собери вариант для проверки.'}
      </p>
      {variant && (
        <>
          <p>
            Seed: <code>{variantSeed(variant)}</code>
          </p>
          <p>
            Комплект для разбора содержит обе альтернативы №13, решения и
            эталоны.
          </p>
          <button
            className="button button-dark"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              void createVariantDataset(variant)
                .then((next) => {
                  setLink(
                    URL.createObjectURL(
                      new Blob([Uint8Array.from(next.archive)], {
                        type: 'application/zip',
                      }),
                    ),
                  );
                })
                .catch((cause: unknown) => {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Не удалось подготовить комплект.',
                  );
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            {busy
              ? 'Подготовка комплекта…'
              : 'Подготовить комплект для разбора'}
          </button>
          {link && (
            <p>
              <a
                href={link}
                download={`${variant.kind === 'fixed' ? variant.id : 'variant'}-review.zip`}
              >
                Скачать комплект ZIP
              </a>
            </p>
          )}
          {variant.tasks.map((task) => (
            <article className="variant-task" key={task.id}>
              <h2>Задание №{task.taskNumber}</h2>
              {task.taskNumber === 13 && alternatives ? (
                <>
                  <h3>
                    13.1 Презентация
                    {selectedVariant13(variant) === 'presentation'
                      ? ' — выбрана'
                      : ''}
                  </h3>
                  <RichText source={alternatives.presentation.statement} />
                  <h3>
                    13.2 Документ
                    {selectedVariant13(variant) === 'document'
                      ? ' — выбран'
                      : ''}
                  </h3>
                  <RichText source={alternatives.document.statement} />
                </>
              ) : (
                <RichText source={task.statement} />
              )}
            </article>
          ))}
        </>
      )}
    </>
  );
}
