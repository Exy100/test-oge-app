/** Exhaustive reference oracles for official parameters, independent of generation. */
import { readFileSync } from 'node:fs';
import { z } from '../../../src/core/zod';
import type { Parameters, Predicate, ShortFixture } from './short-answers';

function predicate(expression: Predicate, x: number): boolean {
  switch (expression[0]) {
    case 'odd':
      return x % 2 === 1;
    case 'gt':
      return x > expression[1];
    case 'ge':
      return x >= expression[1];
    case 'le':
      return x <= expression[1];
    case 'eq':
      return x === expression[1];
    case 'not':
      return !predicate(expression[1], x);
    case 'and':
      return predicate(expression[1], x) && predicate(expression[2], x);
    case 'or':
      return predicate(expression[1], x) || predicate(expression[2], x);
  }
}
export function solveShort(fixture: ShortFixture): string[] | null {
  return solveParameters(fixture.parameters, fixture.year);
}
export function solveParameters(p: Parameters, year?: number): string[] | null {
  switch (p.kind) {
    case 'deleted-word': {
      const size = (text: string) =>
        p.bits === 16
          ? Buffer.byteLength(text, 'utf16le')
          : Array.from(text).length;
      const original = p.words.join(', ');
      return p.words.filter(
        (_, index) =>
          size(original) -
            size(p.words.filter((__, other) => other !== index).join(', ')) ===
          p.bytes,
      );
    }
    case 'decode': {
      const words: string[] = [];
      const visit = (offset: number, letters: string): void => {
        if (offset === p.encoded.length) {
          words.push(letters);
          return;
        }
        for (const [letter, code] of Object.entries(p.codes))
          if (p.encoded.startsWith(code, offset))
            visit(offset + code.length, letters + letter);
      };
      visit(0, '');
      if (!p.repeatedOnly) return words;
      return [
        ...new Set(
          words.map((word) =>
            Array.from(
              new Set(
                Array.from(word).filter(
                  (letter) => word.indexOf(letter) !== word.lastIndexOf(letter),
                ),
              ),
            )
              .sort()
              .join(''),
          ),
        ),
      ];
    }
    case 'logic': {
      function largest(expression: Predicate): number {
        switch (expression[0]) {
          case 'not':
            return largest(expression[1]);
          case 'and':
          case 'or':
            return Math.max(largest(expression[1]), largest(expression[2]));
          case 'odd':
            return 1;
          default:
            return expression[1];
        }
      }
      const last = largest(p.predicate) + 2;
      if (
        p.mode === 'count-true' &&
        (predicate(p.predicate, last) || predicate(p.predicate, last + 1))
      )
        throw new Error('Infinite set of natural solutions');
      const candidates = Array.from({ length: last }, (_, index) => index + 1);
      return [
        String(
          p.mode === 'count-true'
            ? candidates.filter((x) => predicate(p.predicate, x)).length
            : candidates.find((x) => !predicate(p.predicate, x)),
        ),
      ];
    }
    case 'roads': {
      const distances: number[] = [];
      const walk = (at: string, seen: string[], total: number): void => {
        if (at === p.end) {
          distances.push(total);
          return;
        }
        for (const [a, b, length] of p.edges) {
          const next = a === at ? b : b === at ? a : null;
          if (next && !seen.includes(next))
            walk(next, [...seen, next], total + length);
        }
      };
      walk('A', ['A'], 0);
      return [String(Math.min(...distances))];
    }
    case 'executor': {
      const programs: string[] = [];
      const walk = (value: number, code: string): void => {
        if (code && value === p.end) programs.push(code);
        if (code.length === p.limit) return;
        walk(p.square ? value ** 2 : value * (p.multiplier ?? 1), code + '1');
        walk(value + p.add, code + '2');
      };
      walk(p.start, '');
      return programs;
    }
    case 'program-parameter': {
      const matches = Array.from({ length: 201 }, (_, i) => i - 100).filter(
        (a) =>
          p.pairs.filter(([s, t]) =>
            p.variable === 's' ? s > a || t > p.fixed : s > p.fixed || t > a,
          ).length === p.yes,
      );
      return p.mode === 'any'
        ? matches.map(String)
        : [String(p.mode === 'min' ? matches[0] : matches.at(-1))];
    }
    case 'url': {
      const matches: string[] = [];
      const visit = (text: string, used: number[], code: string): void => {
        if (used.length === p.fragments.length) {
          if (text === p.target) matches.push(code);
          return;
        }
        for (const [i, value] of p.fragments.entries())
          if (!used.includes(i) && p.target.startsWith(text + value))
            visit(text + value, [...used, i], code + String(i + 1));
      };
      visit('', [], '');
      return matches;
    }
    case 'search': {
      // Partition into left-only, intersection, right-only; enumerate all possibilities.
      const found = new Set<number>();
      for (let leftOnly = 0; leftOnly <= p.left; leftOnly++) {
        const both = p.left - leftOnly;
        for (let rightOnly = 0; rightOnly <= p.union; rightOnly++) {
          if (
            leftOnly + both + rightOnly !== p.union ||
            (p.right !== undefined && both + rightOnly !== p.right) ||
            (p.both !== undefined && both !== p.both)
          )
            continue;
          found.add(p.right === undefined ? both + rightOnly : both);
        }
      }
      return [...found].map(String);
    }
    case 'paths': {
      let count = 0;
      const walk = (at: string, seen: string[]): void => {
        if (at === p.end) {
          count++;
          return;
        }
        for (const [from, to] of p.edges)
          if (from === at && !seen.includes(to)) walk(to, [...seen, to]);
      };
      walk('A', ['A']);
      return [String(count)];
    }
    case 'numerals':
      return [
        String(
          p.terms.reduce(
            (sum, [digits, base]) => sum + Number.parseInt(digits, base),
            0,
          ),
        ),
      ];
    case 'file-selection':
      if (year === undefined)
        throw new Error('Для официального инвентаря нужен год источника.');
      return [String(selectedFiles(year, p).length)];
    // Contextual literary search needs the original texts and semantic interpretation.
    // Only the answer boundary is executable without redistributing that corpus.
    case 'file-search':
      return null;
  }
}
const fileSchema = z.array(
  z.strictObject({
    path: z.string(),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
);
export function sourceFiles(year: number) {
  return fileSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(`./data/files-${String(year)}.json`, import.meta.url),
        'utf8',
      ),
    ),
  );
}
export function selectedFiles(
  year: number,
  p: Extract<Parameters, { kind: 'file-selection' }>,
) {
  return sourceFiles(year).filter(
    (file) =>
      p.folders.some((folder) => file.path.startsWith(`DEMO-12/${folder}/`)) &&
      p.extensions.some((extension) =>
        file.path.toLowerCase().endsWith(extension),
      ),
  );
}
