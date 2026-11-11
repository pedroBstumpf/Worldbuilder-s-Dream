import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BOOK_POC_STRINGS } from '../src/app/core/strings/book-poc.strings';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const { cover, library, map, controls } = BOOK_POC_STRINGS;

const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const state = (page: Page) => page.getByTestId('poc-state');

test.describe('/dev/livro book proof of concept', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/livro');
    await expect(
      page.getByRole('heading', { level: 1, name: BOOK_POC_STRINGS.title }),
    ).toBeVisible();
  });

  test('has no wcag a/aa violations on the closed cover', async ({ page }) => {
    expect((await axe(page)).violations).toEqual([]);
  });

  test('Escape skips the opening and focuses the library title', async ({ page }) => {
    await page.getByRole('button', { name: cover.signIn }).click();
    await expect(state(page)).toHaveText('opening', { timeout: 3000 });

    await page.keyboard.press('Escape');

    await expect(state(page)).toHaveText('open', { timeout: 500 });
    await expect(page.getByRole('heading', { name: library.heading })).toBeFocused();
    expect((await axe(page)).violations).toEqual([]);
  });

  test('turns the page to the map with transitions off', async ({ page }) => {
    await page.getByLabel(controls.modes.off).check();
    await page.getByRole('button', { name: cover.signIn }).click();
    await expect(state(page)).toHaveText('open');

    await page.getByRole('button', { name: library.open }).click();

    await expect(state(page)).toHaveText('turned');
    await expect(page.getByRole('heading', { name: map.title })).toBeFocused();
    // A folha virada fica inerte: fora do alcance do teclado e do leitor de tela.
    const hiddenButton = page.getByRole('button', { name: library.open });
    expect(await hiddenButton.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
  });
});
