const { test, expect, devices } = require('@playwright/test');

// Scrolls to a point in the pinned card deck (0 = pinned stack, 1 = all cards open)
// and lets the eased scroll position settle on the controlled clock. The scroll event
// arrives on the browser's next real frame, so wait for it before advancing the clock.
async function deckAt(page, progress) {
  await page.evaluate(q => new Promise(resolve => {
    const story = document.querySelector('.deck-story');
    const track = story.offsetHeight - document.documentElement.clientHeight;
    const top = Math.round(story.getBoundingClientRect().top + scrollY + q * track);
    if (Math.abs(scrollY - top) < 1) { resolve(); return; }
    addEventListener('scroll', () => resolve(), { once: true });
    window.scrollTo({ top, behavior: 'instant' });
  }), progress);
  await page.clock.runFor(1200);
}
// Fonts and the 3D story above re-measure on animation frames; let them land first,
// or the deck moves down the page under the paused clock.
async function settleLayout(page) {
  await expect(page.locator('html')).toHaveClass(/deck-on/);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(1000);
}
const boxes = page => page.locator('.tap').evaluateAll(cards => cards.map(card => {
  const r = card.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
}));
const detailOpacity = page => page.locator('.tap-more').evaluateAll(more => more.map(m => Number(getComputedStyle(m).opacity)));

test('the beer cards fan out of a stack, deal into a row, then open one by one', async ({ page }) => {
  test.setTimeout(90000);
  await page.clock.install({ time: new Date(0) });
  await page.clock.pauseAt(new Date(1000));
  await page.goto('/');
  await settleLayout(page);
  const pin = page.locator('.deck-pin');

  await deckAt(page, 0);
  await expect(pin).toHaveAttribute('data-deck-step', 'stack');
  const stack = await boxes(page);
  for (const card of stack) expect(Math.abs(card.cx - stack.at(-1).cx)).toBeLessThan(12);

  // Fanned out like a hand: every name shows beside the card lying over it.
  await deckAt(page, .28);
  const namesShowing = await page.locator('.tap h3').evaluateAll(names => names.every(name => {
    const r = name.getBoundingClientRect();
    return name.closest('.tap').contains(document.elementFromPoint(r.left + 8, r.top + r.height / 2));
  }));
  expect(namesShowing).toBe(true);
  expect(await detailOpacity(page)).toEqual([0, 0, 0, 0, 0]);

  // Dealt into one row of closed cards showing only their names.
  await deckAt(page, .59);
  await expect(pin).toHaveAttribute('data-deck-step', 'open');
  const row = await boxes(page);
  for (let i = 1; i < row.length; i++) {
    expect(Math.abs(row[i].y - row[0].y)).toBeLessThan(1);
    expect(row[i].x).toBeGreaterThan(row[i - 1].x + row[i - 1].w);
  }
  expect(await detailOpacity(page)).toEqual([0, 0, 0, 0, 0]);

  // They open in turn, left to right, growing to fit each description.
  await deckAt(page, .72);
  const opening = await detailOpacity(page);
  expect(opening[0]).toBeGreaterThan(opening[4]);
  await deckAt(page, 1);
  await expect(pin).toHaveAttribute('data-deck-step', 'done');
  expect(await detailOpacity(page)).toEqual([1, 1, 1, 1, 1]);
  const open = await boxes(page);
  open.forEach((card, i) => expect(card.h).toBeGreaterThan(row[i].h + 30));
  await expect(page.locator('.tap').last()).toBeInViewport({ ratio: 1 });
});

test('reduced motion keeps the usual card grid with descriptions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).not.toHaveClass(/deck-on/);
  await page.locator('.taps-grid').scrollIntoViewIfNeeded();
  await expect(page.locator('.tap p').first()).toBeVisible();
  expect(await detailOpacity(page)).toEqual([1, 1, 1, 1, 1]);
});

test.describe('on a phone', () => {
  const { defaultBrowserType, ...phone } = devices['iPhone 13'];
  test.use(phone);

  test('the cards deal into one column that glides up as each opens, without widening the page', async ({ page }) => {
    await page.clock.install({ time: new Date(0) });
    await page.clock.pauseAt(new Date(1000));
    await page.goto('/');
    await settleLayout(page);
    await deckAt(page, .59);
    const list = await boxes(page);
    for (let i = 1; i < list.length; i++) {
      expect(Math.abs(list[i].x - list[0].x)).toBeLessThan(1);
      expect(list[i].y).toBeGreaterThan(list[i - 1].y + list[i - 1].h);
    }
    await deckAt(page, 1);
    await expect(page.locator('.deck-pin')).toHaveAttribute('data-deck-step', 'done');
    // Taller than the screen once open, so the last card has been brought into view.
    await expect(page.locator('.tap').last()).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
