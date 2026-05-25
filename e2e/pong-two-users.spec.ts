import { expect, test } from '@playwright/test';

test.setTimeout(60_000);

function uniqueRoomName() {
  return `room-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
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

  await host.waitForFunction(() => {
    const status = document.querySelector('.pong-status')?.textContent || '';
    return status.includes('PONG started');
  }, null, { timeout: 15_000 });

  await guest.waitForFunction(() => {
    const status = document.querySelector('.pong-status')?.textContent || '';
    return status.includes('PONG started');
  }, null, { timeout: 15_000 });

  const hostRemoteBefore = await paddleLeftPercent(host, '.pong-top-paddle');
  await guest.click('.pong-board');
  await guest.keyboard.down('ArrowRight');
  await guest.waitForTimeout(280);
  await guest.keyboard.up('ArrowRight');

  await expect.poll(
    async () => paddleLeftPercent(host, '.pong-top-paddle'),
    { timeout: 5_000 }
  ).toBeGreaterThan(hostRemoteBefore + 2);

  const guestRemoteBefore = await paddleLeftPercent(guest, '.pong-top-paddle');
  await host.click('.pong-board');
  await host.keyboard.down('ArrowRight');
  await host.waitForTimeout(280);
  await host.keyboard.up('ArrowRight');

  await expect.poll(
    async () => paddleLeftPercent(guest, '.pong-top-paddle'),
    { timeout: 5_000 }
  ).toBeGreaterThan(guestRemoteBefore + 2);

  await context.close();
});
