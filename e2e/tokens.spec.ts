import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { ENTITY_KIND_STRINGS, ENTITY_STRINGS } from '../src/app/core/strings/entity.strings';
import { MAP_STRINGS } from '../src/app/core/strings/map.strings';
import { TIME_STRINGS } from '../src/app/core/strings/time.strings';
import { makePng } from './support/png';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const { cover, library, createWorld } = BOOK_STRINGS;
const text = ENTITY_STRINGS;
const cursor = (page: Page) => page.getByRole('slider', { name: TIME_STRINGS.timeline.cursor });
const explorerList = (page: Page) => page.locator('wd-explorer-panel [role="list"]');

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
  ).setFiles({ name: 'mapa.png', mimeType: 'image/png', buffer: makePng(800, 600) });
  await expect(cursor(page)).toBeVisible();
}

async function createCharacter(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: ENTITY_KIND_STRINGS.character.create }).click();
  const dialog = page.getByRole('dialog', { name: text.create.title });
  await dialog.getByLabel(text.create.name).fill(name);
  await dialog.getByRole('button', { name: text.create.submit }).click();
  await page.getByRole('button', { name: text.sheet.close }).click();
}

const tokens = MAP_STRINGS.tokens;
const tokenList = (page: Page) => page.getByRole('navigation', { name: tokens.list });
const mapArea = (page: Page) => page.locator('wd-map-canvas [role="application"]');

/** Arrasta a linha da entidade do Explorar para um ponto da tela. */
async function dropOnMap(page: Page, name: string, x: number, y: number): Promise<void> {
  const row = explorerList(page).getByRole('button', { name: new RegExp(name) });
  await row.dragTo(mapArea(page), { targetPosition: { x, y } });
}

test.describe('tokens: drag to the map, keyframes and undo', () => {
  test('drops a character, opens the token menu and undoes', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await createCharacter(page, 'Aria');
    await expect(tokenList(page)).toHaveCount(0);

    // Entra no mapa em 11 EC (a posição nasce no instante do cursor).
    await cursor(page).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await dropOnMap(page, 'Aria', 500, 400);
    const item = tokenList(page).getByRole('button', { name: tokens.listItem('Aria') });
    await expect(item).toHaveCount(1);
    await expect(page.getByText(tokens.placed('Aria', '11 EC'))).toBeAttached();

    // Antes desse instante o token não está no mapa; depois, fica parado onde entrou.
    await cursor(page).focus();
    await page.keyboard.press('Home');
    await expect(item).toHaveCount(0);
    await page.keyboard.press('End');
    await expect(item).toHaveCount(1);
    expect((await axe(page)).violations).toEqual([]);

    // A lista abre o menu do token pelo teclado.
    await item.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: tokens.menu.label('Aria') });
    await expect(menu).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await menu.getByRole('menuitem', { name: tokens.menu.remove }).click();
    await expect(item).toHaveCount(0);

    await page.keyboard.press('Control+z');
    await expect(item).toHaveCount(1);
    await page.keyboard.press('Control+Shift+z');
    await expect(item).toHaveCount(0);
  });

  test('right click opens the menu and Del asks what to remove', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await createCharacter(page, 'Aria');
    await dropOnMap(page, 'Aria', 500, 400);
    const item = tokenList(page).getByRole('button', { name: tokens.listItem('Aria') });
    await expect(item).toHaveCount(1);

    await mapArea(page).click({ button: 'right', position: { x: 500, y: 400 } });
    await expect(page.getByRole('menu', { name: tokens.menu.label('Aria') })).toBeVisible();
    await page.keyboard.press('Escape');

    // O drop seleciona o token: Del pergunta o que remover.
    await mapArea(page).focus();
    await page.keyboard.press('Delete');
    const dialog = page.getByRole('dialog', { name: tokens.removeDialog.title });
    await dialog.getByRole('button', { name: tokens.removeDialog.token }).click();
    await expect(item).toHaveCount(0);
  });

  test('moves the token at another instant and shows the trail', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await createCharacter(page, 'Aria');
    await dropOnMap(page, 'Aria', 400, 400);
    await expect(tokenList(page).getByRole('button')).toHaveCount(1);

    // Vai ao fim do mundo e arrasta o token: nasce uma segunda posição.
    await cursor(page).focus();
    await page.keyboard.press('End');
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(550, 300, { steps: 8 });
    await page.mouse.move(700, 250, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText(tokens.moved('Aria', '100 EC'))).toBeAttached();

    // No meio do caminho, o token continua no mapa.
    await cursor(page).focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect(tokenList(page).getByRole('button')).toHaveCount(1);
  });

  test('places a character from the sheet with the keyboard', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await page.getByRole('button', { name: ENTITY_KIND_STRINGS.character.create }).click();
    const dialog = page.getByRole('dialog', { name: text.create.title });
    await dialog.getByLabel(text.create.name).fill('Aria');
    await dialog.getByRole('button', { name: text.create.submit }).click();
    const sheetText = tokens.sheet;
    const sheet = page.locator('wd-entity-sheet');
    await expect(sheet.getByText(sheetText.absent('mapa'))).toBeVisible();

    // Marcar posição: Enter marca no centro da área visível.
    await sheet.getByRole('button', { name: sheetText.place('1 EC') }).click();
    await page.keyboard.press('Enter');
    await expect(tokenList(page).getByRole('button')).toHaveCount(1);
    const positions = sheet.getByRole('list', { name: sheetText.positions });
    await expect(positions.getByRole('listitem')).toHaveCount(1);

    // Outra posição no fim do mundo, com movimento suave a partir da primeira.
    await cursor(page).focus();
    await page.keyboard.press('End');
    await sheet.getByRole('button', { name: sheetText.place('100 EC') }).click();
    // A dica aparece quando a ferramenta já chegou ao mapa.
    await expect(page.getByText(sheetText.placeHint('Aria', '100 EC'))).toBeVisible();
    await page.mouse.click(700, 250);
    await expect(positions.getByRole('listitem')).toHaveCount(2);
    const first = positions.getByRole('combobox').first();
    await first.selectOption('ease');
    await expect(first).toHaveValue('ease');
    expect((await axe(page)).violations).toEqual([]);

    // Remover a posição em vigor pelo botão da linha.
    await positions
      .getByRole('button', { name: /Remover a posição/ })
      .last()
      .click();
    await expect(positions.getByRole('listitem')).toHaveCount(1);
  });
});
