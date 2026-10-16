/** Passive UTF-8 HTML profile for the project's original reading corpus. */
export interface HtmBlock {
  tag: 'h1' | 'h2' | 'p';
  text: string;
}
export interface HtmDocument {
  title: string;
  blocks: readonly HtmBlock[];
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
const entities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
function escape(text: string): string {
  if (!text.trim() || text.length > 2500 || hasControl(text))
    throw new Error('Некорректный текст HTM.');
  return text.replace(/[&<>"']/gu, (char) => entities[char] ?? char);
}
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
function unescape(text: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos);)/u.test(text))
    throw new Error('Неподдерживаемая сущность HTM.');
  const inverse = Object.fromEntries(
    Object.entries(entities).map(([a, b]) => [b, a]),
  );
  return text.replace(
    /&(?:amp|lt|gt|quot|apos);/gu,
    (entity) => inverse[entity] ?? '',
  );
}
export function makeHtm(document: HtmDocument): Uint8Array {
  if (
    !document.blocks.length ||
    document.blocks.length > 500 ||
    document.blocks.some(({ tag }) => !['h1', 'h2', 'p'].includes(tag))
  )
    throw new Error('Некорректная структура HTM.');
  const text = `<!DOCTYPE html>\n<html lang="ru"><head><meta charset="utf-8" /><title>${escape(document.title)}</title></head><body>\n${document.blocks.map(({ tag, text }) => `<${tag}>${escape(text)}</${tag}>`).join('\n')}\n</body></html>\n`;
  const bytes = encoder.encode(text);
  if (bytes.length > 1_048_576) throw new Error('Превышен размер HTM.');
  return bytes;
}
export function readHtm(bytes: Uint8Array): HtmDocument {
  if (bytes.length > 1_048_576) throw new Error('Превышен размер HTM.');
  const text = decoder.decode(bytes),
    match =
      /^<!DOCTYPE html>\n<html lang="ru"><head><meta charset="utf-8" \/><title>([^<]*)<\/title><\/head><body>\n([\s\S]*)\n<\/body><\/html>\n$/u.exec(
        text,
      );
  if (!match) throw new Error('HTM не соответствует пассивному профилю.');
  const blocks: HtmBlock[] = [];
  for (const row of (match[2] ?? '').split('\n')) {
    const node = /^<(h1|h2|p)>([^<]*)<\/\1>$/u.exec(row),
      tag = node?.[1];
    if (!node || (tag !== 'h1' && tag !== 'h2' && tag !== 'p'))
      throw new Error('Неподдерживаемый узел HTM.');
    blocks.push({ tag, text: unescape(node[2] ?? '') });
  }
  const document: HtmDocument = { title: unescape(match[1] ?? ''), blocks };
  if (decoder.decode(makeHtm(document)) !== text)
    throw new Error('Неканонический HTM.');
  return document;
}
