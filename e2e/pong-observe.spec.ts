import { expect, test } from '@playwright/test';

test('opens two-user preview and stays running until window is closed', async ({ page, baseURL }) => {
  test.setTimeout(0);

  await page.goto(`${baseURL}/pong-preview.html`);
  await expect(page.locator('h1')).toHaveText('Pong Two-User Movement Preview');
  await expect(page.locator('iframe')).toHaveCount(2);

  // Keep this run alive for manual observation; finish only when the window/tab is closed.
  await page.waitForEvent('close');
});
