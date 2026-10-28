import { expect, test, type Page } from '@playwright/test';

const QUESTION = 'What time is check-in?';

/** Reads the "Questions asked" stat card value; NaN while the skeleton is still shown. */
async function readQuestionsAsked(page: Page): Promise<number> {
  const text = await page
    .getByText('Questions asked', { exact: true })
    .locator('xpath=..')
    .locator('p.tabular-nums')
    .textContent({ timeout: 2_000 })
    .catch(() => null);
  return text === null ? Number.NaN : Number(text.replace(/[,\s]/g, ''));
}

test('admin dashboard updates "Questions asked" in real time without reload', async ({ browser }) => {
  const context = await browser.newContext();
  const admin = await context.newPage();
  await admin.goto('/admin');
  await expect(admin.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();

  await expect.poll(() => readQuestionsAsked(admin), { timeout: 5_000 }).not.toBeNaN();
  const before = await readQuestionsAsked(admin);

  // A second visitor asks a question in another tab of the same browser context.
  const guest = await context.newPage();
  await guest.goto('/chat');
  const composer = guest.getByRole('textbox', { name: 'Message the hotel assistant' });
  await expect(composer).toBeEnabled();
  await composer.fill(QUESTION);
  await guest.getByRole('button', { name: 'Send message' }).click();
  await expect(guest.getByRole('log', { name: 'Conversation' }).getByText(QUESTION)).toBeVisible();

  await expect.poll(() => readQuestionsAsked(admin), { timeout: 5_000 }).toBeGreaterThan(before);

  await context.close();
});
