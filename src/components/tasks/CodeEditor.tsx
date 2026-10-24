import { useEffect, useId, useRef } from 'react';

export default function CodeEditor({
  value,
  onChange,
  language,
  disabled = false,
  maxLength = 32000,
}: {
  value: string;
  onChange: (value: string) => void;
  language: 'robot' | 'python';
  disabled?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const url = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  return (
    <div className="code-editor">
      <label htmlFor={id}>
        {language === 'python' ? 'Код Python' : 'Программа Робота'}
      </label>
      <p id={`${id}-help`}>
        Текстовый редактор. Tab переводит фокус к следующему элементу; для
        отступа используй пробелы. До {maxLength.toLocaleString('ru-RU')}{' '}
        символов.
      </p>
      <textarea
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        disabled={disabled}
        maxLength={maxLength}
        rows={12}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby={`${id}-help`}
      />
      <button
        className="button button-light"
        type="button"
        onClick={() => {
          if (url.current) URL.revokeObjectURL(url.current);
          url.current = URL.createObjectURL(
            new Blob([value], { type: 'text/plain;charset=utf-8' }),
          );
          const download = document.createElement('a');
          download.href = url.current;
          download.download =
            language === 'python' ? 'answer.py' : 'answer.txt';
          download.click();
        }}
      >
        Скачать свой код
      </button>
    </div>
  );
}
