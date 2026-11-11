import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { WORLD_STRINGS } from '../src/app/core/strings/world.strings';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const { cover, library, createWorld } = BOOK_STRINGS;

const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const coverTitle = (page: Page) => page.getByRole('heading', { level: 1, name: cover.title });
const libraryTitle = (page: Page) => page.getByRole('heading', { level: 1, name: library.heading });
const worldTitle = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true });

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: cover.signIn }).click();
  await expect(page).toHaveURL('/biblioteca');
  await expect(libraryTitle(page)).toBeFocused();
}

async function createFirstWorld(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: library.createFirst }).click();
  const dialog = page.getByRole('dialog', { name: createWorld.title });
  await dialog.getByLabel(createWorld.name).fill(name);
  await dialog.getByRole('button', { name: createWorld.create }).click();
}

test.describe('book: cover → library → map', () => {
  test('the closed cover has no wcag a/aa violations', async ({ page }) => {
    await page.goto('/');
    await expect(coverTitle(page)).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
  });

  test('full flow: sign in, create a world, open its map, return and sign out', async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.getByText(library.empty)).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    // Criar mundo: a página vira e o zoom leva ao mapa.
    await createFirstWorld(page, 'Valmora');
    await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);
    await expect(worldTitle(page, 'Valmora')).toBeFocused();
    await expect(page.getByText(WORLD_STRINGS.noMap)).toBeVisible();
    // Na tela do mundo, o selo de demonstração fica dentro da barra superior.
    await expect(page.getByRole('banner').getByRole('note')).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    // Ícone do livro: zoom de volta e a página desvira.
    await page.getByRole('button', { name: WORLD_STRINGS.backToLibrary }).click();
    await expect(page).toHaveURL('/biblioteca');
    await expect(libraryTitle(page)).toBeFocused();
    await expect(page.getByRole('button', { name: /Valmora/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    // Sair: o livro fecha e volta à capa.
    await page.getByRole('button', { name: library.signOut }).click();
    await expect(page).toHaveURL('/');
    await expect(coverTitle(page)).toBeFocused();
  });

  test('Escape skips the opening of the cover', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: cover.signIn }).click();
    await expect(page.locator('main[aria-busy="true"]')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(libraryTitle(page)).toBeFocused({ timeout: 1500 });
  });

  test('a valid session skips the cover and direct links open without the book', async ({
    page,
  }) => {
    await signIn(page);
    await createFirstWorld(page, 'Ilhas de Sal');
    await expect(worldTitle(page, 'Ilhas de Sal')).toBeFocused();
    const worldUrl = page.url();

    await page.goto('/');
    await expect(page).toHaveURL('/biblioteca');
    await expect(libraryTitle(page)).toBeFocused();

    await page.goto(worldUrl);
    await expect(worldTitle(page, 'Ilhas de Sal')).toBeVisible();
  });

  test('reduced motion cross-fades through the whole flow', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page);
    await createFirstWorld(page, 'Vale Partido');
    await expect(worldTitle(page, 'Vale Partido')).toBeFocused();

    await page.getByRole('button', { name: WORLD_STRINGS.backToLibrary }).click();
    await expect(libraryTitle(page)).toBeFocused();
  });

  test('requires a name to create a world', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: library.createFirst }).click();
    const dialog = page.getByRole('dialog', { name: createWorld.title });

    await dialog.getByRole('button', { name: createWorld.create }).click();

    await expect(dialog.getByText(createWorld.nameRequired)).toBeVisible();
    await expect(dialog.getByLabel(createWorld.name)).toBeFocused();
    expect((await axe(page)).violations).toEqual([]);
  });
});
