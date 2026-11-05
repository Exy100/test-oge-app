export function nativeEvent(type: string, data: Record<string, unknown> = {}) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}
export function nativeStream(text = 'Разбор готов.', stop = 'end_turn') {
  return (
    nativeEvent('message_start') +
    nativeEvent('content_block_start', {
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    }) +
    nativeEvent('content_block_delta', {
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'PRIVATE_THINKING' },
    }) +
    nativeEvent('content_block_stop', { index: 0 }) +
    nativeEvent('content_block_start', {
      index: 1,
      content_block: { type: 'text', text: '' },
    }) +
    nativeEvent('content_block_delta', {
      index: 1,
      delta: { type: 'text_delta', text },
    }) +
    nativeEvent('content_block_stop', { index: 1 }) +
    nativeEvent('message_delta', {
      delta: { stop_reason: stop },
      usage: { output_tokens: 100 },
    }) +
    nativeEvent('message_stop')
  );
}
export function nativeStreamResponse(text?: string, stop?: string) {
  return new Response(nativeStream(text, stop), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
export function nativeCompletion(grade: unknown, stop = 'end_turn') {
  return Response.json({
    type: 'message',
    stop_reason: stop,
    content: [
      { type: 'thinking', thinking: 'PRIVATE_THINKING' },
      {
        type: 'text',
        text: typeof grade === 'string' ? grade : JSON.stringify(grade),
      },
    ],
  });
}
