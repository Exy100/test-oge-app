import { XMLParser } from 'fast-xml-parser';
import type { TaskInstance } from '../../../src/core/types';

function paragraphs(bytes: Uint8Array): { tag: string; text: string }[] {
  const parsed: unknown = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: true,
  }).parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const blocks: { tag: string; text: string }[] = [];
  function text(value: unknown): string {
    if (Array.isArray(value)) return value.map(text).join('');
    if (value && typeof value === 'object')
      return Object.entries(value as Record<string, unknown>)
        .map(([tag, child]) =>
          tag === '#text' && typeof child === 'string' ? child : text(child),
        )
        .join('');
    return '';
  }
  function visit(value: unknown): void {
    if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value && typeof value === 'object')
      for (const [tag, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (tag === 'p' || tag === 'h2')
          blocks.push({ tag, text: text(child) });
        else visit(child);
      }
  }
  visit(parsed);
  return blocks;
}
export function readingOracle(
  task: TaskInstance,
  files: ReadonlyMap<string, Uint8Array>,
): string {
  const q = /автора «([^»]+)» герой «([^»]+)» ([^.]+)\./u.exec(task.statement);
  if (!q) throw new Error('Reading question missing');
  const answers: string[] = [];
  for (const [path, bytes] of files) {
    if (!path.startsWith(`Тексты/${q[1] ?? ''}/`) || !path.endsWith('.htm'))
      continue;
    const blocks = paragraphs(bytes);
    if (!blocks.some(({ text }) => text === `Автор: ${q[1] ?? ''}.`)) continue;
    let preceding: string[] = [];
    for (const block of blocks) {
      if (block.tag === 'h2') preceding = [];
      else if (block.text.includes(`${q[2] ?? ''} ${q[3] ?? ''}.`)) {
        const speaker = block.text.split('— сказал ')[1]?.split('.')[0] ?? '',
          arrival = preceding.find((text) => text.includes('Местный ')) ?? '',
          identity =
            arrival.split('Местный ')[1]?.split(' встретил ')[0]?.split(' ') ??
            [];
        if (identity[1] !== speaker)
          throw new Error('Inconsistent narrative identity');
        answers.push(
          task.statement.includes('Как звали щенка')
            ? (arrival
                .split('Щенка, бегавшего рядом, звали ')[1]
                ?.split('.')[0] ?? '')
            : task.statement.includes('Какова фамилия')
              ? speaker
              : (identity[0] ?? ''),
        );
      } else preceding.push(block.text);
    }
  }
  if (answers.length !== 1 || !answers[0])
    throw new Error('Ambiguous reading evidence');
  return answers[0];
}
interface Directory {
  files: string[];
  children: Map<string, Directory>;
}
export function selectionOraclePaths(
  files: ReadonlyMap<string, Uint8Array>,
  folders: readonly string[],
  extensions: readonly string[],
): string[] {
  const root: Directory = { files: [], children: new Map() };
  for (const path of files.keys()) {
    const parts = path.split('/'),
      name = parts.pop();
    if (!name) throw new Error('Empty filename');
    let node = root;
    for (const part of parts) {
      if (!node.children.has(part))
        node.children.set(part, { files: [], children: new Map() });
      const next = node.children.get(part);
      if (!next) throw new Error('Directory missing');
      node = next;
    }
    node.files.push(name);
  }
  const found = new Set<string>();
  function walk(node: Directory, prefix: string): void {
    for (const name of node.files)
      if (
        extensions.some((extension) => name.toLowerCase().endsWith(extension))
      )
        found.add(prefix + '/' + name);
    for (const [name, child] of node.children) walk(child, prefix + '/' + name);
  }
  for (const folder of folders) {
    let node: Directory | undefined = root;
    for (const part of folder.split('/')) node = node?.children.get(part);
    if (node) walk(node, folder);
  }
  return [...found].sort();
}
export function selectionOracle(
  task: TaskInstance,
  files: ReadonlyMap<string, Uint8Array>,
): string {
  const folders = [...task.statement.matchAll(/^- (.+)$/gmu)].map(
      (match) => match[1] ?? '',
    ),
    extensions = [
      ...task.statement.matchAll(/\.(?:htm|tiff|jpeg|pdf)\b/gu),
    ].map((match) => match[0]);
  if (!folders.length || !extensions.length)
    throw new Error('File selection parameters missing');
  return String(selectionOraclePaths(files, folders, extensions).length);
}
