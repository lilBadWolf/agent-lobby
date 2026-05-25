import { expect, test } from '@playwright/test';

function uniqueRoomName() {
  return `battleship-room-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function placeFleet(page: import('@playwright/test').Page) {
  const starts = [0, 10, 20, 30, 40];
  for (const index of starts) {
    await page.locator('.your-board .local-grid .cell').nth(index).click();
  }
}

test('two users can deploy fleets, enter battle, and sync shots', async ({ browser, baseURL }) => {
  const room = uniqueRoomName();
  const context = await browser.newContext();
  const alpha = await context.newPage();
  const bravo = await context.newPage();

  await alpha.goto(`${baseURL}/battleship-peer.html?room=${room}&role=host&user=ALPHA&peer=BRAVO`);
  await bravo.goto(`${baseURL}/battleship-peer.html?room=${room}&role=guest&user=BRAVO&peer=ALPHA`);

  await alpha.waitForSelector('.battleship-shell');
  await bravo.waitForSelector('.battleship-shell');

  await placeFleet(alpha);
  await placeFleet(bravo);

  await alpha.locator('.controls .action-btn.primary').click();
  await bravo.locator('.controls .action-btn.primary').click();

  await expect(alpha.locator('.phase-chip')).toContainText('ENGAGED', { timeout: 10_000 });
  await expect(bravo.locator('.phase-chip')).toContainText('ENGAGED', { timeout: 10_000 });

  const imagesLoaded = await alpha.locator('.ship-sprite-layer img.ship-art').evaluateAll((nodes) => {
    return nodes.length > 0 && nodes.every((node) => (node as HTMLImageElement).src.length > 0);
  });
  expect(imagesLoaded).toBe(true);

  await alpha.locator('.target-board .grid.enemy .cell').nth(0).click();

  await expect(alpha.locator('.target-board .grid.enemy .cell').nth(0)).toHaveClass(/hit|miss/, { timeout: 8_000 });
  await expect(bravo.locator('.your-board .local-grid .cell').nth(0)).toHaveClass(/hit|miss/, { timeout: 8_000 });

  // A single hit should never end the match.
  await expect(alpha.locator('.phase-chip')).toContainText('ENGAGED');
  await expect(bravo.locator('.phase-chip')).toContainText('ENGAGED');
  await expect(alpha.locator('.winner-banner')).toHaveCount(0);
  await expect(bravo.locator('.winner-banner')).toHaveCount(0);

  await context.close();
});
