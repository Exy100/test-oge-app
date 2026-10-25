import { makeOdf, xml } from '../../core/datasets/odf';
import { illustrate } from '../../core/banks/illustrations';
import { slideSet, PAGE, type SlideSettings } from './slide-layout';
import { pageStyles } from './office-page';
export function exportSlides(id: string, s: SlideSettings): Uint8Array {
  const set = slideSet(id),
    images = new Map(
      Array.from({ length: 3 }, (_, index) => [
        `Pictures/image-${String(index + 1)}.png`,
        illustrate(set.scene, index),
      ]),
    );
  const sizes: Record<string, number> = {
    Title: s.titleSize,
    Identifier: s.headingSize,
    Heading: s.headingSize,
    Body: s.bodySize,
    Caption: s.bodySize,
  };
  const automaticStyles = `<office:automatic-styles>${Object.entries(sizes)
    .map(
      ([name, size]) =>
        `<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties fo:text-align="${name === 'Title' || name === 'Identifier' || name === 'Heading' ? 'center' : 'left'}"/><style:text-properties fo:font-family="DejaVu Sans" fo:font-size="${String(size)}pt" fo:color="#192C28"/></style:style>`,
    )
    .join(
      '',
    )}<style:style style:name="Frame" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" fo:padding="0cm" draw:auto-grow-height="false"/></style:style></office:automatic-styles>`;
  const body = `<office:presentation>${s.slides.map((slide, i) => `<draw:page draw:name="Слайд ${String(i + 1)}" draw:master-page-name="Default">${slide.frames.map((frame, index) => `<draw:frame draw:name="Объект ${String(index + 1)}" draw:style-name="Frame" svg:x="${String(frame.x)}cm" svg:y="${String(frame.y)}cm" svg:width="${String(frame.width)}cm" svg:height="${String(frame.height)}cm">${frame.kind === 'image' ? `<svg:title>${xml(frame.alt)}</svg:title><draw:image xlink:href="${xml(frame.path)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` : `<draw:text-box>${frame.paragraphs.map((text) => `<text:p text:style-name="${frame.style}">${xml(text)}</text:p>`).join('')}</draw:text-box>`}</draw:frame>`).join('')}</draw:page>`).join('')}</office:presentation>`;
  return makeOdf('odp', body, {
    styles: pageStyles(PAGE.width, PAGE.height, 0),
    automaticStyles,
    images,
  });
}
