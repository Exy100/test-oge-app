import { buildExamVariant } from './result-variant';
import { z } from '../zod';

const identity = z.strictObject({
  variantId: z.string().min(1).max(240),
  seed: z.string().max(200),
  variant13: z.enum(['presentation', 'document']),
});
addEventListener('message', (event: MessageEvent<unknown>) => {
  try {
    postMessage({
      ok: true,
      variant: buildExamVariant(identity.parse(event.data)),
    });
  } catch (cause) {
    postMessage({
      ok: false,
      error:
        cause instanceof Error
          ? cause.message
          : 'Не удалось восстановить вариант.',
    });
  }
});
