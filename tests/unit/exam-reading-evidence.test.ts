import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { z } from '../../src/core/zod';
import { checkAnswer } from '../../src/core/checker';
import { shortFixtures, answerFormat } from '../fixtures/exam/short-answers';

const proofs = z
  .array(
    z.strictObject({
      fixtureId: z.string(),
      year: z.number().int(),
      member: z.string(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/u),
      response: z.enum(['nickname', 'character', 'role']),
      excerpt: z.string().min(20),
    }),
  )
  .length(3)
  .parse(
    JSON.parse(
      readFileSync(
        new URL('../fixtures/exam/data/reading-evidence.json', import.meta.url),
        'utf8',
      ),
    ),
  );
for (const proof of proofs)
  test(`${proof.fixtureId}: original corpus context supports the published answer and its grammatical form`, () => {
    const fixture = shortFixtures.find(({ id }) => id === proof.fixtureId);
    if (!fixture || fixture.parameters.kind !== 'file-search')
      throw new Error('Source fixture missing');
    expect(proof.year).toBe(fixture.year);
    expect(proof.response).toBe(fixture.parameters.response);
    expect(proof.member).toContain(fixture.parameters.author);
    let word: string | undefined;
    if (proof.response === 'nickname')
      word = /Щенок ([А-ЯЁа-яё]+), взятый «приучаться»/u.exec(
        proof.excerpt,
      )?.[1];
    else if (proof.response === 'character') {
      const genitive = /лицо ([А-ЯЁа-яё]+)/u.exec(proof.excerpt)?.[1];
      expect(genitive).toBe('Плюшкина');
      expect(proof.excerpt).toContain('Мавра!');
      expect(proof.excerpt).toContain('– Куда ты дела, разбойница, бумагу?');
      word = 'Плюшкин'; // Source has the genitive; the question asks for the surname.
    } else {
      const dative = /Елдырин, – обращается надзиратель к ([а-яё]+),/u.exec(
        proof.excerpt,
      )?.[1];
      expect(dative).toBe('городовому');
      word = 'городовой'; // Nominative occupational title requested by the question.
    }
    if (!word) throw new Error('Narrative answer missing');
    expect(checkAnswer(answerFormat(fixture), word).verdict).toBe('correct');
    expect(fixture.answers.map((answer) => answer.toLowerCase())).toContain(
      word.toLowerCase(),
    );
  });
