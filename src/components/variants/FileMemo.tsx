import { fileMemo } from '../../core/variants/file-memo';
import { useState } from 'react';
import { useHydrated } from '../useHydrated';
import { Button } from '../ui/Button';
import { printDocument } from '../../lib/print-document';

export default function FileMemo() {
  const ready = useHydrated();
  const [error, setError] = useState('');
  return (
    <section className="file-memo" aria-label="Памятка о файлах">
      <h1 className="print-heading">Памятка о файлах</h1>
      <h3>Как работать с файлами</h3>
      <div className="print-actions">
        <Button
          variant="secondary"
          disabled={!ready}
          onClick={(event) => {
            const selection =
              event.currentTarget.closest<HTMLElement>('.file-memo');
            if (!selection) throw new Error('Не найдена памятка о файлах.');
            try {
              setError('');
              printDocument({ trigger: event.currentTarget, selection });
            } catch {
              setError(
                'Не удалось открыть печать. Используй меню печати браузера.',
              );
            }
          }}
        >
          Распечатать памятку о файлах
        </Button>
        {error && <p role="alert">{error}</p>}
      </div>
      <p>{fileMemo.introduction}</p>
      <ol>
        {fileMemo.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div
        className="file-formats-scroll"
        role="region"
        aria-label="Форматы исходников и результатов"
        tabIndex={0}
      >
        <table>
          <caption>Исходники и результаты работ</caption>
          <thead>
            <tr>
              <th scope="col">Задание</th>
              <th scope="col">Что открыть</th>
              <th scope="col">Что сохранить</th>
            </tr>
          </thead>
          <tbody>
            {fileMemo.formats.map((row) => (
              <tr key={row.task}>
                <th scope="row">{row.task}</th>
                <td>{row.input}</td>
                <td>{row.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{fileMemo.limits}</p>
      <p>{fileMemo.integrity}</p>
    </section>
  );
}
