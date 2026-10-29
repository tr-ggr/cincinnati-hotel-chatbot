import { expect, test } from '@playwright/test';
import { CANNED_FALLBACK, HELIPAD_Q, N8N_URL, REVIEWER_RE, isMockMode } from '../support';

// Posts a fake lead + 2-message transcript to WF3 (hotel/lead) and checks that Resend accepted the email.
// Safety: skipped unless LEAD_TO is set and is not a reviewer address.

test('lead webhook sends the summary email', async ({ request }) => {
  test.setTimeout(100_000);
  const leadTo = process.env.LEAD_TO ?? '';
  test.skip(await isMockMode(request), 'API is in mock mode (N8N_MOCK=1)');
  test.skip(!leadTo, 'LEAD_TO is empty in .env — set it to your own inbox and re-run pnpm n8n:import');
  test.skip(REVIEWER_RE.test(leadTo), 'LEAD_TO contains a reviewer address — use your own inbox while testing');

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
