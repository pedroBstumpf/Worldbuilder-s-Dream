import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../../src/app/core/strings/book.strings';
import { MAP_STRINGS } from '../../src/app/core/strings/map.strings';
import { TIME_STRINGS } from '../../src/app/core/strings/time.strings';

/** Critérios WCAG 2.2 AA (RNF-05) medidos pelo axe. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const { cover, library, createWorld } = BOOK_STRINGS;

/** Violações WCAG A/AA da página inteira. */
export async function axeViolations(page: Page) {
  return (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations;
}

/** Espera as animações de entrada (o axe mediria o contraste no meio do fade). */
export async function settled(locator: Locator): Promise<void> {
  await locator.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
}

export const coverTitle = (page: Page) =>
  page.getByRole('heading', { level: 1, name: cover.title });
export const libraryTitle = (page: Page) =>
  page.getByRole('heading', { level: 1, name: library.heading });
export const worldTitle = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true });
export const timelineCursor = (page: Page) =>
  page.getByRole('slider', { name: TIME_STRINGS.timeline.cursor });
export const mapArea = (page: Page) => page.locator('wd-map-canvas [role="application"]');

/** Clica em "Entrar com Google" na capa (o livro começa a abrir). */
export async function clickSignIn(page: Page): Promise<void> {
  await page.goto('/');
  await expect(coverTitle(page)).toBeVisible();
  await page.getByRole('button', { name: cover.signIn }).click();
}

/** Cria o primeiro mundo pelo diálogo da biblioteca vazia (a página começa a virar). */
export async function createFirstWorld(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: library.createFirst }).click();
  const dialog = page.getByRole('dialog', { name: createWorld.title });
  await dialog.getByLabel(createWorld.name).fill(name);
  await dialog.getByRole('button', { name: createWorld.create }).click();
}

/** Solta um arquivo na janela, como o arrastar e soltar do sistema. */
export async function dropFile(page: Page, name: string, type: string, bytes: Uint8Array) {
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
    { name, type, bytes: [...bytes] },
  );
}

/** Espera o motor do mapa (PixiJS monta depois da tela; até lá, cliques não chegam). */
export async function mapReady(page: Page): Promise<void> {
  await expect(timelineCursor(page)).toBeVisible();
  await expect(mapArea(page)).not.toHaveAttribute('aria-busy', 'true');
}

export const mapImportTitle = (page: Page) =>
  page.getByRole('heading', { name: MAP_STRINGS.import.title });
