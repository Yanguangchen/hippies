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

  test('navigation works from index to about', async ({ page }) => {
    await page.goto('/index.html');
    const aboutLink = page.locator('a[href="about.html"]').first();
    await expect(aboutLink).toBeVisible();
    await aboutLink.click();
    await expect(page).toHaveURL(/.*about(\.html)?$/);
  });
});
