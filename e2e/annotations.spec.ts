import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { MAP_STRINGS } from '../src/app/core/strings/map.strings';
import { TIME_STRINGS } from '../src/app/core/strings/time.strings';
import { makePng } from './support/png';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const { cover, library, createWorld } = BOOK_STRINGS;
const text = MAP_STRINGS.annotations;
const toolbar = MAP_STRINGS.toolbar;
const cursor = (page: Page) => page.getByRole('slider', { name: TIME_STRINGS.timeline.cursor });
const mapArea = (page: Page) => page.locator('wd-map-canvas [role="application"]');
const list = (page: Page) => page.getByRole('navigation', { name: text.list });
const item = (page: Page, kind: keyof typeof text.kinds, title = '') =>
  list(page).getByRole('button', { name: text.listItem(text.kinds[kind], title), exact: true });
const editor = (page: Page, kind: keyof typeof text.kinds) =>
  page.getByRole('dialog', { name: text.editor.label(text.kinds[kind]) });

/** Rádios visualmente ocultos (cores, ícones, espessuras): clica no rótulo visível. */
const choice = (scope: Locator, name: string) =>
  scope.locator('label', { has: scope.page().getByRole('radio', { name, exact: true }) });

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
  // O motor (PixiJS) monta depois da tela: até lá, cliques e teclas não chegam ao mapa.
  await expect(mapArea(page)).not.toHaveAttribute('aria-busy', 'true');
}

/** Ponto no meio da área visível do mapa (entre as barras), em coordenadas da janela. */
async function mapCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await mapArea(page).boundingBox();
  if (!box) throw new Error('mapa sem área');
  return { x: box.x + box.width * 0.42, y: box.y + box.height * 0.45 };
}

/** Escolhe a ferramenta pelo atalho e espera a dica (a ferramenta já chegou ao motor). */
async function useTool(page: Page, key: string, hint: string): Promise<void> {
  await page.keyboard.press(key);
  await expect(page.getByText(hint)).toBeVisible();
}

async function drag(page: Page, points: { x: number; y: number }[]): Promise<void> {
  const [first, ...rest] = points;
  if (!first) return;
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 8 });
  await page.mouse.up();
}

