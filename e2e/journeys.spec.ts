import { expect, test, type Locator, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { ENTITY_KIND_STRINGS, ENTITY_STRINGS } from '../src/app/core/strings/entity.strings';
import { MAP_STRINGS } from '../src/app/core/strings/map.strings';
import { WORLD_STRINGS } from '../src/app/core/strings/world.strings';
import {
  axeViolations,
  clickSignIn,
  coverTitle,
  createFirstWorld,
  dropFile,
  libraryTitle,
  mapArea,
  mapImportTitle,
  mapReady,
  settled,
  timelineCursor,
  worldTitle,
} from './support/app';
import { makePng } from './support/png';

// Jornadas 1 e 2 do docs/03 › Testes: o roteiro da demonstração ao cliente (marco v0.1.0-demo).

const { library } = BOOK_STRINGS;
const tokens = MAP_STRINGS.tokens;

/** Como as transições do livro rodam: completas, com movimento reduzido ou puladas com Esc. */
type Motion = 'full' | 'reduced' | 'skipped';

/** Espera a transição terminar; em `skipped`, pula com Esc e exige o fim em até 1,5 s (RNF-04). */
async function through(page: Page, motion: Motion, arrival: Locator): Promise<void> {
  if (motion === 'skipped') {
    await expect(page.locator('main[aria-busy="true"]')).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(arrival).toBeFocused({ timeout: 1500 });
  } else {
    await expect(arrival).toBeFocused();
  }
}

test.describe('journey 1: cover → library → map', () => {
  for (const motion of ['full', 'reduced', 'skipped'] as const) {
    test(`opens the book, creates a world and turns the page (${motion})`, async ({ page }) => {
      if (motion === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });

      // Capa: o livro fechado, com o botão de entrar.
      await page.goto('/');
      await expect(coverTitle(page)).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      // O livro se abre na biblioteca vazia.
      await clickSignIn(page);
      await through(page, motion, libraryTitle(page));
      await expect(page).toHaveURL('/biblioteca');
      await expect(page.getByText(library.empty)).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      // Criar mundo: a página vira até a área de importação (mundo sem mapa).
      await createFirstWorld(page, 'Valmora');
      await through(page, motion, worldTitle(page, 'Valmora'));
      await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);
      await expect(mapImportTitle(page)).toBeVisible();
      // Na tela do mundo, o selo de demonstração fica dentro da barra superior.
      await expect(page.getByRole('banner').getByRole('note')).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      // O ícone do livro faz o caminho inverso, com o mundo marcado no sumário.
      await page.getByRole('button', { name: WORLD_STRINGS.backToLibrary }).click();
      await through(page, motion, libraryTitle(page));
      await expect(page.getByRole('button', { name: /^Valmora/ })).toHaveAttribute(
        'aria-current',
        'true',
      );

      // Sair fecha o livro.
      await page.getByRole('button', { name: library.signOut }).click();
      await through(page, motion, coverTitle(page));
      await expect(page).toHaveURL('/');
    });
  }
});

test.describe('journey 2: map and time', () => {
  const tokenList = (page: Page) => page.getByRole('navigation', { name: tokens.list });

  /** Posição do token pela descrição da lista acessível espelhada (em % do mapa). */
  async function positionOf(item: Locator): Promise<{ x: number; y: number }> {
    const id = await item.getAttribute('aria-describedby');
    const text = (await item.page().locator(`[id="${id}"]`).textContent()) ?? '';
    const match = /(\d+)% da esquerda, (\d+)% do topo/.exec(text);
    if (!match) throw new Error(`descrição sem posição: "${text}"`);
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  test('drops a map, places a character, moves it in time, measures and undoes', async ({
    page,
  }) => {
    await clickSignIn(page);
    await expect(libraryTitle(page)).toBeFocused();
    await createFirstWorld(page, 'Valmora');
    await expect(mapImportTitle(page)).toBeVisible();

    // Soltar a imagem em qualquer ponto da janela cria o mapa (RF-10).
    await dropFile(page, 'valmora.png', 'image/png', makePng(800, 600));
    await mapReady(page);
    expect(await axeViolations(page)).toEqual([]);

    // Novo personagem: a ficha abre e mostra que ele ainda não está no mapa.
    await page.getByRole('button', { name: ENTITY_KIND_STRINGS.character.create }).click();
    const dialog = page.getByRole('dialog', { name: ENTITY_STRINGS.create.title });
    await dialog.getByLabel(ENTITY_STRINGS.create.name).fill('Aria');
    await dialog.getByRole('button', { name: ENTITY_STRINGS.create.submit }).click();
    const sheet = page.locator('wd-entity-sheet');
    await expect(sheet.getByText(tokens.sheet.absent('valmora'))).toBeVisible();
    await settled(sheet);
    expect(await axeViolations(page)).toEqual([]);
    await page.getByRole('button', { name: ENTITY_STRINGS.sheet.close }).click();

    // Arrastar do Explorar para o mapa no início do mundo (RF-05).
    await timelineCursor(page).focus();
    await page.keyboard.press('Home');
    const row = page
      .locator('wd-explorer-panel [role="list"]')
      .getByRole('button', { name: /Aria/ });
    await row.dragTo(mapArea(page), { targetPosition: { x: 450, y: 400 } });
    const item = tokenList(page).getByRole('button', { name: tokens.listItem('Aria') });
    await expect(item).toHaveCount(1);
    await expect(page.getByText(tokens.placed('Aria', '1 EC'))).toBeAttached();
    const start = await positionOf(item);

    // No fim do mundo, o token continua onde entrou.
    await timelineCursor(page).focus();
    await page.keyboard.press('End');
    await expect(item).toHaveAccessibleDescription(tokens.position(start.x, start.y));

    // Arrastar o token no fim grava a segunda posição (RF-06).
    await page.mouse.move(450, 400);
    await page.mouse.down();
    await page.mouse.move(600, 340, { steps: 8 });
    await page.mouse.move(750, 280, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText(tokens.moved('Aria', '100 EC'))).toBeAttached();
    await expect(item).not.toHaveAccessibleDescription(tokens.position(start.x, start.y));
    const end = await positionOf(item);
    expect(end.x).toBeGreaterThan(start.x + 10);
    expect(end.y).toBeLessThan(start.y - 5);

    // No meio do caminho (51 EC, de 1 a 100 EC), a posição é interpolada (RF-07).
    await timelineCursor(page).focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect(item).not.toHaveAccessibleDescription(tokens.position(start.x, start.y));
    const middle = await positionOf(item);
    const alpha = 50 / 99;
    expect(Math.abs(middle.x - (start.x + (end.x - start.x) * alpha))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(middle.y - (start.y + (end.y - start.y) * alpha))).toBeLessThanOrEqual(1.5);

    // Régua: dois cliques medem em px (mapa sem escala, RF-08); Esc limpa.
    await mapArea(page).focus();
    await page.keyboard.press('r');
    await expect(page.getByText(MAP_STRINGS.hints.measure)).toBeVisible();
    await page.mouse.click(500, 500);
    await page.mouse.click(700, 500);
    const total = page.getByText(/^Total: .+ px\.$/);
    await expect(total).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(total).toHaveCount(0);

    // Desfazer tira a segunda posição: o token volta a ficar parado; refazer devolve.
    await page.keyboard.press('Control+z');
    await expect(item).toHaveAccessibleDescription(tokens.position(start.x, start.y));
    await page.keyboard.press('Control+Shift+z');
    await expect(item).toHaveAccessibleDescription(tokens.position(middle.x, middle.y));
  });
});
