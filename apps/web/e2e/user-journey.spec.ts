import { expect, test } from '@playwright/test';

const CHECKIN_Q = 'What time is check-in?';
const HELIPAD_Q = 'Is there a helipad on the roof?';
const CANNED = "I'm sorry, I don't have that information right now.";

test('guest asks a question, gets the fallback, and leaves contact details', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Regular User' }).click();
  await expect(page).toHaveURL(/\/chat$/);

  const composer = page.getByRole('textbox', { name: 'Message the hotel assistant' });
  const log = page.getByRole('log', { name: 'Conversation' });

  // Answered question: an assistant bubble appears after the user bubble.
  await composer.fill(CHECKIN_Q);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(log.getByText(CHECKIN_Q)).toBeVisible();
  await expect(log.getByText('[mock] Here is some information about', { exact: false })).toBeVisible({ timeout: 15_000 });

  // Unanswered question: canned sentence plus the contact form offer.
  await expect(composer).toBeEnabled();
  await composer.fill(HELIPAD_Q);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(log.getByText(CANNED)).toBeVisible({ timeout: 15_000 });

  const form = page.getByRole('form', { name: 'Contact details' });
  await expect(form).toBeVisible();
  await form.getByLabel('Name', { exact: true }).fill('Jane Guest');
  await form.getByLabel('Phone', { exact: true }).fill('+1 513 555 0100');
  await form.getByLabel('Email', { exact: true }).fill('jane.guest@example.com');
  await form.getByRole('button', { name: 'Send details' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Thanks, our team will contact you shortly.' })).toBeVisible({
    timeout: 15_000,
  });
});
