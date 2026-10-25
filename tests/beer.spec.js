const { test, expect, devices } = require('@playwright/test');

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
  // No scroll story: the stage stays in the hero and the taps heading in its section.
  await expect(page.locator('html')).not.toHaveClass(/pour-on/);
  await expect(page.locator('.hero-right > .hero-stage')).toHaveCount(1);
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
  await expect(page.locator('html')).not.toHaveClass(/pour-on/);
  await expect(page.locator('.hero-right > .hero-stage')).toHaveCount(1);
});

test('the model is a handled beer mug under a chrome tower tap', async ({ request }) => {
  const glb = await (await request.get('/Assets/models/beer.glb')).body();
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const mesh = name => json.meshes[json.nodes.find(node => node.name === name).mesh];
  const bounds = name => json.accessors[mesh(name).primitives[0].attributes.POSITION];
  // The handle reaches well past the mug's round body on one side.
  expect(bounds('Mug').max[0]).toBeGreaterThan(bounds('Mug').max[2] + .5);
  expect(mesh('TapHandle').primitives.map(p => json.materials[p.material].name).sort()).toEqual(['Brass', 'Chrome', 'HandleBlack']);
  expect(bounds('Tap').max[1]).toBeGreaterThan(bounds('Mug').max[1] + 1);
});

// The scroll event arrives on the browser's next real frame; wait for it before
// advancing the controlled clock.
async function scrollAndSettle(page, top, settle = 1200) {
  await page.evaluate(y => new Promise(resolve => {
    y = Math.round(y);
    if (Math.abs(scrollY - y) < 1) { resolve(); return; }
    addEventListener('scroll', () => resolve(), { once: true });
    window.scrollTo({ top: y, behavior: 'instant' });
  }), top);
  await page.clock.runFor(settle);
}

test('scrolling centres the mug, reveals the heading, frosts it, pours, then reaches the cards', async ({ page }) => {
  // Headless WebGL renders on the CPU, so walking every frame of the story is slow here.
  test.setTimeout(180000);
  await countDraws(page);
  await page.clock.install({ time: new Date(0) });
  await page.clock.pauseAt(new Date(1000));
  await page.goto('/');
  const stage = page.locator('.hero-stage');
  await expect(stage).toHaveClass(/beer-ready/);
  await expect(page.locator('html')).toHaveClass(/pour-on/);
  await page.clock.runFor(40);
  const viewport = page.viewportSize();
  const heroBox = await stage.boundingBox();
  expect(heroBox.x).toBeGreaterThan(viewport.width / 2);
  const end = await page.locator('.taps-grid').evaluate(grid => grid.getBoundingClientRect().top + scrollY);

  // Walk the story in short steps (each story beat spans at least two) and record what each shows.
  const order = ['hero', 'glide', 'title', 'frost', 'subtitle', 'pour', 'poured'];
  const seen = [], shots = {}, centred = [];
  for (let top = 0; top < end; top += viewport.height * .15) {
    await scrollAndSettle(page, top, 700);
    const step = await stage.getAttribute('data-pour-step');
    const { title, sub } = await page.evaluate(() => ({
      title: Number(getComputedStyle(document.querySelector('.pour-copy .sec-title')).opacity),
      sub: Number(getComputedStyle(document.querySelector('.pour-copy .sec-sub')).opacity),
    }));
    if (seen.at(-1) !== step) seen.push(step);
    if (step === 'title') expect(sub).toBe(0);
    if (step === 'frost') expect(title).toBeGreaterThan(.9);
    if (step === 'pour') expect(sub).toBe(1);
    if (['title', 'frost', 'subtitle', 'pour'].includes(step)) {
      const box = await stage.boundingBox();
      centred.push(box.y);
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(1.5);
      expect(box.y + box.height).toBeLessThan(await page.locator('.pour-copy .sec-title').evaluate(t => t.getBoundingClientRect().top));
    }
    if (!shots[step] && step !== 'hero' && step !== 'glide') shots[step] = await page.locator('.beer-canvas').screenshot();
  }
  expect(seen).toEqual(order);
  // Pinned: the pint holds still while the heading, frost, and pour play.
  expect(Math.max(...centred) - Math.min(...centred)).toBeLessThan(1);
  expect(shots.title.equals(shots.subtitle)).toBeFalsy();
  expect(shots.subtitle.equals(shots.poured)).toBeFalsy();

  // Bubbles keep rising in the poured pint, and the cards and slideshow follow below.
  await scrollAndSettle(page, end - viewport.height + 200);
  await expect(stage).toHaveAttribute('data-pour-step', 'poured');
  await expect(stage).toBeInViewport();
  const draws = await page.evaluate(() => window.heroDraws);
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.heroDraws)).toBeGreaterThan(draws);
  await expect(page.locator('.tap').first()).toBeInViewport();
  const slideshowTop = await page.locator('.slideshow').evaluate(s => s.getBoundingClientRect().top + scrollY);
  expect(slideshowTop).toBeGreaterThan(end);

  // Back at the top the hero copy returns and the looping pour resumes.
  await scrollAndSettle(page, 0);
  await expect(stage).toHaveAttribute('data-pour-step', 'hero');
  await expect(page.locator('.hero-inner')).toHaveCSS('opacity', '1');
  const box = await stage.boundingBox();
  expect(Math.abs(box.x - heroBox.x)).toBeLessThan(1);
  expect(Math.abs(box.y - heroBox.y)).toBeLessThan(1);
  const cycle = await stage.getAttribute('data-beer-cycle');
  await page.clock.fastForward(12000); await page.clock.runFor(40);
  expect(await stage.getAttribute('data-beer-cycle')).not.toBe(cycle);
});

