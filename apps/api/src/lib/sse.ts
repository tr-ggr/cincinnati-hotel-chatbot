import type { OutgoingHttpHeaders } from 'node:http';
import type { FastifyReply } from 'fastify';

export interface SseStream {
  /** Writes `event: <event>\ndata: <JSON>\n\n`. No-op after close. */
  send(event: string, data: unknown): void;
  close(): void;
  readonly closed: boolean;
}

const PING_MS = 20_000;

/**
 * Hijacks the reply and turns it into an SSE stream (the route handler should then just
 * await a promise that resolves on close, or simply return; Fastify ignores hijacked replies).
 * `onClose` runs once when the stream closes (client disconnect or close()).
 */
export function openSse(reply: FastifyReply, onClose?: () => void): SseStream {
  reply.hijack();
  const raw = reply.raw;
  // Hijacked replies skip Fastify's onSend hooks, so carry over headers already set (e.g. CORS).
  const carried: OutgoingHttpHeaders = { ...(reply.getHeaders() as OutgoingHttpHeaders) };
  raw.writeHead(200, {
    ...carried,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  raw.write(': ping\n\n');

  let closed = false;
  const timer = setInterval(() => {
    if (!closed) raw.write(': ping\n\n');
  }, PING_MS);

  const close = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    onClose?.();
    if (!raw.writableEnded) raw.end();
  };
  reply.request.raw.on('close', close);

  return {
    send(event, data) {
      if (closed) return;
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close,
    get closed() {
      return closed;
    },
  };
}