test.describe('map tools: pins, labels, brush, eraser, region and ruler', () => {
  test('marks a pin by keyboard, edits it and limits it in time', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    const pinTool = page.getByRole('button', { name: toolbar.pin });

    await mapArea(page).focus();
    await page.keyboard.press('p');
    await expect(pinTool).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(MAP_STRINGS.hints.pin)).toBeVisible();
    await mapArea(page).focus();
    await page.keyboard.press('Enter');

    // O editor abre junto do pino com o foco no título.
    const pinEditor = editor(page, 'pin');
    await expect(pinEditor).toBeVisible();
    const title = pinEditor.getByLabel(text.editor.title);
    await expect(title).toBeFocused();
    await title.fill('Forte do Norte');
    await page.keyboard.press('Enter');
    await choice(pinEditor, text.icons.castle).click();
    await choice(pinEditor, text.colors.tinta).click();
    await expect(pinEditor.getByRole('radio', { name: text.colors.tinta })).toBeChecked();
    expect((await axe(page)).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(pinEditor).toHaveCount(0);
    await expect(item(page, 'pin', 'Forte do Norte')).toHaveCount(1);

    // "A partir de" nasce no cursor (10 EC): antes disso o pino some.
    await page.keyboard.press('h');
    await cursor(page).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await item(page, 'pin', 'Forte do Norte').focus();
    await page.keyboard.press('Enter');
    await pinEditor.getByLabel(text.editor.from).first().check();
    await pinEditor.getByRole('button', { name: text.editor.close }).click();
    await cursor(page).focus();
    await page.keyboard.press('Home');
    await expect(item(page, 'pin', 'Forte do Norte')).toHaveCount(0);
    await page.keyboard.press('End');
    await expect(item(page, 'pin', 'Forte do Norte')).toHaveCount(1);

    // Excluir pelo editor; o aviso desfaz.
    await item(page, 'pin', 'Forte do Norte').focus();
    await page.keyboard.press('Enter');
    await pinEditor.getByRole('button', { name: text.editor.remove }).click();
    await expect(item(page, 'pin', 'Forte do Norte')).toHaveCount(0);
    await page.getByRole('button', { name: text.editor.undo }).click();
    await expect(item(page, 'pin', 'Forte do Norte')).toHaveCount(1);
  });

  test('writes a label and draws a region', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    const center = await mapCenter(page);

    await page.getByRole('button', { name: toolbar.text }).click();
    await expect(page.getByText(MAP_STRINGS.hints.label)).toBeVisible();
    await page.mouse.click(center.x, center.y);
    const labelEditor = editor(page, 'label');
    await labelEditor.getByLabel(text.editor.text).fill('Reino de Asterra');
    await choice(labelEditor, text.editor.sizes.lg).click();
    await expect(item(page, 'label', 'Reino de Asterra')).toHaveCount(1);
    await labelEditor.getByRole('button', { name: text.editor.close }).click();

    await useTool(page, 'g', MAP_STRINGS.hints.region);
    await expect(page.getByRole('button', { name: toolbar.region })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.mouse.click(center.x - 80, center.y - 60);
    await page.mouse.click(center.x + 60, center.y - 70);
    await page.mouse.click(center.x + 40, center.y + 50);
    await mapArea(page).focus();
    await page.keyboard.press('Enter');
    const regionEditor = editor(page, 'region');
    await expect(regionEditor).toBeVisible();
    await regionEditor.getByLabel(text.editor.title).fill('Terras de Asterra');
    await page.keyboard.press('Enter');
    expect((await axe(page)).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(item(page, 'region', 'Terras de Asterra')).toHaveCount(1);

    // Com "Selecionar", clicar dentro da região abre o editor de novo.
    await page.keyboard.press('v');
    await expect(page.getByText(MAP_STRINGS.hints.region)).toHaveCount(0);
    await page.mouse.click(center.x, center.y - 20);
    await expect(regionEditor).toBeVisible();
  });

  test('draws with the brush, erases the stroke and undoes', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    const c = await mapCenter(page);

    await useTool(page, 'b', MAP_STRINGS.hints.brush);
    const options = page.getByRole('group', { name: text.options.label });
    await choice(options, text.options.dashed).click();
    await choice(options, text.options.widths[2] ?? '').click();
    expect((await axe(page)).violations).toEqual([]);
    await drag(page, [
      { x: c.x - 100, y: c.y },
      { x: c.x, y: c.y + 30 },
      { x: c.x + 100, y: c.y },
    ]);
    await expect(item(page, 'stroke')).toHaveCount(1);

    await useTool(page, 'e', MAP_STRINGS.hints.eraser);
    await drag(page, [
      { x: c.x, y: c.y - 60 },
      { x: c.x, y: c.y + 80 },
    ]);
    await expect(item(page, 'stroke')).toHaveCount(0);
    await expect(page.getByText(text.erased(1))).toBeAttached();

    await page.keyboard.press('Control+z');
    await expect(item(page, 'stroke')).toHaveCount(1);
  });

  test('measures with the ruler and fixes the measure', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    const c = await mapCenter(page);

    await useTool(page, 'r', MAP_STRINGS.hints.measure);
    await page.mouse.click(c.x - 100, c.y);
    await page.mouse.click(c.x + 100, c.y);
    const total = page.getByText(/^Total: .+ px\.$/);
    await expect(total).toBeVisible();
    await page.getByRole('button', { name: MAP_STRINGS.hints.fixMeasure }).click();
    await expect(item(page, 'measure')).toHaveCount(1);
    await expect(total).toHaveCount(0);
  });
});
