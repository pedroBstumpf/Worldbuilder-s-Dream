import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEMO_STRINGS } from '../src/app/core/strings/demo.strings';

test.describe('smoke', () => {
  test('loads the app shell', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle("Worldbuilder's Dream");
    await expect(page.locator('wd-root')).toBeAttached();
  });

  test('shows the demo mode badge (dev server runs in local mode)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('note')).toContainText(DEMO_STRINGS.badge);
  });

  test('has no wcag a/aa violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
