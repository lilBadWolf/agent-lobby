import { expect, test } from '@playwright/test';

test.setTimeout(60_000);

function uniqueRoomName() {
  return `room-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function ballSnapshot(page: import('@playwright/test').Page) {
  return page.locator('.pong-ball').evaluate((node) => {
    const style = (node as HTMLElement).style;
    return {
      left: Number.parseFloat(style.left || '0'),
      top: Number.parseFloat(style.top || '0'),
    };
  });
}

async function waitForBallMotion(page: import('@playwright/test').Page, timeout = 15_000) {
  const before = await ballSnapshot(page);
  await expect.poll(
    async () => {
      const after = await ballSnapshot(page);
      return Math.abs(after.left - before.left) + Math.abs(after.top - before.top);
    },
    { timeout }
  ).toBeGreaterThan(0.8);
}

async function paddleLeftPercent(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).evaluate((node) => {
    const value = (node as HTMLElement).style.left || '0';
    return Number.parseFloat(value);
  });
}

test('two isolated users can control paddles across peers', async ({ browser, baseURL }) => {
  const room = uniqueRoomName();
  const context = await browser.newContext();

  const host = await context.newPage();
  const guest = await context.newPage();

  await host.goto(`${baseURL}/pong-peer.html?room=${room}&role=host&user=ALPHA&peer=BRAVO`);
  await guest.goto(`${baseURL}/pong-peer.html?room=${room}&role=guest&user=BRAVO&peer=ALPHA`);

  await host.waitForSelector('.pong-board');
  await guest.waitForSelector('.pong-board');

  await waitForBallMotion(host);
  await waitForBallMotion(guest);

  const hostRemoteBefore = await paddleLeftPercent(host, '.pong-top-paddle');
  const guestLocalBefore = await paddleLeftPercent(guest, '.pong-bottom-paddle');
  await guest.click('.pong-board');
  await guest.keyboard.down('ArrowRight');
  await guest.waitForTimeout(280);
  await guest.keyboard.up('ArrowRight');

  await expect.poll(
    async () => paddleLeftPercent(guest, '.pong-bottom-paddle'),
    { timeout: 5_000 }
  ).toBeGreaterThan(guestLocalBefore + 2);

  await expect.poll(
    async () => {
      const current = await paddleLeftPercent(host, '.pong-top-paddle');
      return Math.abs(current - hostRemoteBefore);
    },
    { timeout: 5_000 }
  ).toBeGreaterThan(1.5);

  // Wait for both peers to be actively playing before the second control round.
  await waitForBallMotion(host);
  await waitForBallMotion(guest);

  const guestRemoteBefore = await paddleLeftPercent(guest, '.pong-top-paddle');
  await host.click('.pong-board');
  await host.keyboard.down('ArrowRight');
  await host.waitForTimeout(280);
  await host.keyboard.up('ArrowRight');

  await expect.poll(
    async () => {
      const current = await paddleLeftPercent(guest, '.pong-top-paddle');
      return Math.abs(current - guestRemoteBefore);
    },
    { timeout: 5_000 }
  ).toBeGreaterThan(1.5);

  await context.close();
});
