export type TransportCode =
  'configuration' | 'cancelled' | 'timeout' | 'upstream' | 'invalid-response';

const failures = {
  configuration: { status: 503, message: 'Сервис разбора недоступен.' },
  cancelled: { status: 499, message: 'Получение разбора остановлено.' },
  timeout: {
    status: 504,
    message: 'Разбор не успел загрузиться. Попробуй ещё раз.',
  },
  upstream: { status: 503, message: 'Сервис разбора временно недоступен.' },
  'invalid-response': {
    status: 502,
    message: 'Не удалось получить корректный разбор.',
  },
} as const;

export class TransportError extends Error {
  readonly status: number;
  constructor(readonly code: TransportCode) {
    super(failures[code].message);
    this.status = failures[code].status;
  }
}

export function safeFailure(cause: unknown): TransportError {
  return cause instanceof TransportError
    ? cause
    : new TransportError('upstream');
}

/** One deadline covers fetch, fallback, JSON retry and the entire response body. */
export class CallScope {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly parent: AbortSignal;
  private readonly cancel = () => {
    this.abort('cancelled');
  };

  constructor(parent: AbortSignal) {
    this.parent = parent;
    this.timer = setTimeout(() => {
      this.abort('timeout');
    }, 30_000);
    parent.addEventListener('abort', this.cancel, { once: true });
    if (parent.aborted) this.cancel();
  }

  abort(code: 'cancelled' | 'timeout') {
    if (!this.signal.aborted) this.controller.abort(new TransportError(code));
  }

  check() {
    if (this.signal.aborted) throw safeFailure(this.signal.reason);
  }

  wait<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        this.signal.removeEventListener('abort', abort);
        reject(safeFailure(this.signal.reason));
      };
      this.signal.addEventListener('abort', abort, { once: true });
      promise.then(
        (value) => {
          this.signal.removeEventListener('abort', abort);
          if (this.signal.aborted) abort();
          else resolve(value);
        },
        (cause: unknown) => {
          this.signal.removeEventListener('abort', abort);
          reject(
            this.signal.aborted
              ? safeFailure(this.signal.reason)
              : safeFailure(cause),
          );
        },
      );
      if (this.signal.aborted) abort();
    });
  }

  close() {
    clearTimeout(this.timer);
    this.parent.removeEventListener('abort', this.cancel);
  }
}

export function discard(body: ReadableStream<Uint8Array> | null) {
  if (body) void body.cancel().catch(() => undefined);
}

export async function* readBytes(response: Response, scope: CallScope) {
  const limit = 1_048_576;
  const length = response.headers.get('Content-Length');
  if (
    !response.body ||
    (length && /^\d+$/u.test(length) && Number(length) > limit)
  ) {
    discard(response.body);
    throw new TransportError('invalid-response');
  }
  const reader = response.body.getReader();
  let total = 0;
  let complete = false;
  try {
    for (;;) {
      const { value, done } = await scope.wait(reader.read());
      if (done) {
        complete = true;
        return;
      }
      total += value.byteLength;
      if (total > limit) throw new TransportError('invalid-response');
      yield value;
    }
  } finally {
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function readText(response: Response, scope: CallScope) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  try {
    for await (const bytes of readBytes(response, scope))
      text += decoder.decode(bytes, { stream: true });
    return text + decoder.decode();
  } catch (cause) {
    if (cause instanceof TransportError) throw cause;
    throw new TransportError('invalid-response');
  }
}
