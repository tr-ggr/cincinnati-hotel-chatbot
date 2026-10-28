import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { PDFParse } from 'pdf-parse';
import {
  activateDocument,
  failDocument,
  getActiveDocument,
  insertDocument,
  toDocumentInfo,
} from '../db/queries.js';
import { emitStatsChanged, onStatsChanged } from '../lib/events.js';
import { openSse, openSseCount } from '../lib/sse.js';
import { getStats } from '../lib/stats.js';
import { UPLOAD_RATE_LIMIT_MAX } from '../config.js';
import type { RouteDeps } from './sessions.js';

const MIN_TEXT_CHARS = 200;

async function rmQuiet(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

async function hasPdfMagic(file: string): Promise<boolean> {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(5);
    const { bytesRead } = await fh.read(buf, 0, 5, 0);
    return bytesRead === 5 && buf.toString('latin1') === '%PDF-';
  } finally {
    await fh.close();
  }
}

async function parsePdf(file: string): Promise<{ pages: number; chars: number }> {
  const data = new Uint8Array(await readFile(file));
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return { pages: result.total, chars: result.text.replace(/\s+/g, '').length };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

export const adminRoutes: FastifyPluginAsync<RouteDeps> = async (app, { config, n8n }) => {
  await mkdir(config.uploadDir, { recursive: true });

  app.get('/api/admin/document', async () => {
    const doc = await getActiveDocument();
    return { document: doc ? toDocumentInfo(doc) : null };
  });

  // Each upload runs a full ingest (embeddings), so it gets a stricter per-IP limit than the global 60/min.
  const uploadRouteOpts = { config: { rateLimit: { max: UPLOAD_RATE_LIMIT_MAX, timeWindow: '1 minute' } } };

  app.post('/api/admin/document', uploadRouteOpts, async (request, reply) => {
    const started = performance.now();
    // One summary line per upload: outcome + latency (no file contents).
    const logUpload = (outcome: string, extra: Record<string, unknown> = {}) =>
      request.log.info(
        { event: 'upload', outcome, latencyMs: Math.round(performance.now() - started), ...extra },
        'upload ' + outcome,
      );

    if (!request.isMultipart()) {
      logUpload('invalid_pdf');
      return fail(reply, 422, 'INVALID_PDF', 'Expected a multipart/form-data upload with a "file" field.');
    }
    const upload = await request.file();
    if (!upload || upload.fieldname !== 'file') {
      logUpload('invalid_pdf');
      return fail(reply, 422, 'INVALID_PDF', 'Missing "file" field.');
    }

    const id = randomUUID();
    const file = path.resolve(config.uploadDir, `${id}.pdf`);
    const filename = upload.filename || 'document.pdf';

    try {
      await pipeline(upload.file, createWriteStream(file));
    } catch (err) {
      await rmQuiet(file);
      throw err;
    }
    if (upload.file.truncated) {
      await rmQuiet(file);
      logUpload('file_too_large');
      return fail(reply, 413, 'FILE_TOO_LARGE', `File exceeds the ${config.maxUploadMb} MB limit.`);
    }

    if (!(await hasPdfMagic(file))) {
      await rmQuiet(file);
      logUpload('invalid_pdf', { sizeBytes: upload.file.bytesRead });
      return fail(reply, 422, 'INVALID_PDF', 'The uploaded file is not a PDF.');
    }

    let parsed: { pages: number; chars: number };
    try {
      parsed = await parsePdf(file);
    } catch (err) {
      request.log.warn({ err }, 'pdf parse failed');
      await rmQuiet(file);
      logUpload('invalid_pdf', { sizeBytes: upload.file.bytesRead });
      return fail(reply, 422, 'INVALID_PDF', 'The PDF could not be read.');
    }
    if (parsed.chars < MIN_TEXT_CHARS) {
      await rmQuiet(file);
      logUpload('empty_pdf', { sizeBytes: upload.file.bytesRead, pageCount: parsed.pages });
      return fail(reply, 422, 'EMPTY_PDF', 'The PDF contains no extractable text (scanned or empty).');
    }

    const row = await insertDocument({ id, filename, sizeBytes: upload.file.bytesRead, pageCount: parsed.pages });

    try {
      const res = await n8n.ingest({
        document_id: id,
        filename,
        file_url: `${config.internalBaseUrl}/internal/documents/${id}/file`,
      });
      const { document, previous } = await activateDocument(row.id, res.chunk_count);
      if (previous) await rmQuiet(path.resolve(config.uploadDir, `${previous.id}.pdf`)).catch(() => undefined);
      emitStatsChanged();
      logUpload('ready', {
        documentId: id,
        sizeBytes: document.sizeBytes,
        pageCount: document.pageCount,
        chunkCount: document.chunkCount,
        replacedDocumentId: previous?.id ?? null,
      });
      return { document: toDocumentInfo(document) };
    } catch (err) {
      request.log.error({ err }, 'ingest failed');
      const message = err instanceof Error ? err.message : 'Ingestion failed';
      await failDocument(id, message).catch(() => undefined);
      await rmQuiet(file).catch(() => undefined);
      emitStatsChanged();
      logUpload('ingest_failed', { documentId: id });
      return fail(reply, 502, 'INGEST_FAILED', 'Failed to process the document. Please try again.');
    }
  });

  app.get('/api/admin/stats', async () => getStats());

  // Long-lived stream: exempt from rate limiting (EventSource reconnects must never be refused).
  app.get('/api/admin/stats/stream', { config: { rateLimit: false } }, async (request, reply) => {
    let unsubscribe: () => void = () => undefined;
    const opened = performance.now();
    const sse = openSse(reply, () => {
      unsubscribe();
      request.log.info(
        { event: 'sse', outcome: 'closed', durationMs: Math.round(performance.now() - opened), open: openSseCount() },
        'stats stream closed',
      );
    });
    request.log.info({ event: 'sse', outcome: 'opened', open: openSseCount() }, 'stats stream opened');
    try {
      sse.send('stats', await getStats());
    } catch (err) {
      request.log.error({ err }, 'initial stats snapshot failed');
    }
    unsubscribe = onStatsChanged(() => {
      getStats()
        .then((s) => sse.send('stats', s))
        .catch((err: unknown) => request.log.error({ err }, 'stats snapshot failed'));
    });
    if (sse.closed) unsubscribe();
  });
};
