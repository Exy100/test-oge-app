import { z } from '../../src/core/zod';
import { parseGrade } from './grade-response';
import type { preparePart2 } from './prepare-request';
import { TransportError } from './transport';

const envelope = z.object({
  type: z.literal('message'),
  stop_reason: z.literal('end_turn'),
  content: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), text: z.string().max(12_000) }),
      z.object({ type: z.literal('thinking') }),
      z.object({ type: z.literal('redacted_thinking') }),
    ]),
  ),
});

export function parseAnthropicGrade(
  raw: string,
  assessment: ReturnType<typeof preparePart2>['assessment'],
) {
  try {
    const message = envelope.parse(JSON.parse(raw) as unknown);
    const content = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    return parseGrade(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: 'stop' }],
      }),
      assessment,
    );
  } catch {
    throw new TransportError('invalid-response');
  }
}
