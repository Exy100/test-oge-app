import { expect, test } from 'vitest';
import { taskExample } from '../../../tests/fixtures/model-examples';
import type { Generator } from '../types';
import { Rng } from '../rng';
import { validateGeneratedTask } from './harness';

const generator: Generator = {
  id: 'bytes-to-bits-test',
  taskNumber: 1,
  subtype: 'bytes-to-bits',
  title: 'Перевод байтов в биты',
  generate(seed) {
    const bytes = new Rng(seed).int(2, 128);
    const bits = bytes * 8;
    return {
      ...taskExample(),
      id: `bytes:${seed}`,
      generatorId: this.id,
      subtype: this.subtype,
      seed,
      statement: `Сколько бит в ${String(bytes)} байтах?`,
      answer: { type: 'integer', value: String(bits) },
      solution: [
        { text: 'В байте восемь бит.' },
        { text: `Умножаем ${String(bytes)} на 8.` },
        { text: `Ответ: ${String(bits)}.` },
      ],
      commonMistakes: [
        { answer: String(bytes), explanation: 'Нужно перевести байты в биты.' },
        { answer: String(bytes / 8), explanation: 'Умножай, а не дели.' },
      ],
    };
  },
  verify(task) {
    const bytes = Number(task.statement.match(/\d+/u)?.[0]);
    return (
      task.answer.type === 'integer' &&
      BigInt(task.answer.value) / 8n === BigInt(bytes) &&
      BigInt(task.answer.value) % 8n === 0n
    );
  },
};

test('harness consumes exported schema for a functioning generator on 500 seeds', () => {
  const answers = new Set<string>();
  for (let index = 0; index < 500; index += 1) {
    const seed = String(index);
    const task = validateGeneratedTask(generator, seed);
    expect(task).toEqual(validateGeneratedTask(generator, seed));
    if (task.answer.type === 'integer') answers.add(task.answer.value);
  }
  expect(answers.size).toBeGreaterThan(100);
});
test('schema failure stops independent verification', () => {
  let verified = false;
  const broken: Generator = {
    ...generator,
    generate: (seed) => ({ ...generator.generate(seed), hints: ['', '', ''] }),
    verify: () => {
      verified = true;
      return true;
    },
  };
  expect(() => validateGeneratedTask(broken, '1')).toThrow();
  expect(verified).toBe(false);
});
test.each(['generatorId', 'subtype', 'seed'] as const)(
  'harness rejects mismatched %s',
  (field) => {
    const broken: Generator = {
      ...generator,
      generate: (seed) => ({ ...generator.generate(seed), [field]: 'wrong' }),
    };
    expect(() => validateGeneratedTask(broken, '1')).toThrow('Метаданные');
  },
);
test('harness rejects wrong task number and schema-valid wrong answer', () => {
  const number: Generator = {
    ...generator,
    generate: (seed) => ({ ...generator.generate(seed), taskNumber: 2 }),
  };
  expect(() => validateGeneratedTask(number, '1')).toThrow('Метаданные');
  const answer: Generator = {
    ...generator,
    generate: (seed) => ({
      ...generator.generate(seed),
      answer: { type: 'integer', value: '1' },
    }),
  };
  expect(() => validateGeneratedTask(answer, '1')).toThrow(
    'Независимая проверка',
  );
});
