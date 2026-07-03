const { test, expect } = require('@playwright/test');

test.describe('Static Website Tests', () => {
  test('index.html has correct title', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page).toHaveTitle(/Enjoy Local Bar and Grill with No GST/);
  });

  test('about.html has correct title', async ({ page }) => {
    await page.goto('/about.html');
    await expect(page).toHaveTitle(/About Us — Hippies Bar & Grill/);
  });

  test('faq.html has correct title', async ({ page }) => {
    await page.goto('/faq.html');
    await expect(page).toHaveTitle(/FAQ — Hippies Bar & Grill/);
  });

  test('blog.html has correct title and article links', async ({ page }) => {
    await page.goto('/blog.html');
    await expect(page).toHaveTitle(/Blog — Hippies Bar & Grill Singapore/);
    await expect(page.locator('a[href="blog/best-neighbourhood-bar-guillemard-road.html"]')).toBeVisible();
    await expect(page.locator('a[href="blog/affordable-ribeye-steak-singapore.html"]')).toBeVisible();
    await expect(page.locator('a[href="blog/guinness-on-tap-live-music-singapore.html"]')).toBeVisible();
  });

  test('blog article has responsive reservation CTA', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/blog/affordable-ribeye-steak-singapore.html');
    await expect(page).toHaveTitle(/Affordable Ribeye Steak in Singapore/);
    await expect(page.locator('.article-cta .btn-primary')).toBeVisible();
  });

  test('navigation works from index to about', async ({ page }) => {
    await page.goto('/index.html');
    const aboutLink = page.locator('a[href="about.html"]').first();
    await expect(aboutLink).toBeVisible();
    await aboutLink.click();
    await expect(page).toHaveURL(/.*about(\.html)?$/);
  });
});
