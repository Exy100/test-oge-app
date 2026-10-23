import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  PAGE,
  slideSet,
  slideInitial,
  slideTarget,
  slideChecks,
  updateFrame,
} from '../lib/interactives/slide-layout';
import OfficeDownload from '../components/lessons/OfficeDownload';
export default function SlideLayout({ id, parameters }: InteractiveProps) {
  const initial = parameters.dataset ?? 'P01';
  if (typeof initial !== 'string')
    throw new RangeError('Неизвестный набор слайдов.');
  slideSet(initial);
  const [preset, setPreset] = useState(initial),
    [settings, setSettings] = useState(() => slideInitial(initial)),
    [slideIndex, setSlideIndex] = useState(1),
    [frameIndex, setFrameIndex] = useState(1),
    [locked, setLocked] = useState(true),
    [checked, setChecked] = useState(false),
    [error, setError] = useState(''),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  const slide = settings.slides[slideIndex],
    frame = slide?.frames[frameIndex],
    messages = slideChecks(preset, settings);
  if (!slide || !frame) throw new RangeError('Объект слайда не найден.');
  const invalidNumber = Object.entries(drafts).some(([key, raw]) => {
    const number = Number(raw),
      font = key.endsWith('Size'),
      min = font ? 12 : key === 'x' || key === 'y' ? 0 : 1,
      max = font ? 48 : 30;
    return (
      !raw.trim() || !Number.isFinite(number) || number < min || number > max
    );
  });
  function change(key: 'x' | 'y' | 'width' | 'height', value: number) {
    if (
      !frame ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 30 ||
      ((key === 'width' || key === 'height') && value < 1)
    ) {
      setError('Координаты: 0–30 см; размеры: 1–30 см.');
      return;
    }
    const patch = {
      [key]: value,
      ...(locked && frame.kind === 'image' && key === 'width'
        ? { height: value / 1.5 }
        : {}),
      ...(locked && frame.kind === 'image' && key === 'height'
        ? { width: value * 1.5 }
        : {}),
    };
    setSettings((previous) =>
      updateFrame(previous, slideIndex, frameIndex, patch),
    );
    setChecked(false);
    setError('');
  }
  return (
    <div className="information-lab">
      <p>
        Три слайда 16:9, шрифты 40/24/20 пт; изображения на слайдах 2 и 3 — два
        и три. Номера связывают объекты схемы с текстовым списком. Проверка
        взаимного расположения не требует единственных координат и не выставляет
        экспертный балл.
      </p>
      <label htmlFor={`${id}-dataset`}>Набор презентации</label>
      <select
        id={`${id}-dataset`}
        value={preset}
        onChange={(event) => {
          setPreset(event.target.value);
          setSettings(slideInitial(event.target.value));
          setDrafts({});
          setError('');
          setChecked(false);
        }}
      >
        {['P01', 'P02', 'P11'].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <label htmlFor={`${id}-slide`}>Слайд для компоновки</label>
      <select
        id={`${id}-slide`}
        value={slideIndex}
        onChange={(event) => {
          setSlideIndex(Number(event.target.value));
          setFrameIndex(0);
          setDrafts({});
          setError('');
          setChecked(false);
        }}
      >
        {settings.slides.map((slide, index) => (
          <option key={index} value={index}>
            {index + 1}. {slide.title}
          </option>
        ))}
      </select>
      <svg
        className="office-slide"
        role="img"
        viewBox="0 0 576 324"
        aria-labelledby={`${id}-canvas-title`}
      >
        <title id={`${id}-canvas-title`}>
          Схема слайда {slideIndex + 1}; выделен объект {frameIndex + 1}
        </title>
        <rect
          x="1"
          y="1"
          width="574"
          height="322"
          fill="var(--surface)"
          stroke="currentColor"
        />
        {slide.frames.map((item, index) => (
          <g key={index} data-selected={frameIndex === index}>
            <rect
              x={item.x * 20}
              y={item.y * 20}
              width={item.width * 20}
              height={item.height * 20}
              fill={
                item.kind === 'image'
                  ? 'var(--accent-surface)'
                  : 'var(--violet-bg)'
              }
              stroke="currentColor"
              strokeWidth={frameIndex === index ? 4 : 1}
            />
            {item.kind === 'image' && (
              <image
                x={item.x * 20 + 2}
                y={item.y * 20 + 2}
                width={Math.max(0, item.width * 20 - 4)}
                height={Math.max(0, item.height * 20 - 4)}
                preserveAspectRatio="none"
                href={`${import.meta.env.BASE_URL}materials/files/slide-${preset}-${item.path.match(/image-(\d)/u)?.[1] ?? '1'}.png`}
              />
            )}
            <rect
              x={item.x * 20 + 3}
              y={item.y * 20 + 3}
              width="36"
              height="36"
              fill="var(--surface)"
            />
            <text
              x={item.x * 20 + 10}
              y={item.y * 20 + 31}
              fill="currentColor"
              style={{ fontSize: '30px', fontWeight: 'bold' }}
            >
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
      <label htmlFor={`${id}-frame`}>Объект для перемещения</label>
      <select
        id={`${id}-frame`}
        value={frameIndex}
        onChange={(event) => {
          setFrameIndex(Number(event.target.value));
          setDrafts({});
          setError('');
        }}
      >
        {slide.frames.map((item, index) => (
          <option key={index} value={index}>
            {index + 1}.{' '}
            {item.kind === 'image'
              ? 'Изображение'
              : item.style === 'Heading'
                ? 'Заголовок'
                : 'Текст'}
          </option>
        ))}
      </select>
      <p className="lab-path">
        Выбран:{' '}
        {frame.kind === 'image' ? frame.alt : frame.paragraphs.join(' ')}
      </p>
      {(['x', 'y', 'width', 'height'] as const).map((key) => (
        <label key={key}>
          {
            {
              x: 'Слева, см',
              y: 'Сверху, см',
              width: 'Ширина, см',
              height: 'Высота, см',
            }[key]
          }
          <input
            type="number"
            value={drafts[key] ?? Number(frame[key].toFixed(3))}
            min={key === 'x' || key === 'y' ? 0 : 1}
            max={30}
            step={0.1}
            onChange={(event) => {
              const raw = event.target.value;
              setDrafts((previous) => {
                const next = { ...previous, [key]: raw };
                if (locked && key === 'width') delete next.height;
                if (locked && key === 'height') delete next.width;
                return next;
              });
              setChecked(false);
              if (raw.trim()) change(key, event.target.valueAsNumber);
            }}
          />
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={locked}
          onChange={(event) => {
            setLocked(event.target.checked);
          }}
        />{' '}
        Сохранять пропорции при изменении размера изображения
      </label>
      <div className="interactive-toolbar">
        {(
          [
            ['Влево', 'x', -0.2],
            ['Вправо', 'x', 0.2],
            ['Вверх', 'y', -0.2],
            ['Вниз', 'y', 0.2],
          ] as const
        ).map(([title, key, delta]) => (
          <button
            key={title}
            type="button"
            className="button button-light"
            onClick={() => {
              setDrafts((previous) =>
                Object.fromEntries(
                  Object.entries(previous).filter(([entry]) => entry !== key),
                ),
              );
              change(key, Number((frame[key] + delta).toFixed(3)));
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {(
        [
          ['titleSize', 'Размер титула, пт'],
          ['headingSize', 'Размер заголовков, пт'],
          ['bodySize', 'Размер основного текста, пт'],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            value={drafts[key] ?? settings[key]}
            min={12}
            max={48}
            onChange={(event) => {
              const value = event.target.valueAsNumber,
                raw = event.target.value;
              setDrafts((previous) => ({ ...previous, [key]: raw }));
              setChecked(false);
              if (Number.isFinite(value) && value >= 12 && value <= 48) {
                setSettings((previous) => ({ ...previous, [key]: value }));
                setError('');
                setChecked(false);
              } else setError('Размер шрифта: 12–48 пт.');
            }}
          />
        </label>
      ))}
      {(error || invalidNumber) && (
        <p role="alert">
          {invalidNumber
            ? 'Укажи допустимые числа во всех полях; проверка и сохранение пока недоступны.'
            : error}
        </p>
      )}
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button button-dark"
          disabled={invalidNumber}
          onClick={() => {
            setChecked(true);
          }}
        >
          Проверить компоновку
        </button>
        <button
          type="button"
          className="button button-light"
          onClick={() => {
            const expected =
              slideTarget(preset).slides[slideIndex]?.frames[frameIndex];
            if (expected) {
              setDrafts({});
              setError('');
              setSettings((previous) =>
                updateFrame(previous, slideIndex, frameIndex, {
                  x: expected.x,
                  y: expected.y,
                  width: expected.width,
                  height: expected.height,
                }),
              );
              setChecked(false);
            }
          }}
        >
          Вернуть выбранный объект по макету
        </button>
      </div>
      <div role="status">
        {checked &&
          (messages.length ? (
            <>
              <p>Проверь учебную компоновку:</p>
              <ul>
                {messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              Верно: взаимное расположение, границы, пропорции и размеры шрифта
              соблюдены. Открой ODP и отдельно проверь читаемость и весь текст.
            </p>
          ))}
      </div>
      <details>
        <summary>Все объекты текущего слайда</summary>
        <ol>
          {slide.frames.map((item, index) => (
            <li key={index}>
              {item.kind === 'image'
                ? `Изображение: ${item.alt}`
                : item.paragraphs.join(' ')}
              . x={item.x}, y={item.y}, ширина {item.width}, высота{' '}
              {item.height} см.
            </li>
          ))}
        </ol>
      </details>
      <OfficeDownload
        name={`lab-${preset}.odp`}
        disabled={invalidNumber}
        create={async () => {
          const { exportSlides } =
            await import('../lib/interactives/office-slide-export');
          return exportSlides(preset, settings);
        }}
      />
      <p>
        Размер страницы: {PAGE.width} × {PAGE.height} см. Цветовые блоки — схема
        размещения, изображения — настоящие иллюстрации исходного набора. Полный
        текст проверяй в сохранённом ODP.
      </p>
    </div>
  );
}
