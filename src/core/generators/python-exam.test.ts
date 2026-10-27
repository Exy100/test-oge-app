import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { pythonFixtures } from '../../../tests/fixtures/exam/practice';
import { localPythonChecker } from './16/local-checker';
import {
  equalProgramOutput,
  examProgramKinds,
  expectedProgramOutput,
  parseProgramInput,
  programCases,
  programOutputPolicy,
  programParameters,
  type ProgramOutputPolicy,
} from './16/problems';
import { referencePython } from './16/programs';
import { generatorsForTask } from './index';
import { createTaskDataset } from './task-dataset';

const comparisons: readonly [string, string, ProgramOutputPolicy, boolean][] = [
  ['8.5 2', '8.500000\n+02', 'positive-mean', true],
  ['8.5 2', '8.5e0 2', 'positive-mean', true],
  ['5 1', '5.0 1', 'positive-mean', true],
  ['1.3333333333333333 3', '1.333333 3', 'positive-mean', true],
  ['8.5 2', '8.5000005 2', 'positive-mean', true],
  ['8.5 2', '8.500002 2', 'positive-mean', false],
  ['9999.5 2', '9999.51 2', 'positive-mean', false],
  ['8.5 2', '8 2', 'positive-mean', false],
  ['8.5 2', '8.5 3', 'positive-mean', false],
  ['8.5 2', '8.5 2.0', 'positive-mean', false],
  ['8.5 2', '8,5 2', 'positive-mean', false],
  ['8.5 2', 'NaN 2', 'positive-mean', false],
  ['8.5 2', 'Infinity 2', 'positive-mean', false],
  ['8.5 2', '1e999 2', 'positive-mean', false],
  ['8.5 2', '8.5 2 ответ', 'positive-mean', false],
  ['8.5 2', '', 'positive-mean', false],
  ['8.5 2', '8.5', 'positive-mean', false],
  ['', '', 'positive-mean', false],
  ['8.5 2', `${'0'.repeat(1024)}8.5 2`, 'positive-mean', false],
  ['8.5 2', '8.5 9007199254740992', 'positive-mean', false],
  ['23', '+023', 'integer', true],
  ['23', '23.0', 'integer', false],
  ['23', '2.3e1', 'integer', false],
  ['23', '23 0', 'integer', false],
  ['9007199254740992', '9007199254740992', 'integer', false],
];
test('TypeScript and exported Python apply the same numeric output contract', () => {
  const result = spawnSync(
    'python3',
    [
      '-I',
      '-c',
      'import json, sys\ndata = json.load(sys.stdin)\nnamespace = {"__name__": "checker_test"}\nexec(data["code"], namespace)\njson.dump([namespace["equal_output"](a, b, policy) for a, b, policy, target in data["cases"]], sys.stdout)',
    ],
    {
      input: JSON.stringify({ code: localPythonChecker, cases: comparisons }),
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const expected = comparisons.map(([a, b, policy, target]) => {
    expect(equalProgramOutput(a, b, policy), `${a}: ${b}`).toBe(target);
    return target;
  });
  expect(JSON.parse(result.stdout)).toEqual(expected);
});

for (const [index, kind] of examProgramKinds.entries())
  describe(kind, () => {
    test('official cases pass the product parser, computed answers and real reference', async () => {
      const fixture = pythonFixtures[index];
      if (!fixture) throw new Error('Missing official fixture');
      const p = programParameters(kind, 'official');
      for (const example of fixture.cases) {
        expect(
          equalProgramOutput(
            example.output,
            expectedProgramOutput(p, example.input),
            programOutputPolicy(p),
          ),
        ).toBe(true);
        const result = spawnSync('python3', ['-I', '-c', referencePython(p)], {
          input: example.input,
          encoding: 'utf8',
          timeout: 2000,
        });
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr).toBe(0);
        expect(
          equalProgramOutput(
            example.output,
            result.stdout,
            programOutputPolicy(p),
          ),
        ).toBe(true);
      }
      const generator = generatorsForTask(16).find(
        (item) => item.subtype === kind,
      );
      if (!generator) throw new Error('Missing exam generator');
      const task = generator.generate('official');
      const dataset = await createTaskDataset(task);
      const manifest = JSON.parse(
        new TextDecoder().decode(dataset.files.get('tests/index.json')),
      ) as { outputPolicy: string };
      expect(manifest.outputPolicy).toBe(programOutputPolicy(p));
      expect(task.statement).toContain('Пример вывода');
      expect(programCases(p, 'official')).toHaveLength(10);
      expect(task.hints).toHaveLength(3);
    });
  });

test('mean input requires a positive value, base7 values are natural, sentinel is unique and final', () => {
  const mean = programParameters('python-positive-mean', 'bounds');
  for (const input of ['1\n0\n', '2\n-1\n0\n'])
    expect(() => parseProgramInput(mean, input)).toThrow();
  const sum = programParameters('python-base7-sum', 'bounds');
  for (const input of ['1\n0\n', '1\n-1\n'])
    expect(() => parseProgramInput(sum, input)).toThrow();
  const sentinel = programParameters('python-octal-sentinel', 'bounds');
  expect(parseProgramInput(sentinel, '0\n')).toEqual([]);
  expect(parseProgramInput(sentinel, '517\r\n4093\r\n0\r\n')).toEqual([
    517, 4093,
  ]);
  for (const input of [
    '517\n',
    '0\n517\n0\n',
    '517\n0\n0\n',
    '-1\n0\n',
    '10001\n0\n',
    `${'1\n'.repeat(1001)}0\n`,
  ])
    expect(() => parseProgramInput(sentinel, input)).toThrow();
});
