import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { MAP_STRINGS } from '../src/app/core/strings/map.strings';
import { TIME_STRINGS } from '../src/app/core/strings/time.strings';
import { makePng } from './support/png';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const { cover, library, createWorld } = BOOK_STRINGS;
const text = MAP_STRINGS;
const versions = MAP_STRINGS.versions;

const toast = (page: Page, message: string | RegExp) =>
  page.locator('wd-toast-host').getByText(message);
const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const markers = (page: Page) =>
  page.getByRole('button', { name: /^Versão da imagem do mapa a partir de/ });

async function openWorldWithMap(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: cover.signIn }).click();
  await page.getByRole('button', { name: library.createFirst }).click();
  const dialog = page.getByRole('dialog', { name: createWorld.title });
  await dialog.getByLabel(createWorld.name).fill('Cataclismo');
  await dialog.getByRole('button', { name: createWorld.create }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: text.import.chooseFile }).click();
  await (
    await chooser
  ).setFiles({
    name: 'continente.png',
    mimeType: 'image/png',
    buffer: makePng(1600, 1000),
  });
  // O motor desenha a cena depois que a linha do tempo aparece.
  await expect(page.locator('wd-map-canvas [role=application]')).not.toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(page.getByRole('status').filter({ hasText: text.upload.saving })).toHaveCount(0);
}

/** Solta um PNG na janela, como o arrastar e soltar do sistema. */
async function dropPng(page: Page, name: string, width: number, height: number) {
  await page.evaluate(
    ({ name, bytes }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
      for (const kind of ['dragenter', 'dragover', 'drop']) {
        window.dispatchEvent(
          new DragEvent(kind, { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
      }
    },
    { name, bytes: [...makePng(width, height)] },
  );
}

test.describe('map image versions in time', () => {
  test('creates versions by dropping and from the panel, removes and restores', async ({
    page,
  }) => {
    await openWorldWithMap(page);

    // Soltar uma imagem com o mapa aberto: terceira opção, "Nova versão a partir de…".
    await dropPng(page, 'depois.png', 800, 500);
    const choice = page.getByRole('dialog', { name: text.choice.title });
    await choice.getByRole('button', { name: /^Nova versão a partir de/ }).click();
    const create = page.getByRole('dialog', { name: text.versionDialog.createTitle });
    await create.getByLabel(TIME_STRINGS.date.year).fill('10');
    // Mesma proporção do mapa: não pergunta corte nem margens.
    await expect(create.getByText(text.versionDialog.mismatch)).toHaveCount(0);
    await create.getByRole('button', { name: text.versionDialog.create }).click();
    await expect(toast(page, /^Nova versão da imagem a partir de/)).toBeVisible();
    await expect(markers(page)).toHaveCount(1);

    // Popover do marcador: miniatura e "Ir para a data".
    await markers(page).first().focus();
    await expect(
      page.getByRole('group', { name: /^Versão da imagem/ }).locator('img'),
    ).toBeVisible();

    // Pelo painel do título: uma imagem quadrada pede corte ou margens.
    await page.getByRole('button', { name: /continente\s*, trocar de mapa/ }).click();
    await page.getByRole('menuitem', { name: text.selector.versions }).click();
    const panel = page.getByRole('dialog', { name: versions.title });
    await expect(panel.getByText(versions.base, { exact: true })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    const chooser = page.waitForEvent('filechooser');
    await panel.getByRole('button', { name: versions.add }).click();
    await (
      await chooser
    ).setFiles({
      name: 'ruinas.png',
      mimeType: 'image/png',
      buffer: makePng(900, 900),
    });
    const fit = page.getByRole('dialog', { name: text.versionDialog.createTitle });
    await expect(fit.getByText(text.versionDialog.mismatch)).toBeVisible();
    await expect(
      fit.getByRole('radio', { name: new RegExp(text.versionDialog.crop) }),
    ).toBeChecked();
    await fit.getByRole('radio', { name: new RegExp(text.versionDialog.pad) }).check();
    await fit.getByLabel(TIME_STRINGS.date.year).fill('20');
    await fit.getByRole('button', { name: text.versionDialog.create }).click();
    await expect(markers(page)).toHaveCount(2);

    // Remove a primeira versão e desfaz.
    await page.getByRole('button', { name: /continente\s*, trocar de mapa/ }).click();
    await page.getByRole('menuitem', { name: text.selector.versions }).click();
    await panel
      .getByRole('button', { name: /^Remover a versão de/ })
      .first()
      .click();
    const removeButtons = panel.getByRole('button', { name: /^Remover a versão de/ });
    await expect(removeButtons).toHaveCount(1);
    await expect(panel.getByRole('button', { name: versions.undo })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(removeButtons).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(markers(page)).toHaveCount(2);

    // As versões ficam gravadas.
    await page.reload();
    await expect(markers(page)).toHaveCount(2);
  });
});
