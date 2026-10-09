import { useEffect, useRef, useState } from 'react';
import { browserCache, browserStore } from '../core/storage/browser';
import {
  defaults,
  parseBackup,
  MAX_BACKUP_BYTES,
} from '../core/storage/schemas';
import type { Area, Areas, Backup } from '../core/storage/schemas';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

export default function Settings() {
  const [data, setData] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Backup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reading, setReading] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const store = browserStore();
    setData(store.snapshot());
    setReady(true);
    return store.subscribe(() => {
      setData(store.snapshot());
    });
  }, []);
  function save<K extends Area>(area: K, value: Areas[K]) {
    setError('');
    try {
      browserStore().write(area, value);
      setMessage(
        browserStore().memoryOnly
          ? 'Настройки применены для этой страницы.'
          : 'Настройки сохранены.',
      );
    } catch {
      setMessage('');
      setError(
        'Изменение превышает допустимый объём данных. Сначала экспортируй данные и освободи место.',
      );
    }
  }
  function change(settings: Areas['settings']) {
    save('settings', settings);
  }
  function exportData() {
    const backup: Backup = {
      format: 'oge-informatics',
      version: 1,
      areas: browserStore().snapshot(),
      aiCache: browserCache().snapshot(),
    };
    const text = JSON.stringify(backup);
    if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
      setError('Данные превышают 2 МБ. Экспорт не создан.');
      return;
    }
    const url = URL.createObjectURL(
      new Blob([text], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'oge-informatics-backup.json';
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    setMessage('Файл экспорта подготовлен. Храни его у себя.');
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setMessage('');
    setReading(true);
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error('Файл слишком большой. Максимум — 2 МБ.');
      setPending(parseBackup(await file.text()));
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : 'Не удалось прочитать файл.',
      );
    } finally {
      setReading(false);
      if (importInput.current) importInput.current.value = '';
    }
  }
  return (
    <div className="settings-panel" aria-busy={!ready}>
      <fieldset disabled={!ready}>
        <legend>Оформление</legend>
        <label htmlFor="settings-theme">Тема оформления</label>
        <select
          id="settings-theme"
          value={data.settings.theme}
          onChange={(event) => {
            const theme = event.target.value;
            if (theme === 'system' || theme === 'light' || theme === 'dark')
              change({ ...data.settings, theme });
          }}
        >
          <option value="system">Системная</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
        </select>
        <label htmlFor="settings-font">Размер шрифта</label>
        <select
          id="settings-font"
          value={data.settings.fontSize}
          onChange={(event) => {
            const fontSize = Number(event.target.value);
            if (
              fontSize === 100 ||
              fontSize === 125 ||
              fontSize === 150 ||
              fontSize === 200
            )
              change({ ...data.settings, fontSize });
          }}
        >
          {[100, 125, 150, 200].map((size) => (
            <option key={size} value={size}>
              {size}%
            </option>
          ))}
        </select>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={data.settings.animations}
            onChange={(event) => {
              change({ ...data.settings, animations: event.target.checked });
            }}
          />
          Анимации
        </label>
        <p>
          Системное уменьшение движения учитывается даже при включённых
          анимациях.
        </p>
      </fieldset>
      <fieldset disabled={!ready}>
        <legend>Разбор с ИИ</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={data.aiConsent.enabled}
            onChange={(event) => {
              save('aiConsent', {
                version: 1,
                enabled: event.target.checked,
              });
            }}
          />
          Предлагать разбор с ИИ
        </label>
        <p>
          ИИ пока не подключён. Перед первой отправкой ответа сайт назовёт
          провайдера, покажет состав данных и отдельно запросит согласие. Этот
          переключатель ничего не отправляет.
        </p>
      </fieldset>
      <section aria-labelledby="settings-data">
        <h2 id="settings-data">Твои данные</h2>
        <p>
          Экспорт включает настройки, сохранённый учебный прогресс и временный
          кэш ИИ, если они есть. Импорт заменяет текущие данные. Файлы заданий
          сюда не входят.
        </p>
        <Button disabled={!ready} onClick={exportData}>
          Экспортировать данные
        </Button>
        <label htmlFor="settings-import">Импортировать JSON, до 2 МБ</label>
        <input
          id="settings-import"
          type="file"
          accept="application/json,.json"
          ref={importInput}
          disabled={!ready || reading}
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
          }}
        />
        <Button
          ref={deleteButton}
          variant="secondary"
          disabled={!ready}
          onClick={() => {
            setDeleting(true);
          }}
        >
          Удалить все данные проекта
        </Button>
      </section>
      <p role="status">{reading ? 'Проверяю файл…' : message}</p>
      <p role="alert">{error}</p>
      <Modal
        open={pending !== null}
        title="Заменить текущие данные?"
        returnFocusRef={importInput}
        onClose={() => {
          setPending(null);
        }}
      >
        <p>
          Файл проверен. Настройки и учебные записи из файла заменят данные
          этого проекта. Сначала можно отменить действие и сделать экспорт.
        </p>
        <Button
          onClick={() => {
            if (!pending) return;
            browserCache().replace(pending.aiCache);
            browserStore().replace(pending.areas);
            setPending(null);
            setMessage(
              browserStore().memoryOnly || browserCache().memoryOnly
                ? 'Импорт выполнен в память страницы. Постоянное сохранение недоступно.'
                : 'Данные импортированы.',
            );
          }}
        >
          Заменить данные
        </Button>
        <Button
          variant="text"
          onClick={() => {
            setPending(null);
          }}
        >
          Отмена
        </Button>
      </Modal>
      <Modal
        open={deleting}
        title="Удалить данные этого проекта?"
        returnFocusRef={deleteButton}
        onClose={() => {
          setDeleting(false);
        }}
      >
        <p>
          Будут удалены настройки, учебные записи и кэш ИИ. Данные других
          проектов останутся. Вернуть удалённое можно только из ранее
          сохранённого экспорта.
        </p>
        <Button
          onClick={() => {
            const cacheCleared = browserCache().clear();
            const localCleared = browserStore().clear();
            setDeleting(false);
            setMessage(
              cacheCleared && localCleared
                ? 'Данные проекта удалены.'
                : 'Память страницы очищена, но браузер не разрешил удалить часть сохранённых данных. Удали их через настройки браузера.',
            );
          }}
        >
          Подтвердить удаление
        </Button>
        <Button
          variant="text"
          onClick={() => {
            setDeleting(false);
          }}
        >
          Отмена
        </Button>
      </Modal>
    </div>
  );
}
