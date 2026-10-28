import type { OutgoingHttpHeaders } from 'node:http';
import type { FastifyReply } from 'fastify';

export interface SseStream {
  /** Writes `event: <event>\ndata: <JSON>\n\n`. No-op after close. */
  send(event: string, data: unknown): void;
  close(): void;
  readonly closed: boolean;
}

const PING_MS = 20_000;
/** EventSource reconnect delay advertised to clients (`retry:` field), in ms. */
const RETRY_MS = 3_000;

/** Every open stream, so graceful shutdown can end them (see closeAllSse). */
const open = new Set<SseStream>();

/** Number of currently open SSE streams. */
export function openSseCount(): number {
  return open.size;
}

/**
 * Ends every open SSE stream (used on shutdown). Clients see the stream end and, being EventSource,
 * reconnect after `retry` ms — to the restarted server. Returns how many streams were closed.
 */
export function closeAllSse(): number {
  const streams = [...open];
  for (const s of streams) s.close();
  return streams.length;
}

/**
 * Hijacks the reply and turns it into an SSE stream (the route handler should then just
 * await a promise that resolves on close, or simply return; Fastify ignores hijacked replies).
 * `onClose` runs once when the stream closes (client disconnect or close()).
 */
export function openSse(reply: FastifyReply, onClose?: () => void): SseStream {
  reply.hijack();
  const raw = reply.raw;
  // Hijacked replies skip Fastify's onSend hooks, so carry over headers already set (e.g. CORS, x-request-id).
  const carried: OutgoingHttpHeaders = { ...(reply.getHeaders() as OutgoingHttpHeaders) };
  raw.writeHead(200, {
    ...carried,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  raw.write(`retry: ${RETRY_MS}\n: ping\n\n`);

  let closed = false;
  const timer = setInterval(() => {
    if (!closed) raw.write(': ping\n\n');
  }, PING_MS);

  const stream: SseStream = {
    send(event, data) {
      if (closed) return;
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      open.delete(stream);
      clearInterval(timer);
      onClose?.();
      if (!raw.writableEnded) raw.end();
    },
    get closed() {
      return closed;
    },
  };
  open.add(stream);
  reply.request.raw.on('close', () => stream.close());
  return stream;
}
