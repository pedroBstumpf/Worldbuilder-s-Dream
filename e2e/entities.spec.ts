import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { ENTITY_KIND_STRINGS, ENTITY_STRINGS } from '../src/app/core/strings/entity.strings';
import { MAP_STRINGS } from '../src/app/core/strings/map.strings';
import { makePng } from './support/png';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const { cover, library, createWorld } = BOOK_STRINGS;
const text = ENTITY_STRINGS;

const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const toast = (page: Page, message: string) => page.locator('wd-toast-host').getByText(message);
const sheet = (page: Page, name: string) =>
  page.getByRole('region', { name: text.sheet.label(name) });
const explorerList = (page: Page) => page.locator('wd-explorer-panel [role="list"]');

/** Mundo novo com um mapa (o Explorar aparece com o mapa). */
async function openWorldWithMap(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: cover.signIn }).click();
  await page.getByRole('button', { name: library.createFirst }).click();
  const dialog = page.getByRole('dialog', { name: createWorld.title });
  await dialog.getByLabel(createWorld.name).fill(name);
  await dialog.getByRole('button', { name: createWorld.create }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: MAP_STRINGS.import.chooseFile }).click();
  await (
    await chooser
  ).setFiles({
    name: 'mapa.png',
    mimeType: 'image/png',
    buffer: makePng(800, 600),
  });
  await expect(page.getByRole('tab', { name: text.explorer.tabs.characters })).toBeVisible();
}

async function createEntity(page: Page, name: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: text.create.title });
  await dialog.getByLabel(text.create.name).fill(name);
  await dialog.getByRole('button', { name: text.create.submit }).click();
  await expect(sheet(page, name)).toBeVisible();
}

/** Espera a ficha gravar (o status "Salvo" aparece depois da pausa do autosave). */
async function saved(page: Page, name: string): Promise<void> {
  await expect(sheet(page, name).getByRole('status')).toContainText(text.sheet.status.saved);
}

test.describe('entities: explorer, sheet, mentions and search', () => {
  test('creates a character, edits the sheet and finds it by alias', async ({ page }) => {
    await openWorldWithMap(page, 'Eldoria');
    await expect(page.getByText(text.explorer.empty.characters)).toBeVisible();

    await page.getByRole('button', { name: ENTITY_KIND_STRINGS.character.create }).click();
    await createEntity(page, 'Aria');
    const aria = sheet(page, 'Aria');
    await expect(aria.getByLabel(text.sheet.name)).toBeFocused();

    await aria.getByLabel(text.sheet.subtitle).fill('Capitã da guarda');
    const aliases = aria.getByRole('textbox', { name: text.sheet.aliases });
    await aliases.fill('Lâmina Rubra');
    await aliases.press('Enter');
    await expect(aria.getByRole('listitem').filter({ hasText: 'Lâmina Rubra' })).toBeVisible();
    await expect(aliases).toHaveValue('');
    await saved(page, 'Aria');
    expect((await axe(page)).violations).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(aria).toHaveCount(0);
    await expect(explorerList(page).getByRole('button', { name: /Aria/ })).toBeFocused();

    await page.getByRole('searchbox').fill('lamina');
    await expect(explorerList(page)).toContainText(text.explorer.alsoKnownAs('Lâmina Rubra'));
    expect((await axe(page)).violations).toEqual([]);

    // A ficha volta pela URL.
    await explorerList(page).getByRole('button', { name: /Aria/ }).click();
    await expect(page).toHaveURL(/sel=[0-9a-f-]{36}/);
    await page.reload();
    await expect(sheet(page, 'Aria').getByLabel(text.sheet.subtitle)).toHaveValue(
      'Capitã da guarda',
    );
  });

  test('mentions an entity in the text and lists the citation', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await page.getByRole('button', { name: ENTITY_KIND_STRINGS.character.create }).click();
    await createEntity(page, 'Aria');
    await page.keyboard.press('Escape');

    // Ctrl+K: paleta de comandos → novo personagem.
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: text.palette.title });
    await palette.getByRole('combobox').fill('novo pers');
    await expect(
      palette.getByRole('option', { name: ENTITY_KIND_STRINGS.character.create }),
    ).toHaveAttribute('aria-selected', 'true');
    expect((await axe(page)).violations).toEqual([]);
    await page.keyboard.press('Enter');
    await createEntity(page, 'Bruno');

    const bruno = sheet(page, 'Bruno');
    await bruno.getByRole('tab', { name: text.sheet.tabs.text }).click();
    const editor = bruno.getByRole('textbox', { name: text.editor.textLabel('Bruno') });
    await editor.click();
    await page.keyboard.type('Aliado de @Ar');
    await expect(page.getByRole('option', { name: 'Aria' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(editor.locator('[data-type="mention"]')).toHaveText('@Aria');
    await saved(page, 'Bruno');
    expect((await axe(page)).violations).toEqual([]);

    // Busca pelo texto da ficha e abre a citada.
    await page.keyboard.press('Control+k');
    await palette.getByRole('combobox').fill('aria');
    await page.keyboard.press('Enter');
    const aria = sheet(page, 'Aria');
    await expect(aria.getByRole('button', { name: 'Bruno' })).toBeVisible();
  });

  test('moves an entity to the trash and undoes it', async ({ page }) => {
    await openWorldWithMap(page, 'Ermos');
    await page.getByRole('tab', { name: text.explorer.tabs.collection }).click();
    await page.getByRole('button', { name: text.explorer.create }).click();
    const dialog = page.getByRole('dialog', { name: text.create.title });
    await expect(
      dialog.getByRole('radio', { name: ENTITY_KIND_STRINGS.faction.one }),
    ).toBeChecked();
    await createEntity(page, 'Ordem da Rosa');

    await sheet(page, 'Ordem da Rosa').getByRole('button', { name: text.sheet.trash }).click();
    await expect(toast(page, text.sheet.trashed('Ordem da Rosa'))).toBeVisible();
    await expect(page.getByText(text.explorer.empty.collection)).toBeVisible();

    await page.locator('wd-toast-host').getByRole('button', { name: text.sheet.undo }).click();
    await expect(sheet(page, 'Ordem da Rosa')).toBeVisible();
    await expect(explorerList(page)).toContainText('Ordem da Rosa');
  });
});
