import {
  FeedbackError,
  feedbackRequestSchema,
  type FeedbackProvider,
} from './contract';

const examples = {
  correct: `### Пример для верного ответа
Заготовка для случая, когда проверка уже засчитала ответ.

### Как проверить решение
1. Сверь единицы измерения и формат ответа с условием.
2. Повтори вычисления другим способом или проверь найденное значение подстановкой.
3. Сравни свой ход решения с разбором по шагам.

### Проверь себя
Как ты объяснишь выбор первого действия без готового ответа?`,
  incorrect: `### Пример для неверного ответа
Заготовка для случая, когда ответ не совпал с эталоном.

### С чего начать
1. Выпиши, что требуется найти и в каком виде записать ответ.
2. Проверь единицы, границы диапазона и порядок действий.
3. Открой первую подсказку и сопоставь её со своим черновиком.

### Проверь себя
На каком шаге можно независимо проверить промежуточный результат?`,
};

function pause(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(finish, 60);
    function cancel() {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new DOMException('Получение разбора остановлено.', 'AbortError'));
    }
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/** Deliberately local examples; no network, model, grading or persistence. */
export const demoFeedbackProvider: FeedbackProvider = {
  async *streamFeedback(input, signal) {
    signal.throwIfAborted();
    const parsed = feedbackRequestSchema.safeParse(input);
    if (!parsed.success) throw new FeedbackError('invalid-request');
    const request = parsed.data;
    const [{ generators }, { checkTaskAnswer }] = await Promise.all([
      import('../../core/generators'),
      import('../../core/checker'),
    ]);
    signal.throwIfAborted();
    const generator = generators.find(
      (item) => item.id === request.generatorId && item.taskNumber <= 12,
    );
    if (!generator) throw new FeedbackError('invalid-request');
    const check = checkTaskAnswer(
      generator.generate(request.seed),
      request.answer,
    );
    if (check.verdict === 'format_error')
      throw new FeedbackError('invalid-request');
    const text = examples[check.verdict];
    for (let offset = 0; offset < text.length; offset += 48) {
      await pause(signal);
      signal.throwIfAborted();
      yield text.slice(offset, offset + 48);
    }
  },
};
