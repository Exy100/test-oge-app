import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { generatorsForTask } from './index';
import { checkGeneratorSeed } from './quality';
import { createTaskDataset } from './task-dataset';
import { readZip } from '../datasets/zip';
import { referencePython } from './16/programs';
import {
  assessProgramRuns,
  equalProgramOutput,
  expectedProgramOutput,
  isProgramKind,
  parseProgramInput,
  programCases,
  programKinds,
  programParameters,
  sequenceInput,
  validateProgramParameters,
  type ProgramParameters,
} from './16/problems';

const completed = (stdout: string) => ({
  stdout,
  exitCode: 0,
  timedOut: false,
});
const seeds =
  fc.sample(fc.uniqueArray(fc.string(), { minLength: 500, maxLength: 500 }), {
    seed: 20261015,
    numRuns: 1,
  })[0] ?? [];
function oracle(p: ProgramParameters, input: string): string {
  const numbers = input.trim().split(/\s+/u).map(Number);
  if (p.kind === 'python-digits') {
    let n = numbers[0] ?? 0,
      count = 0,
      sum = 0;
    do {
      const digit = n % 10;
      if (digit % p.divisor === 0) {
        count++;
        sum += digit;
      }
      n = Math.floor(n / 10);
    } while (n > 0);
    return `${String(count)} ${String(sum)}\n`;
  }
  const count = numbers.shift();
  expect(numbers.length).toBe(count);
  if (p.kind === 'python-filter') {
    let matches = 0,
      sum = 0;
    for (const value of numbers)
      if (
        value >= p.threshold &&
        value / p.divisor === Math.trunc(value / p.divisor)
      ) {
        matches++;
        sum += value;
      }
    return `${String(matches)} ${String(sum)}\n`;
  }
  if (p.kind === 'python-pairs') {
    let matches = 0,
      best = -Infinity;
    for (let i = 1; i < numbers.length; i++) {
      const value = (numbers[i - 1] ?? 0) + (numbers[i] ?? 0);
      if (Number.isInteger(value / p.divisor)) {
        matches++;
        best = Math.max(best, value);
      }
    }
    return `${String(matches)} ${String(matches ? best : 0)}\n`;
  }
  const breaks = [
    -1,
    ...numbers.flatMap((value, index) => (value < p.threshold ? [index] : [])),
    numbers.length,
  ];
  return `${String(Math.max(...breaks.slice(1).map((value, index) => value - (breaks[index] ?? -1) - 1)))}\n`;
}
function runPython(
  groups: readonly { code: string; inputs: readonly string[] }[],
): string[][] {
  const result = spawnSync(
    'python3',
    ['-I', 'tests/fixtures/run-python16.py'],
    {
      input: JSON.stringify(groups),
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout) as string[][];
}
for (const generator of generatorsForTask(16))
  describe(generator.id, () => {
    test.each([0, 1, 2, 3])(
      '500 distinct seeds, batch %i: oracle, files, hashes and schema',
      async (batch) => {
        expect(seeds).toHaveLength(500);
        expect(new Set(seeds).size).toBe(500);
        if (!isProgramKind(generator.subtype))
          throw new Error('Unknown Python subtype');
        for (const seed of seeds.slice(batch * 125, (batch + 1) * 125)) {
          const task = generator.generate(seed),
            dataset = await createTaskDataset(task),
            p = programParameters(generator.subtype, seed),
            cases = programCases(p, seed);
          expect(readZip(dataset.archive)).toEqual(dataset.files);
          checkGeneratorSeed(generator, seed, {
            assertFiles() {
              for (const entry of dataset.manifest.files) {
                const bytes = dataset.files.get(entry.path);
                if (!bytes) throw new Error('Missing file');
                expect(createHash('sha256').update(bytes).digest('hex')).toBe(
                  entry.sha256,
                );
                expect(entry.license).toBe('CC0-1.0');
              }
              expect(dataset.files.size).toBe(27);
              return [dataset.manifest];
            },
            assertUnique() {
              expect(cases).toHaveLength(10);
              expect(new Set(cases.map((item) => item.id)).size).toBe(10);
              for (const item of cases) {
                expect(item.output).toBe(oracle(p, item.input));
                expect(
                  new TextDecoder().decode(
                    dataset.files.get(`tests/${item.id}.input.txt`),
                  ),
                ).toBe(item.input);
                expect(
                  new TextDecoder().decode(
                    dataset.files.get(`tests/${item.id}.expected.txt`),
                  ),
                ).toBe(item.output);
              }
              expect(
                new TextDecoder().decode(
                  dataset.files.get('reference/answer.py'),
                ),
              ).toBe(referencePython(p));
            },
            assertQuality(task) {
              expect(task.answer).toMatchObject({
                type: 'artifact',
                kind: 'program',
              });
              expect(task.criteria?.levels.map((level) => level.score)).toEqual(
                [0, 1, 2],
              );
              expect(task.solution).toHaveLength(3);
            },
          });
        }
      },
      30000,
    );
    test.each(['golden-1', 'golden-2', 'golden-3'])(
      'golden task and manifest %s',
      async (seed) => {
        const task = generator.generate(seed),
          dataset = await createTaskDataset(task);
        expect(task).toMatchSnapshot();
        expect(dataset.manifest).toMatchSnapshot();
        expect((await createTaskDataset(task)).archive).toEqual(
          dataset.archive,
        );
      },
    );
    test('identity, statement, code, criteria and foreign references are rejected', async () => {
      const task = generator.generate('negative');
      for (const changed of [
        { ...task, id: 'wrong' },
        { ...task, taskNumber: 15 as const },
        { ...task, examPart: 1 as const },
        { ...task, generatorId: 'wrong' },
        { ...task, subtype: 'wrong' },
        { ...task, datasetId: 'wrong' },
        { ...task, statement: task.statement + 'changed' },
        {
          ...task,
          solution: task.solution.map((step) => ({
            ...step,
            code: 'print(0)',
          })),
        },
        { ...task, criteria: { max: 2 as const, levels: [] } },
        {
          ...task,
          answer: {
            type: 'artifact' as const,
            kind: 'program' as const,
            referenceId: 'foreign',
          },
        },
        { ...task, variant13: 'document' as const },
      ]) {
        expect(generator.verify(changed)).toBe(false);
        await expect(createTaskDataset(changed)).rejects.toThrow();
      }
    });
  });
test('real Python 3 executes 500 seeds per subtype on all ten cases', () => {
  const groups = programKinds.flatMap((kind) =>
    seeds.map((seed) => {
      const p = programParameters(kind, seed),
        cases = programCases(p, seed);
      return {
        code: referencePython(p),
        inputs: cases.map((item) => item.input),
        expected: cases.map((item) => oracle(p, item.input)),
      };
    }),
  );
  expect(groups).toHaveLength(2000);
  const outputs = runPython(groups);
  expect(outputs).toEqual(groups.map((group) => group.expected));
}, 30000);
test('boundary mutations fail real Python tests instead of earning full credit', () => {
  const groups = programKinds.map((kind) => {
    const p = programParameters(kind, 'mutation'),
      cases = programCases(p, 'mutation');
    let code = referencePython(p);
    if (kind === 'python-filter') code = code.replace('and x >=', 'and x >');
    else if (kind === 'python-digits')
      code = code.replace('if n == 0:\n    count = 1\n', '');
    else if (kind === 'python-pairs')
      code = code.replace('count == 0 or pair_sum > best', 'pair_sum > best');
    else
      code = code.replace(
        'else:\n        current = 0',
        'else:\n        current = current',
      );
    expect(code).not.toBe(referencePython(p));
    return { code, inputs: cases.map((item) => item.input), p };
  });
  const outputs = runPython(groups);
  for (const [index, group] of groups.entries())
    expect(
      assessProgramRuns(
        group.p,
        'mutation',
        (outputs[index] ?? []).map(completed),
      ).score,
    ).toBeLessThan(2);
});
test('small inputs are exhaustively checked with an independent oracle', () => {
  for (const kind of programKinds) {
    const p = programParameters(kind, 'exhaustive');
    if (kind === 'python-digits') {
      for (let n = 0; n <= 2000; n++)
        expect(expectedProgramOutput(p, `${String(n)}\n`)).toBe(
          oracle(p, `${String(n)}\n`),
        );
    } else
      for (let n = 1; n <= 5; n++)
        for (let mask = 0; mask < 3 ** n; mask++) {
          const base = 'threshold' in p ? p.threshold : p.divisor;
          const values = Array.from(
              { length: n },
              (_, i) => base + (Math.floor(mask / 3 ** i) % 3) - 1,
            ),
            input = sequenceInput(values);
          expect(expectedProgramOutput(p, input)).toBe(oracle(p, input));
        }
  }
});
test('strict input boundaries and complete output evidence', () => {
  const p = programParameters('python-digits', 'invalid');
  for (const input of [
    '',
    '-1\n',
    '1000000000000\n',
    '1\n2\n',
    '00\n',
    '-0\n',
    '1.0\n',
    '9e2\n',
    '1\n\n',
    '1'.repeat(20001),
  ])
    expect(() => parseProgramInput(p, input)).toThrow();
  const run = programParameters('python-run', 'invalid');
  for (const input of [
    '0\n',
    '1001\n',
    '2\n1\n',
    '1\n10001\n',
    '1\n-10001\n',
    '1\n2\n3\n',
  ])
    expect(() => parseProgramInput(run, input)).toThrow();
  for (const invalid of [
    { kind: 'python-digits', divisor: 1 },
    { kind: 'python-digits' },
    { kind: 'python-digits', divisor: 2, threshold: 0 },
    { kind: 'python-run', threshold: 101 },
    { kind: 'python-run', threshold: NaN },
    { kind: 'python-run', threshold: 0.5 },
    { kind: 'python-filter', divisor: 2 },
    { kind: 'unknown' },
  ])
    expect(() => {
      validateProgramParameters(invalid as ProgramParameters);
    }).toThrow();
  expect(() => assessProgramRuns(p, 'score', [])).toThrow();
  const cases = programCases(p, 'score');
  expect(
    assessProgramRuns(
      p,
      'score',
      cases.map((item) => completed(item.output)),
    ).score,
  ).toBe(2);
  expect(
    assessProgramRuns(
      p,
      'score',
      cases.map(() => completed('')),
    ).score,
  ).toBe(0);
  expect(
    assessProgramRuns(
      p,
      'score',
      cases.map((item, i) => completed(i ? '' : item.output)),
    ).score,
  ).toBe(1);
  for (const failure of [
    { exitCode: 1, timedOut: false },
    { exitCode: null, timedOut: false },
    { exitCode: 0, timedOut: true },
  ])
    expect(
      assessProgramRuns(
        p,
        'score',
        cases.map((item) => ({ stdout: item.output, ...failure })),
      ).score,
    ).toBe(0);
  expect(equalProgramOutput('1 -2\n', '\t+01\r\n-02\n')).toBe(true);
  expect(equalProgramOutput('0 0', '-0\n+0')).toBe(true);
  for (const actual of [
    '',
    '1 -2 0',
    '1',
    '1 -2 ответ',
    '1.0 -2',
    '1e0 -2',
    'NaN -2',
    'Infinity -2',
    '1 '.repeat(600),
    '9007199254740992',
  ])
    expect(equalProgramOutput('1 -2', actual)).toBe(false);
  expect(equalProgramOutput('', '')).toBe(false);
});
test.each(Array.from({ length: 12 }, (_, i) => i))(
  'committed Python sample %i reproduces exact bytes',
  async (i) => {
    const generator = generatorsForTask(16)[i % 4];
    if (!generator) throw new Error('Missing Python generator');
    const dataset = await createTaskDataset(
      generator.generate(`python-review:${String(i)}`),
    );
    expect(
      await readFile(
        `samples/16-files/${String(i + 1).padStart(2, '0')}/dataset.zip`,
      ),
    ).toEqual(Buffer.from(dataset.archive));
  },
);
