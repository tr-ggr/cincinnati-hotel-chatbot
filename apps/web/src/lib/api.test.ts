import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createLead,
  createSession,
  getDocument,
  getHealth,
  isApiError,
  MAX_UPLOAD_BYTES,
  sendMessage,
  uploadDocument,
} from './api';

function stubFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('creates a session with an empty JSON body', async () => {
    const fetch = stubFetch(json({ id: 's1', startedAt: 'now' }, 201));
    await expect(createSession()).resolves.toEqual({ id: 's1', startedAt: 'now' });
    expect(fetch).toHaveBeenCalledWith('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  });

  it('encodes the session id and sends the message content', async () => {
    const fetch = stubFetch(json({ userMessage: {}, assistantMessage: {}, offerContactForm: false }));
    await sendMessage('a/b', 'hello');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/sessions/a%2Fb/messages');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'hello' });
  });

  it('unwraps the document', async () => {
    stubFetch(json({ document: null }));
    await expect(getDocument()).resolves.toBeNull();
  });

  it('maps the error envelope to ApiError', async () => {
    stubFetch(json({ error: { code: 'NO_DOCUMENT', message: 'No document yet' } }, 409));
    const err = await sendMessage('s', 'hi').catch((e: unknown) => e);
    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({ status: 409, code: 'NO_DOCUMENT', message: 'No document yet' });
  });

  it('falls back to HTTP_<status> for non-JSON errors', async () => {
    stubFetch(new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(createLead({ sessionId: 's', name: 'n', phone: 'p', email: 'e' })).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_502',
      message: 'Bad Gateway',
    });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const err = await createSession().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK_ERROR');
  });

  it('reports a non-JSON success body as BAD_RESPONSE', async () => {
    stubFetch(new Response('ok', { status: 200 }));
    await expect(createSession()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('returns the accepted (processing) document from a 202 upload', async () => {
    const doc = { id: 'd1', filename: 'guide.pdf', status: 'processing' };
    const fetch = stubFetch(json({ document: doc }, 202));
    const file = new File(['%PDF-1.7'], 'guide.pdf', { type: 'application/pdf' });
    await expect(uploadDocument(file)).resolves.toEqual(doc);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/document');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('rejects a 503 health check so callers can treat it as unknown', async () => {
    stubFetch(json({ ok: false, db: 'down', n8n: 'up', activeDocument: false }, 503));
    await expect(getHealth()).rejects.toMatchObject({ status: 503 });
  });
});
