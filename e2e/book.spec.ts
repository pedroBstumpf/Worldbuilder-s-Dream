import { expect, test, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import {
  axeViolations,
  clickSignIn,
  createFirstWorld,
  libraryTitle,
  settled,
  worldTitle,
} from './support/app';

// O caminho capa → biblioteca → mapa (completo, com movimento reduzido e pulado com Esc)
// é a jornada 1, em journeys.spec.ts. Aqui ficam os desvios do caminho.

const { library, createWorld } = BOOK_STRINGS;

async function signIn(page: Page): Promise<void> {
  await clickSignIn(page);
  await expect(page).toHaveURL('/biblioteca');
  await expect(libraryTitle(page)).toBeFocused();
}

test.describe('book: cover → library → map', () => {
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

  test('requires a name to create a world', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: library.createFirst }).click();
    const dialog = page.getByRole('dialog', { name: createWorld.title });

    await dialog.getByRole('button', { name: createWorld.create }).click();

    await expect(dialog.getByText(createWorld.nameRequired)).toBeVisible();
    await expect(dialog.getByLabel(createWorld.name)).toBeFocused();
    await settled(dialog);
    expect(await axeViolations(page)).toEqual([]);
  });
});
