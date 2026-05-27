import { expect, test } from '@playwright/test';

test.setTimeout(60_000);

async function ballSnapshot(locator: import('@playwright/test').Locator) {
  return locator.evaluate((node) => {
    const style = (node as HTMLElement).style;
    return {
      left: Number.parseFloat(style.left || '0'),
      top: Number.parseFloat(style.top || '0'),
    };
  });
}

async function waitForBallMotion(locator: import('@playwright/test').Locator, timeout = 15_000) {
  const before = await ballSnapshot(locator);
  await expect.poll(
    async () => {
      const after = await ballSnapshot(locator);
      return Math.abs(after.left - before.left) + Math.abs(after.top - before.top);
    },
    { timeout }
  ).toBeGreaterThan(0.8);
}

async function paddleLeftPercent(locator: import('@playwright/test').Locator) {
  return locator.evaluate((node) => {
    const value = (node as HTMLElement).style.left || '0';
    return Number.parseFloat(value);
  });
}

test('preview harness uses production-like peer sync and reflects movement on both users', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/pong-preview.html`);
  await expect(page.locator('h1')).toHaveText('Pong Two-User Movement Preview');
  await expect(page.locator('iframe')).toHaveCount(2);

  const hostFrame = page.frameLocator('iframe[title="Host Pong View"]');
  const guestFrame = page.frameLocator('iframe[title="Guest Pong View"]');

  await hostFrame.locator('.pong-board').waitFor();
  await guestFrame.locator('.pong-board').waitFor();

  await waitForBallMotion(hostFrame.locator('.pong-ball'));
  await waitForBallMotion(guestFrame.locator('.pong-ball'));

  const guestRemoteBefore = await paddleLeftPercent(guestFrame.locator('.pong-top-paddle'));

  await hostFrame.locator('.pong-board').click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(280);
  await page.keyboard.up('ArrowRight');

  await expect.poll(
    async () => {
      const current = await paddleLeftPercent(guestFrame.locator('.pong-top-paddle'));
      return Math.abs(current - guestRemoteBefore);
    },
    { timeout: 5_000 }
  ).toBeGreaterThan(1.5);

  const hostRemoteBefore = await paddleLeftPercent(hostFrame.locator('.pong-top-paddle'));
  await expect.poll(
    async () => {
      const current = await paddleLeftPercent(hostFrame.locator('.pong-top-paddle'));
      return Math.abs(current - hostRemoteBefore);
    },
    { timeout: 5_000 }
  ).toBeGreaterThan(1.5);
});
