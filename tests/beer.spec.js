const { test, expect } = require('@playwright/test');

async function countDraws(page) {
  await page.addInitScript(() => {
    window.heroDraws = 0;
    window.heroFrameTimes = [];
    const clear = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function (...args) {
      if (this.canvas.classList.contains('beer-canvas')) window.heroFrameTimes.push(performance.now());
      return clear.apply(this, args);
    };
    for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function (...args) {
        if (this.canvas.classList.contains('beer-canvas')) window.heroDraws++;
        return original.apply(this, args);
      };
    }
  });
}

test('tap pours, ice drops, and the sequence repeats without controls', async ({ page }) => {
  test.setTimeout(60000);
  await countDraws(page);
  // Freeze time so software-rendered screenshots cannot skip a short phase.
  await page.clock.install({ time: new Date(0) });
  await page.clock.pauseAt(new Date(1000));
  await page.goto('/');
  const stage = page.locator('.hero-stage');
  await expect(stage).toHaveClass(/beer-ready/);
  await expect(stage.getByRole('button')).toHaveCount(0);
  await page.clock.runFor(40);
  await page.clock.fastForward(2000); await page.clock.runFor(40);
  await expect(stage).toHaveAttribute('data-beer-phase', 'pouring');
  const pouring = await page.locator('.beer-canvas').screenshot();
  await page.clock.fastForward(3500); await page.clock.runFor(40);
  await expect(stage).toHaveAttribute('data-beer-phase', 'ice');
  const ice = await page.locator('.beer-canvas').screenshot();
  expect(pouring.equals(ice)).toBeFalsy();
  await page.clock.fastForward(2500); await page.clock.runFor(40);
  await expect(stage).toHaveAttribute('data-beer-phase', 'hold');
  const holdDraws = await page.evaluate(() => window.heroDraws);
  await page.clock.fastForward(500);
  expect(await page.evaluate(() => window.heroDraws)).toBe(holdDraws);
  await expect(page.locator('.hero .spark, .hero .frost, .hero .ember')).toHaveCount(0);
  await expect(page.locator('.hero h1 .icy')).toHaveCSS('filter', 'none');
  await page.clock.fastForward(4500); await page.clock.runFor(40);
  await expect(stage).toHaveAttribute('data-beer-cycle', '1');
  await expect(stage).toHaveAttribute('data-beer-phase', 'pouring');
});

test('automatic playback uses the same frame cadence as dragging', async ({ page }) => {
  test.setTimeout(60000);
  await countDraws(page);
  await page.clock.install({ time: new Date(0) });
  await page.clock.pauseAt(new Date(1000));
  await page.goto('/');
  await expect(page.locator('.hero-stage')).toHaveClass(/beer-ready/);
  await page.clock.runFor(40);
  await page.clock.fastForward(2000); await page.clock.runFor(40);
  await page.evaluate(() => { window.heroFrameTimes = []; });
  await page.clock.runFor(480);
  const automatic = await page.evaluate(() => window.heroFrameTimes);
  // The controlled clock supplies one display frame every 16 ms.
  expect(automatic.length).toBeGreaterThanOrEqual(28);
  expect(automatic.length).toBeLessThanOrEqual(31);
  const box = await page.locator('.beer-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => { window.heroFrameTimes = []; });
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(box.x + box.width / 2 + i, box.y + box.height / 2);
    await page.clock.runFor(16);
  }
  await page.mouse.up();
  const dragging = await page.evaluate(() => window.heroFrameTimes);
  expect(Math.abs(automatic.length - dragging.length)).toBeLessThanOrEqual(1);
  for (const frames of [automatic, dragging]) {
    expect(Math.max(...frames.slice(1).map((time, i) => time - frames[i]))).toBeLessThanOrEqual(17);
  }
});

test('mobile reduced motion renders a still pint and keyboard rotation remains available', async ({ page }) => {
  await countDraws(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const stage = page.locator('.hero-stage');
  await stage.scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute('data-beer-phase', 'hold');
  await expect(stage.getByRole('button')).toHaveCount(0);
  const canvas = page.locator('.beer-canvas');
  const before = await canvas.screenshot();
  const calls = await page.evaluate(() => window.heroDraws);
  expect(calls).toBeGreaterThan(0);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.heroDraws)).toBe(calls);
  await canvas.focus(); await canvas.press('ArrowRight');
  const after = await canvas.screenshot();
  expect(before.equals(after)).toBeFalsy();
});

test('the GPU stops rendering when the hero leaves the viewport', async ({ page }) => {
  await countDraws(page);
  await page.goto('/');
  await expect(page.locator('.hero-stage')).toHaveAttribute('data-beer-phase', 'pouring', { timeout: 10000 });
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const calls = await page.evaluate(() => window.heroDraws);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.heroDraws)).toBe(calls);
  await page.locator('.hero-stage').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.heroDraws)).toBeGreaterThan(calls);
});

test('failed model loading preserves the illustration', async ({ page }) => {
  await page.route('**/Assets/models/beer.glb*', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.hero-svg')).toBeVisible();
  await expect(page.locator('.hero-stage')).not.toHaveClass(/beer-ready/);
});

test.describe('cached styles and high-DPI sizing', () => {
  test.use({ deviceScaleFactor: 2 });

  test('loads versioned styles and keeps the visible canvas inside the hero', async ({ page }) => {
    await page.route('**/styles.css', route => route.fulfill({ contentType: 'text/css', body: '/* obsolete cached stylesheet */' }));
    await page.goto('/');
    await expect(page.locator('.hero-stage')).toHaveClass(/beer-ready/);
    await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute('href', /styles\.css\?v=[a-f0-9]+/);
    const canvas = page.locator('.beer-canvas');
    await expect(canvas).toHaveCSS('position', 'absolute');
    await expect(canvas).toHaveCSS('opacity', '1');
    const sizes = await canvas.evaluate(c => ({ buffer: c.width, width: c.getBoundingClientRect().width, container: c.parentElement.clientWidth }));
    expect(sizes.width).toBe(sizes.container);
    expect(sizes.buffer).toBeGreaterThanOrEqual(sizes.container);
    expect(sizes.buffer).toBeLessThanOrEqual(sizes.container * 1.25);
    expect(sizes.buffer).toBeLessThanOrEqual(1024);
    expect(await canvas.evaluate(c => c.getContext('webgl2').getContextAttributes().antialias)).toBeTruthy();
    const centerOwnsCanvas = await canvas.evaluate(c => {
      const r = c.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === c;
    });
    expect(centerOwnsCanvas).toBeTruthy();
  });

  test('missing canvas CSS cannot cause a growing drawing buffer', async ({ page }) => {
    await page.route('**/styles.css?v=*', async route => {
      const response = await route.fetch();
      const css = (await response.text()).split('/* Interactive Blender / Three.js hero.')[0];
      await route.fulfill({ response, body: css });
    });
    await page.goto('/');
    await expect(page.locator('.hero-stage')).toHaveClass(/beer-ready/);
    const canvas = page.locator('.beer-canvas');
    const width = await canvas.evaluate(c => c.width);
    await page.waitForTimeout(600);
    expect(await canvas.evaluate(c => c.width)).toBe(width);
    expect(width).toBeLessThan(1500);
  });
});
