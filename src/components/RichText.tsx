import { useEffect, useRef, useState } from 'react';
import { renderRichText } from '../core/rich-text/render';
import '../styles/rich-text.css';

export default function RichText({ source }: { source: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setReady(true);
  }, []);
  async function copyCode() {
    const blocks = root.current?.querySelectorAll('pre code');
    if (!blocks?.length) return;
    try {
      await navigator.clipboard.writeText(
        Array.from(blocks, (block) => block.textContent).join('\n\n'),
      );
      setNotice('Код скопирован.');
    } catch {
      setNotice('Не удалось скопировать. Выдели код и скопируй его вручную.');
    }
  }
  const html = renderRichText(source);
  return (
    <div className="rich-text-container">
      <div
        ref={root}
        className="rich-text"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {html.includes('<pre>') && (
        <button
          type="button"
          className="rich-text-copy"
          disabled={!ready}
          onClick={() => {
            void copyCode();
          }}
        >
          Скопировать код
        </button>
      )}
      <p className="rich-text-notice" role="status">
        {notice}
      </p>
    </div>
  );
}
