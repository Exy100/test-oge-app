import { presentationSets } from '../../core/banks/presentation-content';
import {
  deckFor,
  PAGE,
  type DeckSlide,
  type DeckFrame,
} from '../../core/banks/slide-layout';
export { PAGE };
export interface SlideSettings {
  titleSize: number;
  headingSize: number;
  bodySize: number;
  slides: DeckSlide[];
}
export function slideSet(id: string) {
  const set = presentationSets.find((set) => set.id === id);
  if (!set) throw new RangeError('Неизвестный набор слайдов.');
  return set;
}
export function slideTarget(id: string): SlideSettings {
  return {
    titleSize: 40,
    headingSize: 24,
    bodySize: 20,
    slides: structuredClone([...deckFor(slideSet(id))]),
  };
}
export function slideInitial(id: string): SlideSettings {
  const target = slideTarget(id),
    frame = target.slides[1]?.frames[1];
  if (!frame) throw new RangeError('Нет иллюстрации.');
  return {
    ...target,
    bodySize: 16,
    slides: target.slides.map((slide, index) =>
      index === 1
        ? {
            ...slide,
            frames: slide.frames.map((frame, index) =>
              index === 1 ? { ...frame, x: 21, y: 4, height: 3 } : frame,
            ),
          }
        : slide,
    ),
  };
}
export function updateFrame(
  settings: SlideSettings,
  slideIndex: number,
  frameIndex: number,
  patch: Partial<Pick<DeckFrame, 'x' | 'y' | 'width' | 'height'>>,
): SlideSettings {
  const frame = settings.slides[slideIndex]?.frames[frameIndex];
  if (!frame) throw new RangeError('Объект слайда не найден.');
  if (Object.values(patch).some((value) => !Number.isFinite(value)))
    throw new RangeError('Координаты и размеры должны быть числами.');
  return {
    ...settings,
    slides: settings.slides.map((slide, index) =>
      index === slideIndex
        ? {
            ...slide,
            frames: slide.frames.map((frame, index) =>
              index === frameIndex ? { ...frame, ...patch } : frame,
            ),
          }
        : slide,
    ),
  };
}
export function slideChecks(id: string, settings: SlideSettings) {
  const target = slideTarget(id),
    messages: string[] = [];
  if (settings.slides.length !== 3) messages.push('Нужны три слайда.');
  if (
    settings.titleSize !== 40 ||
    settings.headingSize !== 24 ||
    settings.bodySize !== 20
  )
    messages.push(
      'Размеры шрифта: титул 40, подзаголовок/заголовки 24, текст 20 пт.',
    );
  settings.slides.forEach((slide, si) => {
    const expected = target.slides[si];
    if (!expected || slide.frames.length !== expected.frames.length) {
      messages.push(`Слайд ${String(si + 1)}: проверь число объектов.`);
      return;
    }
    slide.frames.forEach((frame, i) => {
      if (
        !Object.values({
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
        }).every(Number.isFinite) ||
        frame.width <= 0 ||
        frame.height <= 0 ||
        frame.x < 0 ||
        frame.y < 0 ||
        frame.x + frame.width > PAGE.width + 1e-8 ||
        frame.y + frame.height > PAGE.height + 1e-8
      )
        messages.push(
          `Слайд ${String(si + 1)}, объект ${String(i + 1)}: выход за границу.`,
        );
      if (
        frame.kind === 'image' &&
        Math.abs(frame.width / frame.height - 1.5) > 0.01
      )
        messages.push(
          `Слайд ${String(si + 1)}, объект ${String(i + 1)}: нарушены пропорции изображения.`,
        );
      for (let j = i + 1; j < slide.frames.length; j++) {
        const other = slide.frames[j],
          a = expected.frames[i],
          b = expected.frames[j];
        if (!other || !a || !b) continue;
        if (
          (a.x + a.width <= b.x && frame.x + frame.width > other.x + 0.01) ||
          (b.x + b.width <= a.x && other.x + other.width > frame.x + 0.01) ||
          (a.y + a.height <= b.y && frame.y + frame.height > other.y + 0.01) ||
          (b.y + b.height <= a.y && other.y + other.height > frame.y + 0.01)
        )
          messages.push(
            `Слайд ${String(si + 1)}: взаимное расположение объектов ${String(i + 1)} и ${String(j + 1)} отличается от макета.`,
          );
      }
    });
  });
  return [...new Set(messages)];
}
