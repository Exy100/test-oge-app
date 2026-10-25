import type { PresentationSet } from './presentation-content';

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
