import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('loads the app shell', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle("Worldbuilder's Dream");
    await expect(page.locator('wd-root')).toBeAttached();
  });

  test('has no wcag a/aa violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
