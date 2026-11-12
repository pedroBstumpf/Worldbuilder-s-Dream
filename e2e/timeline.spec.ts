import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BOOK_STRINGS } from '../src/app/core/strings/book.strings';
import { ENTITY_STRINGS } from '../src/app/core/strings/entity.strings';
import { MAP_STRINGS } from '../src/app/core/strings/map.strings';
import { TIME_STRINGS } from '../src/app/core/strings/time.strings';
import { makePng } from './support/png';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const { cover, library, createWorld } = BOOK_STRINGS;
const time = TIME_STRINGS;

const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
const toast = (page: Page, message: string) => page.locator('wd-toast-host').getByText(message);
const cursor = (page: Page) => page.getByRole('slider', { name: time.timeline.cursor });
const eventSheet = (page: Page, title: string) =>
  page.getByRole('region', { name: time.events.sheet.label(title) });

/** Mundo novo com um mapa (a linha do tempo aparece com o mapa). */
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

async function createEvent(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: time.timeline.newEvent }).click();
  const dialog = page.getByRole('dialog', { name: time.events.create.title });
  await dialog.getByLabel(time.events.create.name).fill(title);
  await dialog.getByRole('button', { name: time.events.create.submit }).click();
  await expect(eventSheet(page, title)).toBeVisible();
}

test.describe('time: timeline, calendar and events', () => {
  test('moves the cursor by keyboard and keeps the date in the url', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await expect(cursor(page)).toHaveAttribute('aria-valuetext', '1 EC');
    expect((await axe(page)).violations).toEqual([]);

    await cursor(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(cursor(page)).toHaveAttribute('aria-valuetext', '12 EC');
    // Espera o valor novo (o `t=0` inicial já estava lá).
    await expect(page).toHaveURL(/[?&]t=[1-9]\d*/);

    // Recarregar volta ao mesmo instante (?t=).
    await page.reload();
    await expect(cursor(page)).toHaveAttribute('aria-valuetext', '12 EC');

    // T põe o foco no cursor; fora de controles, as setas também passam o tempo.
    await page.locator('h1').focus();
    await page.keyboard.press('t');
    await expect(cursor(page)).toBeFocused();
    await page.keyboard.press('End');
    await expect(cursor(page)).toHaveAttribute('aria-valuetext', /^100 EC|^101 EC/);
    await page.keyboard.press('Home');
    await expect(cursor(page)).toHaveAttribute('aria-valuetext', '1 EC');
  });

  test('edits the world calendar and shows dates with it', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await page.getByRole('button', { name: time.timeline.calendar }).click();
    const dialog = page.getByRole('dialog', { name: time.calendar.title });
    await expect(dialog).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    await dialog.getByLabel(time.calendar.monthName(1), { exact: true }).fill('Geada');
    await expect(dialog.getByText(time.calendar.previewToday('1 de Geada de 1 EC'))).toBeVisible();

    // Valor inválido: o salvar leva ao campo com problema.
    await dialog.getByLabel(time.calendar.monthDays(2), { exact: true }).fill('');
    await dialog.getByRole('button', { name: time.calendar.save }).click();
    await expect(dialog.getByLabel(time.calendar.monthDays(2), { exact: true })).toBeFocused();
    await dialog.getByLabel(time.calendar.monthDays(2), { exact: true }).fill('28');

    await dialog.getByRole('tab', { name: time.calendar.tabs.eras }).click();
    await dialog.getByLabel(time.calendar.eraAbbr(2), { exact: true }).fill('EV');
    await dialog.getByRole('button', { name: time.calendar.save }).click();
    await expect(toast(page, time.calendar.saved)).toBeVisible();
    await expect(cursor(page)).toHaveAttribute('aria-valuetext', '1 EV');

    await createEvent(page, 'Fundação de Valmora');
    await page.keyboard.press('Escape');
    await expect(
      page.locator('wd-explorer-panel').getByText('1 de Geada de 1 EV', { exact: true }),
    ).toBeVisible();
  });

  test('creates an event, marks it on the map and finds it on the track', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await cursor(page).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await createEvent(page, 'Batalha do Vau');
    const sheet = eventSheet(page, 'Batalha do Vau');
    await expect(sheet.getByLabel(time.events.sheet.title)).toBeFocused();
    await sheet.getByLabel(time.events.sheet.category, { exact: true }).selectOption('battle');
    await expect(sheet.getByRole('status')).toContainText(ENTITY_STRINGS.sheet.status.saved);
    expect((await axe(page)).violations).toEqual([]);

    // Marcar no mapa pelo teclado: Enter marca no centro da área visível.
    await sheet.getByRole('button', { name: time.events.sheet.place }).click();
    await expect(page.getByText(time.events.place.hint('Batalha do Vau'))).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(sheet.getByText(time.events.sheet.placedOnMap('mapa'))).toBeVisible();
    const marker = page.getByRole('button', { name: time.events.map.open('Batalha do Vau') });
    await expect(marker).toHaveCount(1);

    // Fora das datas do evento, o marcador some do mapa.
    await page.keyboard.press('Escape');
    await cursor(page).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(marker).toHaveCount(0);
    // Page Up volta ao início do evento anterior; o cursor anuncia o evento.
    await page.keyboard.press('PageUp');
    await expect(cursor(page)).toHaveAttribute('aria-valuetext', /Eventos: Batalha do Vau/);
    await expect(marker).toHaveCount(1);
    await marker.focus();
    await page.keyboard.press('Enter');
    await expect(eventSheet(page, 'Batalha do Vau')).toBeVisible();
    await expect(page).toHaveURL(/sel=[0-9a-f-]{36}/);

    // Lixeira com desfazer.
    await eventSheet(page, 'Batalha do Vau')
      .getByRole('button', { name: time.events.sheet.trash })
      .click();
    await expect(toast(page, ENTITY_STRINGS.sheet.trashed('Batalha do Vau'))).toBeVisible();
    await page.getByRole('button', { name: ENTITY_STRINGS.sheet.undo }).click();
    await expect(eventSheet(page, 'Batalha do Vau')).toBeVisible();
  });

  test('asks to extend the world range for an event outside it', async ({ page }) => {
    await openWorldWithMap(page, 'Valmora');
    await createEvent(page, 'Chegada dos navios');
    const start = eventSheet(page, 'Chegada dos navios').getByRole('group', {
      name: time.events.sheet.start,
    });
    await start.getByLabel(TIME_STRINGS.date.year).fill('150');
    const dialog = page.getByRole('dialog', { name: time.events.range.title });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: time.events.range.confirm }).click();
    await cursor(page).focus();
    await page.keyboard.press('End');
    await expect(cursor(page)).toHaveAttribute('aria-valuetext', /^150 EC/);
  });
});
