import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEV_STRINGS } from '../src/app/core/strings/dev.strings';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

test.describe('/dev showcase', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev');
    await expect(page.getByRole('heading', { level: 1, name: DEV_STRINGS.title })).toBeVisible();
  });

  test('has no wcag a/aa violations', async ({ page }) => {
    expect((await axe(page)).violations).toEqual([]);
  });

  test('dialog traps focus and returns it on Escape', async ({ page }) => {
    const opener = page.getByRole('button', { name: DEV_STRINGS.dialogs.openSimple });
    await opener.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: DEV_STRINGS.dialogs.simpleTitle });
    await expect(dialog).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('shows the tool tooltip on keyboard focus', async ({ page }) => {
    const { tools } = DEV_STRINGS.iconButtons;
    await page.getByRole('button', { name: tools.select }).focus();
    await page.keyboard.press('Tab');

    await expect(page.getByRole('button', { name: tools.pan })).toBeFocused();
    await expect(page.locator('wd-tooltip-panel')).toHaveText(tools.pan);

    await page.keyboard.press('Escape');
    await expect(page.locator('wd-tooltip-panel')).toHaveCount(0);
  });

  test('toast offers undo', async ({ page }) => {
    await page.getByRole('button', { name: DEV_STRINGS.toasts.withUndo }).click();
    await expect(page.getByText(DEV_STRINGS.toasts.undoMessage)).toBeVisible();

    await page.getByRole('button', { name: DEV_STRINGS.toasts.undo, exact: true }).click();

    await expect(page.getByText(DEV_STRINGS.toasts.undoMessage)).toBeHidden();
    await expect(page.getByText(DEV_STRINGS.toasts.undone)).toBeVisible();
  });
});
