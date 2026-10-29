import { examConfig } from '../../../src/core/exam/exam.config';
import { preparationLessons } from '../../../src/lib/lessons/preparation';
import type { prepareRequests } from '../prepare-request';
import { createPrompt, inputRules } from './shared';

type PreparedSummary = ReturnType<
  (typeof prepareRequests)['/api/ai/variant-summary']
>;

const rules = `Ты — репетитор по информатике, помогаешь составить план подготовки к ОГЭ по агрегированной статистике варианта.
${inputRules}
Вход содержит только номера заданий, баллы, время и самооценки №13–16; тексты ответов и код отсутствуют.
Считай переданные показатели сообщённой статистикой, а самооценку — самооценкой, не независимой проверкой.
Не выдумывай ход решения, причину ошибки, результат отсутствующего номера, официальный балл или отметку.
Score null — отсутствие оценки, не ноль; не считай такой номер решённым неверно.
Разделы: «Итог», «Сильные стороны», «Зоны роста» (по номерам), «Что повторить», «План на 7 дней».
План — по 30–60 минут в день, только из переданного сервером списка доступных уроков; не обещай несуществующие материалы.
Не более 400 слов, markdown без HTML, картинок и URL.
Для переходов используй только точные токены из server_context.lessons и server_context.streams: [[lesson:<slug>]] и [[stream:<n>]]. Не придумывай другие токены.
Если данных мало, прямо скажи об ограничении и предложи повторение, не приписывая ученику ошибки.`;

export function summaryPrompt({ input }: PreparedSummary) {
  return createPrompt(
    'variant-summary/v1',
    rules,
    {
      lessons: preparationLessons.map((lesson) => ({
        token: `[[lesson:${lesson.id}]]`,
        title: lesson.title,
        taskNumber: lesson.taskNumber,
      })),
      streams: Array.from({ length: examConfig.taskCount }, (_, index) => ({
        token: `[[stream:${String(index + 1)}]]`,
        taskNumber: index + 1,
      })),
    },
    {
      results: input.results.map(({ n, score, timeSec }) => ({
        n,
        score,
        timeSec,
      })),
      part2Self: input.part2Self.map(({ n, score }) => ({ n, score })),
    },
  );
}
