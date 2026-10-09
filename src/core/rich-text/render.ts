import MarkdownIt from 'markdown-it';
import katex from 'katex';
import DOMPurify from 'isomorphic-dompurify';

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});
markdown.renderer.rules.link_open = () => '';
markdown.renderer.rules.link_close = () => '';
markdown.renderer.rules.image = (tokens, index) =>
  markdown.utils.escapeHtml(tokens[index]?.content ?? '');
markdown.inline.ruler.before('escape', 'math', (state, silent) => {
  if (state.src[state.pos] !== '$') return false;
  const start = state.pos;
  const delimiter = state.src.startsWith('$$', start) ? '$$' : '$';
  let end = start + delimiter.length;
  while ((end = state.src.indexOf(delimiter, end)) !== -1) {
    let slashes = 0;
    for (let position = end - 1; state.src[position] === '\\'; position -= 1)
      slashes += 1;
    if (slashes % 2 === 0) break;
    end += delimiter.length;
  }
  if (end === -1 || end === start + delimiter.length) return false;
  if (!silent) {
    const token = state.push('math', '', 0);
    token.content = state.src.slice(start + delimiter.length, end);
    token.markup = delimiter;
  }
  state.pos = end + delimiter.length;
  return true;
});
markdown.renderer.rules.math = (tokens, index) => {
  const token = tokens[index];
  if (!token) return '';
  try {
    return katex.renderToString(token.content, {
      trust: false,
      strict: 'warn',
      throwOnError: true,
      output: 'mathml',
      displayMode: token.markup === '$$',
      maxExpand: 1000,
      maxSize: 20,
    });
  } catch {
    return `<span class="math-error">Не удалось отобразить формулу: <code>${markdown.utils.escapeHtml(token.content)}</code></span>`;
  }
};

/** Shared server/browser renderer. MathML avoids inline style exceptions in CSP. */
export function renderRichText(source: string): string {
  return DOMPurify.sanitize(markdown.render(source), {
    USE_PROFILES: { html: true, mathMl: true },
    FORBID_TAGS: [
      'a',
      'img',
      'video',
      'audio',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'script',
      'style',
      'svg',
    ],
    FORBID_ATTR: ['href', 'src', 'style', 'id', 'name'],
    ALLOW_DATA_ATTR: false,
  });
}
