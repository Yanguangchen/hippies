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
