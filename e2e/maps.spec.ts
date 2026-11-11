import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { MAP_STRINGS } from '../src/app/core/strings/map.strings';
import { makePng } from './support/png';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const { cover, library, createWorld } = BOOK_STRINGS;
const text = MAP_STRINGS;

/** Avisos (o texto também vai para a região aria-live do anúncio). */
const toast = (page: Page, message: string | RegExp) =>
  page.locator('wd-toast-host').getByText(message);
const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const canvas = (page: Page, name: string) =>
  page.getByRole('application', { name: text.canvas.label(name) });

async function openNewWorld(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: cover.signIn }).click();
  await page.getByRole('button', { name: library.createFirst }).click();
  const dialog = page.getByRole('dialog', { name: createWorld.title });
  await dialog.getByLabel(createWorld.name).fill(name);
  await dialog.getByRole('button', { name: createWorld.create }).click();
  await expect(page.getByRole('heading', { name: text.import.title })).toBeVisible();
}

/** "Escolher arquivo" abre o seletor do sistema; o teste entrega o PNG. */
async function chooseFile(page: Page, name: string, width: number, height: number) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: text.import.chooseFile }).click();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: makePng(width, height) });
}

/** Solta um arquivo na janela, como o arrastar e soltar do sistema. */
async function dropFile(page: Page, name: string, type: string, bytes: number[]) {
  await page.evaluate(
    ({ name, type, bytes }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
      for (const kind of ['dragenter', 'dragover', 'drop']) {
        window.dispatchEvent(
          new DragEvent(kind, { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
      }
    },
    { name, type, bytes },
  );
}

/** Clica num ponto do canvas, em frações da área da tela. */
async function clickMap(page: Page, fx: number, fy: number) {
  const size = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.click(Math.round(size.width * fx), Math.round(size.height * fy));
}

test.describe('maps: import, tree, scale and links', () => {
  test('imports the first map, saves it and reopens it from the url', async ({ page }) => {
    await openNewWorld(page, 'Valmora');
    expect((await axe(page)).violations).toEqual([]);

    await chooseFile(page, 'valmora_mapa-antigo.png', 1600, 1000);

    await expect(canvas(page, 'valmora mapa antigo')).toBeVisible();
    await expect(toast(page, text.import.created('valmora mapa antigo'))).toBeVisible();
    await expect(page).toHaveURL(/\?map=[0-9a-f-]{36}$/);
    await expect(page.locator('wd-map-canvas canvas')).toHaveCount(1);
    // O envio em segundo plano termina (o anel de progresso some).
    await expect(page.getByRole('status').filter({ hasText: text.upload.saving })).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);

    await page.reload();
    await expect(canvas(page, 'valmora mapa antigo')).toBeVisible();
  });

  test('rejects files that are not images', async ({ page }) => {
    await openNewWorld(page, 'Ilhas');
    await dropFile(page, 'notas.png', 'image/png', [0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4]);
    await expect(toast(page, text.import.errors.not_image)).toBeVisible();
    await expect(page.getByRole('heading', { name: text.import.title })).toBeVisible();
  });

  test('builds a map tree, links regions and switches maps', async ({ page }) => {
    await openNewWorld(page, 'Reino');
    await chooseFile(page, 'reino.png', 1200, 800);
    await expect(canvas(page, 'reino')).toBeVisible();

    // Segundo mapa por arrastar e soltar: vira submapa do atual.
    const png = [...makePng(400, 300)];
    await dropFile(page, 'porto.png', 'image/png', png);
    const choice = page.getByRole('dialog', { name: text.choice.title });
    await choice.getByRole('button', { name: new RegExp(text.choice.createChild) }).click();
    await expect(canvas(page, 'porto')).toBeVisible();

    // Seletor no título: a árvore tem o pai e o filho; volta ao mapa do reino.
    await page.getByRole('button', { name: /porto\s*, trocar de mapa/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitemradio')).toHaveText([/reino$/, /porto$/]);
    await menu.getByRole('menuitemradio', { name: 'reino' }).click();
    await expect(canvas(page, 'reino')).toBeVisible();

    // Link: desenha um triângulo e escolhe o porto.
    await page
      .getByRole('toolbar', { name: text.toolbar.label })
      .getByRole('button', { name: text.toolbar.link })
      .click();
    await expect(page.getByText(text.hints.link)).toBeVisible();
    await clickMap(page, 0.4, 0.4);
    await clickMap(page, 0.5, 0.4);
    await clickMap(page, 0.45, 0.55);
    await page.keyboard.press('Enter');
    const target = page.getByRole('dialog', { name: text.link.title });
    await expect(target.getByRole('radio', { name: 'porto' })).toBeChecked();
    await target.getByRole('button', { name: text.link.create }).click();
    await expect(toast(page, text.link.created('porto'))).toBeVisible();

    // O link também é um botão (teclado e leitor de tela).
    const open = page.getByRole('button', { name: text.canvas.openLink('porto') });
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(canvas(page, 'porto')).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
  });

  test('sets the scale from a line drawn on the map', async ({ page }) => {
    await openNewWorld(page, 'Escala');
    await chooseFile(page, 'escala.png', 1000, 1000);
    await expect(canvas(page, 'escala')).toBeVisible();

    // Na barra (o aviso de mapa criado também oferece "Definir escala").
    const toolbar = page.getByRole('toolbar', { name: text.toolbar.label });
    await toolbar.getByRole('button', { name: text.toolbar.calibrate }).click();
    await expect(page.getByText(text.hints.calibrate[0])).toBeVisible();
    await clickMap(page, 0.3, 0.5);
    await clickMap(page, 0.5, 0.5);
    const dialog = page.getByRole('dialog', { name: text.scale.title });
    await dialog.getByLabel(text.scale.length).fill('100');
    await dialog.getByLabel(text.scale.unit).selectOption('league');
    await dialog.getByRole('button', { name: text.scale.save }).click();
    await expect(toast(page, /Escala definida: 1 px = .* léguas\./)).toBeVisible();
  });

  test('bars collapse with shortcuts and remember it', async ({ page }) => {
    await openNewWorld(page, 'Barras');
    await chooseFile(page, 'barras.png', 800, 600);
    await expect(canvas(page, 'barras')).toBeVisible();

    await page.keyboard.press('[');
    await page.keyboard.press(']');
    await expect(page.getByRole('button', { name: text.toolbar.expand })).toBeVisible();
    await expect(page.getByRole('button', { name: text.explorer.expand })).toBeVisible();

    // Preferências gravadas no perfil (ui_prefs) depois de uma pausa.
    await page.waitForTimeout(1200);
    await page.reload();
    await expect(page.getByRole('button', { name: text.toolbar.expand })).toBeVisible();

    await page.keyboard.press('v');
    await page.getByRole('button', { name: text.toolbar.expand }).click();
    await expect(page.getByRole('button', { name: text.toolbar.select })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
