import DOMPurify from 'isomorphic-dompurify';
import { renderRichText } from '../../core/rich-text/render';
import { preparationLessons } from '../lessons/preparation';
import { lessonStreamHref } from '../lessons/links';
import { sitePath } from '../site';

const tags = [
  'p',
  'h3',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'code',
  'pre',
  'blockquote',
  'span',
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mo',
  'mn',
  'mtext',
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mspace',
  'msqrt',
  'mroot',
  'mstyle',
  'menclose',
  'mpadded',
  'mphantom',
];

/** Untrusted markdown is sanitised before any allowlisted navigation is built. */
export function renderFeedback(source: string): string {
  const fragment = DOMPurify.sanitize(renderRichText(source), {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: [
      'class',
      'tabindex',
      'role',
      'aria-label',
      'display',
      'encoding',
      'mathvariant',
      'stretchy',
      'fence',
      'separator',
      'accent',
      'accentunder',
      'lspace',
      'rspace',
      'width',
      'height',
      'depth',
      'columnalign',
      'rowalign',
      'columnspacing',
      'rowspacing',
      'displaystyle',
      'scriptlevel',
      'linethickness',
      'notation',
    ],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  function visit(node: Node) {
    if (['CODE', 'PRE', 'MATH'].includes(node.nodeName.toUpperCase())) return;
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      const document = node.ownerDocument;
      if (!document || !text.includes('[[')) return;
      const replacement = document.createDocumentFragment();
      let previous = 0;
      for (const match of text.matchAll(
        /\[\[(?:(lesson|stream):)?([^\]\r\n]*)\]\]/gu,
      )) {
        replacement.append(
          document.createTextNode(text.slice(previous, match.index)),
        );
        const value = match[2];
        const lesson =
          match[1] === 'lesson'
            ? preparationLessons.find((item) => item.id === value)
            : undefined;
        const number =
          match[1] === 'stream' && /^(?:[1-9]|1[0-6])$/u.test(value ?? '')
            ? Number(value)
            : undefined;
        if (lesson || number) {
          const anchor = document.createElement('a');
          anchor.setAttribute(
            'href',
            lesson ? sitePath(lesson.route) : lessonStreamHref([number ?? 1]),
          );
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener');
          anchor.textContent =
            lesson?.title ?? `Решать задания №${String(number)}`;
          replacement.append(anchor);
        }
        previous = match.index + match[0].length;
      }
      replacement.append(document.createTextNode(text.slice(previous)));
      node.parentNode?.replaceChild(replacement, node);
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  }
  visit(fragment);
  if (!fragment.textContent.trim()) return '';
  const container = fragment.ownerDocument.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}
