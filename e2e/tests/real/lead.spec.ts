import { expect, test } from '@playwright/test';
import { CANNED_FALLBACK, HELIPAD_Q, N8N_URL, isMockMode, leadEmailBlocker } from '../support';

// Posts a fake lead + 2-message transcript to WF3 (hotel/lead) and checks that Resend accepted the email.
// Safety: skipped unless LEAD_TO is set, is not a reviewer address, and n8n is local (see leadEmailBlocker).

test('lead webhook sends the summary email', async ({ request }) => {
  test.setTimeout(100_000);
  const leadTo = process.env.LEAD_TO ?? '';
  test.skip(await isMockMode(request), 'API is in mock mode (N8N_MOCK=1)');
  test.skip(!leadTo, 'LEAD_TO is empty in .env — set it to your own inbox and re-run pnpm n8n:import');
  test.skip(!!leadEmailBlocker(N8N_URL), `${leadEmailBlocker(N8N_URL)} — use your own inbox and a local stack`);

  const now = new Date().toISOString();
  const res = await request.post(`${N8N_URL}/webhook/hotel/lead`, {
    headers: { 'x-hotel-secret': process.env.N8N_WEBHOOK_SECRET ?? '' },
    data: {
      lead: { name: 'Test Guest', phone: '+1 555 0100', email: 'test.guest@example.com' },
      session_id: '00000000-0000-4000-8000-000000000003',
      unanswered_question: HELIPAD_Q,
      transcript: [
        { role: 'user', content: HELIPAD_Q, created_at: now },
        { role: 'assistant', content: CANNED_FALLBACK, created_at: now },
      ],
    },
    timeout: 90_000,
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.email_id).toBeTruthy();
});

// A long chat must not land in the email body (Gmail clips bodies over ~102 KB): the body shows the last 6 messages and
// the full transcript is attached as Markdown. Reads the sent email back from the Resend API to check both.
test('long conversation: short body, full transcript attached as .md', async ({ request }) => {
  test.setTimeout(150_000);
  const leadTo = process.env.LEAD_TO ?? '';
  const resendKey = process.env.RESEND_API_KEY ?? '';
  test.skip(await isMockMode(request), 'API is in mock mode (N8N_MOCK=1)');
  test.skip(!leadTo, 'LEAD_TO is empty in .env — set it to your own inbox and re-run pnpm n8n:import');
  test.skip(!!leadEmailBlocker(N8N_URL), `${leadEmailBlocker(N8N_URL)} — use your own inbox and a local stack`);

  const now = new Date().toISOString();
  const sessionId = '00000000-0000-4000-8000-000000000004';
  const filler = ' Lorem ipsum dolor sit amet, café – 日本.'.repeat(35); // ~1.4 KB per message
  const transcript = Array.from({ length: 80 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    content: i === 78 ? HELIPAD_Q : i === 79 ? CANNED_FALLBACK : `[msg-${String(i).padStart(3, '0')}]${filler}`,
    created_at: now,
  }));
  const res = await request.post(`${N8N_URL}/webhook/hotel/lead`, {
    headers: { 'x-hotel-secret': process.env.N8N_WEBHOOK_SECRET ?? '' },
    data: {
      lead: { name: 'Test Guest (long chat)', phone: '+1 555 0100', email: 'test.guest@example.com' },
      session_id: sessionId,
      unanswered_question: HELIPAD_Q,
      transcript,
    },
    timeout: 120_000,
  });
  expect(res.status(), await res.text()).toBe(200);
  const { ok, email_id: emailId } = (await res.json()) as { ok: boolean; email_id: string };
  expect(ok).toBe(true);
  expect(emailId).toBeTruthy();

  test.skip(!resendKey, 'RESEND_API_KEY is empty — cannot read the sent email back');
  const resend = (path: string) =>
    request.get(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${resendKey}` } });

  const emailRes = await resend(`/emails/${emailId}`);
  test.skip(
    emailRes.status() === 401 || emailRes.status() === 403,
    'RESEND_API_KEY is a sending-only key — use a full-access key to read the email back',
  );
  expect(emailRes.status(), await emailRes.text()).toBe(200);
  const email = (await emailRes.json()) as { html: string; text: string };
  expect(email.html.length).toBeLessThan(100_000);
  expect(email.html).toContain('Showing the last 6 of 80 messages');
  expect(email.html).toContain('[msg-077]');
  expect(email.html).not.toContain('[msg-000]');
  expect(email.text).toContain(HELIPAD_Q);

  // Attachments are listed asynchronously after the send; poll briefly.
  type Attachment = { filename: string; content_type: string; download_url: string };
  let attachments: Attachment[] = [];
  await expect
    .poll(
      async () => {
        const list = await resend(`/emails/${emailId}/attachments`);
        attachments = list.ok() ? ((await list.json()) as { data: Attachment[] }).data : [];
        return attachments.map((a) => a.filename);
      },
      { timeout: 30_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toEqual(['transcript-00000000.md']);

  const file = await request.get(attachments[0]!.download_url);
  expect(file.status()).toBe(200);
  const md = new TextDecoder().decode(await file.body());
  expect(md).toContain('# Cincinnati Hotel chatbot — conversation transcript');
  expect(md).toContain(`## Unanswered question\n\n${HELIPAD_Q}`);
  for (const m of transcript) expect(md).toContain(m.content);
  expect(md).not.toContain('+1 555 0100');
  expect(md).not.toContain('test.guest@example.com');
});
