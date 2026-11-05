const attemptTimeoutMs = 120_000;
const maxAttempts = 2;

/** RouterAI budgets shared by the server, local bridge and browser. */
export const routerAiExecution = {
  maxTokens: 4000,
  attemptTimeoutMs,
  maxAttempts,
  clientTimeoutMs: attemptTimeoutMs * maxAttempts + 5000,
} as const;
