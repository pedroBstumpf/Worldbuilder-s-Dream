import { TestBed } from '@angular/core/testing';
import { Calendar } from '@domain/calendar/calendar';
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import { DateInputComponent } from './date-input.component';

const calendar = new Calendar(DEFAULT_CALENDAR);

describe('DateInputComponent', () => {
  async function render(value: number) {
    const fixture = TestBed.createComponent(DateInputComponent);
    fixture.componentRef.setInput('calendar', calendar);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('label', 'Início');
    fixture.componentRef.setInput('idPrefix', 'start');
    const emitted: number[] = [];
    fixture.componentInstance.valueChange.subscribe((tick) => emitted.push(tick));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const [day, year] = Array.from(root.querySelectorAll('input'));
    const [month, era] = Array.from(root.querySelectorAll('select'));
    if (!day || !year || !month || !era) throw new Error('campos ausentes');
    return { fixture, root, day, year, month, era, emitted };
  }

  function type(field: HTMLInputElement | HTMLSelectElement, value: string) {
    field.value = value;
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
  }

  it('mostra a data no calendário do mundo', async () => {
    const { day, year, month, era } = await render(
      calendar.fromDate({ year: 9, monthIndex: 2, day: 15, hour: 0, minute: 0 }),
    );
    expect(day.value).toBe('15');
    expect(month.value).toBe('2');
    expect(year.value).toBe('10');
    expect(era.value).toBe('1');
  });

  it('emite o tick quando a data existe, inclusive antes da era comum', async () => {
    const { year, era, emitted } = await render(0);
    type(year, '5');
    expect(emitted.at(-1)).toBe(
      calendar.fromDate({ year: 4, monthIndex: 0, day: 1, hour: 0, minute: 0 }),
    );
    type(era, '0');
    expect(emitted.at(-1)).toBe(
      calendar.fromDate({ year: -5, monthIndex: 0, day: 1, hour: 0, minute: 0 }),
    );
  });

  it('marca datas que não existem e não emite', async () => {
    const { fixture, root, day, month, year, emitted } = await render(
      calendar.fromDate({ year: 1, monthIndex: 0, day: 29, hour: 0, minute: 0 }),
    );
    type(month, '1');
    await fixture.whenStable();
    expect(root.querySelector('fieldset')?.getAttribute('aria-invalid')).toBe('true');
    expect(root.textContent).toContain('Esta data não existe no calendário.');
    expect(emitted).toEqual([]);
    type(day, '28');
    expect(emitted).toHaveLength(1);
    type(year, '0');
    expect(emitted).toHaveLength(1);
  });
});
