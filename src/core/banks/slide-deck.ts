import { makeOdf, paragraph, xml } from '../datasets/odf';
import type { PresentationSet } from './presentation-content';
import { Drawing } from './illustrations';
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type DeckFrame = Box &
  (
    | {
        kind: 'text';
        paragraphs: readonly string[];
        style: 'Title' | 'Heading' | 'Body' | 'Caption' | 'Identifier';
      }
    | { kind: 'image'; path: string; alt: string }
  );
export interface DeckSlide {
  title: string;
  frames: readonly DeckFrame[];
}
export const PAGE = { width: 28.8, height: 16.2 } as const;
export function deckFor(set: PresentationSet): readonly DeckSlide[] {
  const text = (
    box: Box,
    paragraphs: readonly string[],
    style: 'Title' | 'Heading' | 'Body' | 'Caption' | 'Identifier',
  ): DeckFrame => ({ kind: 'text', ...box, paragraphs, style });
  const image = (
    x: number,
    y: number,
    width: number,
    path: string,
    alt: string,
  ): DeckFrame => ({
    kind: 'image',
    x,
    y,
    width,
    height: (width * 2) / 3,
    path,
    alt,
  });
  const heading = (title: string) =>
    text({ x: 1, y: 0.8, width: 26.8, height: 2.6 }, [title], 'Heading');
  return [
    {
      title: set.title,
      frames: [
        text({ x: 1.2, y: 3, width: 26.4, height: 3.2 }, [set.title], 'Title'),
        text(
          { x: 1.2, y: 8, width: 26.4, height: 2.2 },
          [`Учебный идентификатор: ${set.id}`],
          'Identifier',
        ),
      ],
    },
    {
      title: set.secondTitle,
      frames: [
        heading(set.secondTitle),
        image(1, 4, 7.2, 'Pictures/image-1.png', set.captions[0]),
        text(
          { x: 9.2, y: 4, width: 18.6, height: 4.8 },
          [set.points[0]],
          'Body',
        ),
        text(
          { x: 1, y: 10, width: 18.6, height: 4.8 },
          [set.points[1]],
          'Body',
        ),
        image(20.6, 10, 7.2, 'Pictures/image-2.png', set.captions[1]),
      ],
    },
    {
      title: set.thirdTitle,
      frames: [
        heading(set.thirdTitle),
        text(
          { x: 1, y: 4, width: 8.2, height: 5.46 },
          [set.captions[0]],
          'Caption',
        ),
        image(10.3, 4, 8.2, 'Pictures/image-2.png', set.captions[1]),
        text(
          { x: 19.6, y: 4, width: 8.2, height: 5.46 },
          [set.captions[1]],
          'Caption',
        ),
        image(1, 10, 8.2, 'Pictures/image-3.png', set.captions[2]),
        text(
          { x: 10.3, y: 10, width: 8.2, height: 5.46 },
          [set.captions[2]],
          'Caption',
        ),
        image(19.6, 10, 8.2, 'Pictures/image-1.png', set.captions[0]),
      ],
    },
  ];
}

const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3"><office:styles/><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="28.8cm" fo:page-height="16.2cm" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>`;
const automaticStyles = `<office:automatic-styles xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"><style:style style:name="Background" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#FAF6ED"/></style:style>${[
  ['Title', 40, 'normal', 'center'],
  ['Heading', 24, 'normal', 'center'],
  ['Body', 20, 'normal', 'start'],
  ['Caption', 20, 'normal', 'start'],
  ['Identifier', 24, 'normal', 'center'],
]
  .map(
    ([name, size, weight, align]) =>
      `<style:style style:name="${String(name)}" style:family="paragraph"><style:paragraph-properties fo:text-align="${String(align)}" fo:margin-top="0.2cm" fo:margin-bottom="0.4cm"/><style:text-properties fo:font-family="DejaVu Sans" fo:font-size="${String(size)}pt" fo:font-weight="${String(weight)}" fo:color="#163B34"/></style:style>`,
  )
  .join(
    '',
  )}<style:style style:name="Frame" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" fo:padding="0cm" draw:auto-grow-height="false" draw:auto-grow-width="false"/></style:style></office:automatic-styles>`;
export function makeSlideDeck(
  slides: readonly DeckSlide[],
  images: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  if (slides.length < 1 || slides.length > 3)
    throw new Error('Нужно от одного до трёх слайдов.');
  for (const slide of slides)
    for (const frame of slide.frames) {
      if (
        ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) ||
        frame.x < 0 ||
        frame.y < 0 ||
        frame.width <= 0 ||
        frame.height <= 0 ||
        frame.x + frame.width > PAGE.width ||
        frame.y + frame.height > PAGE.height
      )
        throw new Error('Объект выходит за слайд.');
      if (
        frame.kind === 'image' &&
        (!images.has(frame.path) ||
          Math.abs(frame.width / frame.height - 1.5) > 1e-9)
      )
        throw new Error('Иллюстрация отсутствует или искажена.');
    }
  const pages = slides
    .map(
      (slide, i) =>
        `<draw:page draw:name="${xml(slide.title)}" draw:style-name="Background" draw:master-page-name="Default">${slide.frames.map((frame, j) => `<draw:frame draw:name="frame-${String(i)}-${String(j)}" draw:style-name="Frame" svg:x="${String(frame.x)}cm" svg:y="${String(frame.y)}cm" svg:width="${String(frame.width)}cm" svg:height="${String(frame.height)}cm">${frame.kind === 'text' ? `<draw:text-box>${frame.paragraphs.map((value) => paragraph(value, frame.style)).join('')}</draw:text-box>` : `<svg:title>${xml(frame.alt)}</svg:title><draw:image xlink:href="${xml(frame.path)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>`}</draw:frame>`).join('')}</draw:page>`,
    )
    .join('');
  return makeOdf('odp', `<office:presentation>${pages}</office:presentation>`, {
    styles,
    automaticStyles,
    images,
  });
}
export function layoutImage(slide: DeckSlide): Uint8Array {
  const d = new Drawing(480, 270);
  const scale = 480 / PAGE.width;
  const digits = [
    '000000000000000',
    '010110010010111',
    '110001010100111',
    '110001010001110',
  ];
  for (const frame of slide.frames) {
    const color =
      frame.kind === 'image'
        ? ([235, 159, 101] as const)
        : frame.style === 'Title' || frame.style === 'Heading'
          ? ([80, 139, 83] as const)
          : ([98, 161, 185] as const);
    d.rect(
      frame.x * scale,
      frame.y * scale,
      frame.width * scale,
      frame.height * scale,
      color,
    );
    const label =
      digits[
        frame.kind === 'image'
          ? 3
          : frame.style === 'Title' || frame.style === 'Heading'
            ? 1
            : 2
      ] ?? '';
    for (let index = 0; index < label.length; index++)
      if (label[index] === '1')
        d.rect(
          frame.x * scale + 8 + (index % 3) * 3,
          frame.y * scale + 8 + Math.floor(index / 3) * 3,
          3,
          3,
          [22, 59, 52],
        );
  }
  return d.png();
}
