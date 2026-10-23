import { useEffect, useRef, useState } from 'react';
export default function OfficeDownload({
  create,
  name,
  disabled = false,
}: {
  create: () => Promise<Uint8Array>;
  name: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const mounted = useRef(false),
    url = useRef<string | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  return (
    <div>
      <button
        type="button"
        className="button button-light"
        disabled={busy || disabled}
        onClick={() => {
          setBusy(true);
          setError('');
          void create()
            .then((bytes) => {
              if (!mounted.current) return;
              if (url.current) URL.revokeObjectURL(url.current);
              url.current = URL.createObjectURL(
                new Blob([Uint8Array.from(bytes)], {
                  type: 'application/octet-stream',
                }),
              );
              const link = document.createElement('a');
              link.href = url.current;
              link.download = name;
              link.hidden = true;
              document.body.append(link);
              link.click();
              link.remove();
            })
            .catch((cause: unknown) => {
              if (mounted.current)
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Не удалось создать файл.',
                );
            })
            .finally(() => {
              if (mounted.current) setBusy(false);
            });
        }}
      >
        {busy
          ? 'Подготовка файла…'
          : `Скачать текущий ${name.split('.').at(-1)?.toUpperCase() ?? 'файл'}`}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
