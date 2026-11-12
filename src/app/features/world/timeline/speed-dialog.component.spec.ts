import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { UI_STRINGS } from '@core/strings/ui.strings';
import { Calendar } from '@domain/calendar/calendar';
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import type { PlaySpeed } from '@domain/timeline';
import { provideUiStrings } from '@shared/ui/ui-strings';
import { SpeedDialogComponent, type SpeedDialogData } from './speed-dialog.component';

const calendar = new Calendar(DEFAULT_CALENDAR);
const YEAR = 1440 * 365.25;

describe('SpeedDialogComponent', () => {
  async function render(speed: PlaySpeed) {
    const closed: (PlaySpeed | undefined)[] = [];
    const data: SpeedDialogData = { speed, calendar, range: { start: 0, end: YEAR * 5000 } };
    TestBed.configureTestingModule({
      providers: [
        provideUiStrings(UI_STRINGS),
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: { close: (value?: PlaySpeed) => closed.push(value) } },
      ],
    });
    const fixture = TestBed.createComponent(SpeedDialogComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const amount = root.querySelector('#wd-speed-amount') as HTMLInputElement;
    const unit = root.querySelector('#wd-speed-unit') as HTMLSelectElement;
    const form = root.querySelector('form') as HTMLFormElement;
    return { fixture, root, amount, unit, form, closed };
  }

  it('aplica um atalho e mostra quanto dura o play', async () => {
    const { fixture, root, form, closed } = await render({ amount: 1, unit: 'year' });
    expect(root.textContent).toContain('Percorre o mundo inteiro em 1 h 23 min.');
    const preset = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
      (b) => b.textContent?.trim() === '1.000 anos/s',
    );
    preset?.click();
    await fixture.whenStable();
    expect(preset?.getAttribute('aria-checked')).toBe('true');
    expect(root.textContent).toContain('Percorre o mundo inteiro em 5 s.');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(closed).toEqual([{ amount: 1000, unit: 'year' }]);
  });

  it('aceita uma velocidade livre e recusa valores fora do limite', async () => {
    const { fixture, root, amount, unit, form, closed } = await render({ amount: 1, unit: 'day' });
    amount.value = '2.5';
    amount.dispatchEvent(new Event('input'));
    unit.value = 'month';
    unit.dispatchEvent(new Event('change'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(closed).toEqual([{ amount: 2.5, unit: 'month' }]);

    amount.value = '0';
    amount.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(amount.getAttribute('aria-invalid')).toBe('true');
    expect(root.textContent).toContain('Use um número entre');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(closed).toHaveLength(1);
  });
});
