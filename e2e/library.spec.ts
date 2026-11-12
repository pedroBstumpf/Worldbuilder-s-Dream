import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { WORLD_STRINGS } from '../src/app/core/strings/world.strings';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const { cover, library, createWorld, renameWorld, deleteWorld, libraryToasts } = BOOK_STRINGS;
const { actions, viewNames } = library;

const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const libraryTitle = (page: Page) => page.getByRole('heading', { level: 1, name: library.heading });
/** Página direita (a página do mapa, sob a folha, e as faixas da virada repetem o conteúdo). */
const front = (page: Page) => page.locator('.leaf wd-world-frontispiece');
const frontispiece = (page: Page, name: string) =>
  front(page).getByRole('heading', { name, exact: true });
const tocEntry = (page: Page, name: string) =>
  page.getByRole('listitem').getByRole('button', { name: new RegExp(`^${name}\\b`) });

/** Espera as animações de entrada (o axe mediria o contraste no meio do fade). */
async function settled(locator: Locator): Promise<void> {
  await locator.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: cover.signIn }).click();
  await expect(libraryTitle(page)).toBeFocused();
}

/** Cria o mundo (a página vira até o mapa) e volta à biblioteca. */
async function createWorldAndReturn(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: library.createFirst }).click();
  const dialog = page.getByRole('dialog', { name: createWorld.title });
  await dialog.getByLabel(createWorld.name).fill(name);
  await dialog.getByRole('button', { name: createWorld.create }).click();
  await expect(page).toHaveURL(/\/w\//);
  await page.getByRole('button', { name: WORLD_STRINGS.backToLibrary }).click();
  await expect(libraryTitle(page)).toBeFocused();
}

async function worldAction(page: Page, name: string, action: string): Promise<void> {
  await page.getByRole('button', { name: library.actionsFor(name) }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

test.describe('library: manage, export and import worlds', () => {
  // Jornadas longas: criar o mundo já passa pela virada de página e pelo mapa.
  test.slow();

  test('rename, duplicate, archive, trash, restore and delete forever', async ({ page }) => {
    await signIn(page);
    await createWorldAndReturn(page, 'Valmora');

    // Renomear: o diálogo vem preenchido.
    await worldAction(page, 'Valmora', actions.rename);
    const rename = page.getByRole('dialog', { name: renameWorld.title });
    await expect(rename.getByLabel(createWorld.name)).toHaveValue('Valmora');
    await rename.getByLabel(createWorld.name).fill('Valmora Antiga');
    await rename.getByRole('button', { name: renameWorld.save }).click();
    await expect(frontispiece(page, 'Valmora Antiga')).toBeVisible();

    // Duplicar: a cópia entra no sumário e fica escolhida.
    await worldAction(page, 'Valmora Antiga', actions.duplicate);
    await expect(frontispiece(page, 'Valmora Antiga (cópia)')).toBeVisible();
    await expect(tocEntry(page, 'Valmora Antiga')).toHaveCount(2);

    // Arquivar a cópia: sai do sumário e aparece na aba Arquivados.
    await worldAction(page, 'Valmora Antiga (cópia)', actions.archive);
    await expect(page.getByText(libraryToasts.archived('Valmora Antiga (cópia)'))).toBeVisible();
    await expect(tocEntry(page, 'Valmora Antiga')).toHaveCount(1);
    await page.getByRole('tab', { name: library.viewCount(viewNames.archived, 1) }).click();
    await expect(frontispiece(page, 'Valmora Antiga (cópia)')).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    // Lixeira com "Desfazer" e depois restaurar pela aba.
    await page.getByRole('tab', { name: viewNames.worlds }).click();
    await worldAction(page, 'Valmora Antiga', actions.trash);
    await page
      .getByRole('listitem')
      .filter({ hasText: libraryToasts.trashed('Valmora Antiga') })
      .getByRole('button', { name: libraryToasts.undo })
      .click();
    await expect(frontispiece(page, 'Valmora Antiga')).toBeVisible();
    await worldAction(page, 'Valmora Antiga', actions.trash);
    await page.getByRole('tab', { name: library.viewCount(viewNames.trash, 1) }).click();
    await expect(front(page).getByText(library.trashedOn(''))).toBeVisible();
    await page.getByRole('button', { name: actions.restore }).click();
    await expect(front(page).getByText(library.trashHint)).toBeVisible();

    // Excluir para sempre pede confirmação.
    await page.getByRole('tab', { name: viewNames.worlds }).click();
    await worldAction(page, 'Valmora Antiga', actions.trash);
    await page.getByRole('tab', { name: library.viewCount(viewNames.trash, 1) }).click();
    await page.getByRole('button', { name: actions.delete }).click();
    const confirm = page.getByRole('dialog', { name: deleteWorld.title });
    await settled(confirm);
    expect((await axe(page)).violations).toEqual([]);
    await confirm.getByRole('button', { name: deleteWorld.confirm }).click();
    await expect(page.getByText(libraryToasts.deleted('Valmora Antiga'))).toBeVisible();
    await expect(page.getByRole('tab', { name: viewNames.trash, exact: true })).toBeVisible();
  });

  test('exports a world to json and imports it into a blank book', async ({ page }) => {
    await signIn(page);
    await createWorldAndReturn(page, 'Eldoria');

    const downloading = page.waitForEvent('download');
    await worldAction(page, 'Eldoria', actions.export);
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^eldoria-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(await readFile(await download.path(), 'utf8')) as {
      format: string;
      world: { name: string };
    };
    expect(file).toMatchObject({ format: 'worldbuilders-dream/world', world: { name: 'Eldoria' } });

    // Livro em branco de novo: lixeira e excluir para sempre.
    await worldAction(page, 'Eldoria', actions.trash);
    await page.getByRole('tab', { name: library.viewCount(viewNames.trash, 1) }).click();
    await page.getByRole('button', { name: actions.delete }).click();
    await page
      .getByRole('dialog', { name: deleteWorld.title })
      .getByRole('button', { name: deleteWorld.confirm })
      .click({ timeout: 5000 });
    await expect(page.getByText(library.empty)).toBeVisible();

    // Importar pelo livro em branco: o mundo volta, com outro id.
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: library.importWorld }).click();
    await (await choosing).setFiles(await download.path());
    await expect(page.getByText(libraryToasts.imported('Eldoria'))).toBeVisible();
    await expect(frontispiece(page, 'Eldoria')).toBeVisible();

    // Um arquivo que não é mundo é recusado com aviso.
    const choosingBad = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: library.importWorld }).click();
    await (
      await choosingBad
    ).setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await expect(page.getByText(libraryToasts.invalidFile)).toBeVisible();
  });
});
