const { test, expect } = require('@playwright/test');

test('3D beer loads, rotates with the keyboard, pauses, resets and pours', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect(page.locator('.hero-stage')).toHaveClass(/beer-ready/);
  const canvas = page.locator('.beer-canvas');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const before = await canvas.screenshot();
  await canvas.focus();
  await canvas.press('ArrowRight');
  const after = await canvas.screenshot();
  expect(before.equals(after)).toBeFalsy();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByRole('button', { name: 'Pour a pint' }).click();
  await expect(page.getByRole('button', { name: 'Pour a pint' })).toBeDisabled();
  await expect(page.locator('.beer-status')).toHaveText('Freshly poured. Cheers.', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Pour a pint' })).toBeEnabled();
});

test('mobile reduced motion starts paused and keeps controls in bounds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('.hero-stage').scrollIntoViewIfNeeded();
  await expect(page.locator('.hero-stage')).toHaveClass(/beer-ready/);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pour a pint' }).click();
  await expect(page.locator('.beer-status')).toHaveText('Freshly poured. Cheers.');
  const box = await page.locator('.beer-controls').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});

test('failed model loading preserves the illustration and hides unavailable controls', async ({ page }) => {
  await page.route('**/Assets/models/beer.glb', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.hero-svg')).toBeVisible();
  await expect(page.locator('.beer-controls')).toBeHidden();
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
    expect(sizes.buffer).toBeLessThanOrEqual(sizes.container * 1.5);
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