test('the poured pint stops rendering once the story scrolls away', async ({ page }) => {
  await countDraws(page);
  await page.goto('/');
  await expect(page.locator('.hero-stage')).toHaveClass(/beer-ready/);
  const end = await page.locator('.taps-grid').evaluate(grid => grid.getBoundingClientRect().top + scrollY);
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), end - page.viewportSize().height);
  await expect(page.locator('.hero-stage')).toHaveAttribute('data-pour-step', 'poured', { timeout: 5000 });
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() => window.heroDraws);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.heroDraws)).toBe(calls);
});

test.describe('on a phone', () => {
  // A real mobile profile: phones widen the layout to fit overflowing content,
  // which desktop Chromium at phone width hides behind body { overflow-x: hidden }.
  const { defaultBrowserType, ...phone } = devices['iPhone 13'];
  test.use(phone);

  test('the scroll story runs without widening the page', async ({ page }) => {
    await page.goto('/');
    const stage = page.locator('.hero-stage');
    await expect(stage).toHaveClass(/beer-ready/);
    await expect(page.locator('html')).toHaveClass(/pour-on/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    // Positions within the pinned stretch of the 3D story (the card deck follows it).
    const story = await page.locator('.pour-story').evaluate(s => ({ top: s.getBoundingClientRect().top + scrollY, pinned: s.offsetHeight - document.documentElement.clientHeight }));
    for (const [fraction, step] of [[.25, 'frost'], [.97, 'poured']]) {
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), story.top + story.pinned * fraction);
      await expect(stage).toHaveAttribute('data-pour-step', step);
    }
    await expect(stage).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});

test('a landscape phone keeps the static layout when the pint and heading cannot share the screen', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.locator('.hero-stage')).toHaveClass(/beer-ready/);
  await expect(page.locator('html')).not.toHaveClass(/pour-on/);
  await expect(page.locator('.hero-right > .hero-stage')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('html')).toHaveClass(/pour-on/);
  await expect(page.locator('.pour-pin > .hero-stage')).toHaveCount(1);
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
