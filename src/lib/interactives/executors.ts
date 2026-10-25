import {
  executeCommands,
  executorSolutions,
  type ExecutorProblem,
} from '../../core/generators/exam/short-problems';

export const executorLabs = {
  multiply: {
    title: 'Умножение и прибавление',
    problem: {
      kind: 'executor',
      start: 2,
      end: 8,
      multiplier: 2,
      add: 2,
      limit: 5,
    },
  },
  square: {
    title: 'Квадрат и прибавление',
    problem: {
      kind: 'executor',
      start: 2,
      end: 16,
      square: true,
      add: 2,
      limit: 5,
    },
  },
} as const satisfies Record<
  string,
  { title: string; problem: ExecutorProblem }
>;

export function executorTrace(
  problem: ExecutorProblem,
  program: string,
): bigint[] {
  if (!/^[12]{0,5}$/u.test(program))
    throw new RangeError(
      'Введи до пяти команд: только цифры 1 и 2 без пробелов.',
    );
  // Validate the task with the same bounds as the exam checker, including square mode.
  executorSolutions(problem);
  return Array.from({ length: program.length + 1 }, (_, step) =>
    executeCommands(problem, program.slice(0, step)),
  );
}

export function checkExecutor(
  problem: ExecutorProblem,
  program: string,
): boolean {
  const trace = executorTrace(problem, program);
  return program.length > 0 && trace.at(-1) === BigInt(problem.end);
}
