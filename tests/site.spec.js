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

const pages = [
  { path: '/index.html', canonical: 'https://hippiesbar.sg/' },
  { path: '/about.html', canonical: 'https://hippiesbar.sg/about.html' },
  { path: '/faq.html', canonical: 'https://hippiesbar.sg/faq.html' },
  { path: '/blog.html', canonical: 'https://hippiesbar.sg/blog.html' },
  { path: '/blog/best-neighbourhood-bar-guillemard-road.html', canonical: 'https://hippiesbar.sg/blog/best-neighbourhood-bar-guillemard-road.html' },
  { path: '/blog/affordable-ribeye-steak-singapore.html', canonical: 'https://hippiesbar.sg/blog/affordable-ribeye-steak-singapore.html' },
  { path: '/blog/guinness-on-tap-live-music-singapore.html', canonical: 'https://hippiesbar.sg/blog/guinness-on-tap-live-music-singapore.html' },
];

test.describe('Technical SEO and answer-engine files', () => {
  test('llms.txt follows the spec and lists every page', async ({ request }) => {
    const response = await request.get('/llms.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body.startsWith('# Hippies Bar & Grill\n')).toBeTruthy();
    expect(body).toMatch(/^> /m);
    expect(body).toContain('\n## Pages\n');
    expect(body).toContain('\n## Optional\n');
    for (const page of pages) {
      expect(body).toContain(page.canonical);
    }
    expect(body).toContain('$19.90');
    expect(body).toContain('4:30pm');
    expect(body).not.toContain('Loaded Nachos');
    expect(body).not.toContain('Shrimp Skewers');
  });

  test('sitemap lists every canonical URL', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    for (const page of pages) {
      expect(body).toContain(`<loc>${page.canonical}</loc>`);
    }
  });

  for (const entry of pages) {
    test(`${entry.path} has canonical, structured data, and sized images`, async ({ page }) => {
      await page.goto(entry.path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', entry.canonical);
      await expect(page.locator('link[rel="alternate"][type="text/plain"]')).toHaveAttribute('href', 'https://hippiesbar.sg/llms.txt');
      await expect(page.locator('nav.foot-nav')).toBeVisible();
      const html = await page.content();
      expect(html).not.toContain('fonts.googleapis.com');
      expect(html).not.toContain('aggregateRating');

      const raw = await page.locator('script[type="application/ld+json"]').textContent();
      const data = JSON.parse(raw);
      expect(data['@context']).toBe('https://schema.org');
      expect(Array.isArray(data['@graph'])).toBeTruthy();

      const images = page.locator('main img');
      const count = await images.count();
      if (entry.path !== '/faq.html') expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const image = images.nth(i);
        await expect(image).toHaveAttribute('width', /[0-9]+/);
        await expect(image).toHaveAttribute('height', /[0-9]+/);
        const src = (await image.getAttribute('src')) || (await image.getAttribute('data-src'));
        expect(src).toBeTruthy();
        expect(src.endsWith('.png')).toBeFalsy();
      }
    });
  }

  test('homepage JSON-LD matches the visible menu and map', async ({ page }) => {
    await page.goto('/index.html');
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    const bar = data['@graph'].find((node) => [].concat(node['@type']).includes('BarOrPub'));
    expect(bar.geo.latitude).toBeCloseTo(1.3118773, 5);
    expect(bar.geo.longitude).toBeCloseTo(103.8882446, 5);
    const items = bar.hasMenu.hasMenuSection.flatMap((section) => section.hasMenuItem);
    const ribeye = items.find((item) => item.name === 'Ribeye Steak');
    expect(ribeye.offers.price).toBe('19.90');
    expect(items.some((item) => item.name === 'Hippies Bites Platter')).toBeTruthy();
    expect(items.some((item) => item.name === 'Goose Island IPA')).toBeTruthy();
    await expect(page.locator('#guides a')).toHaveCount(4);
    await expect(page.locator('.stat .num').last()).toHaveText('5');
  });

  test('FAQ schema matches the visible questions', async ({ page }) => {
    await page.goto('/faq.html');
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    const faq = data['@graph'].find((node) => node['@type'] === 'FAQPage');
    const questions = faq.mainEntity.map((entity) => entity.name);
    const summaries = await page.locator('summary').allTextContents();
    expect(questions).toEqual(summaries.map((summary) => summary.trim()));
    expect(questions).toHaveLength(5);
  });
});
