import { TestBed } from '@angular/core/testing';
import { ShortcutService } from './shortcut.service';

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const code = key === ' ' ? 'Space' : '';
  const down = new KeyboardEvent('keydown', {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(down);
  return down;
}

function release(key: string, target: EventTarget = document.body) {
  const code = key === ' ' ? 'Space' : '';
  target.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
}

describe('ShortcutService', () => {
  let service: ShortcutService;
  let input: HTMLInputElement;

  beforeEach(() => {
    service = TestBed.inject(ShortcutService);
    input = document.createElement('input');
    document.body.append(input);
  });

  afterEach(() => input.remove());

  it('runs the newest matching shortcut and prevents the default', () => {
    const calls: string[] = [];
    const removeOld = service.register([{ key: 'v', down: () => calls.push('old') }]);
    const removeNew = service.register([{ key: 'v', down: () => calls.push('new') }]);

    expect(press('V').defaultPrevented).toBe(true);
    removeNew();
    press('v');
    removeOld();
    press('v');

    expect(calls).toEqual(['new', 'old']);
  });

  it('respects modifiers, text fields and dialogs', () => {
    const calls: string[] = [];
    const remove = service.register([
      { key: 'v', down: () => calls.push('v') },
      { key: 'v', mod: true, keepDefault: true, down: () => calls.push('paste') },
      { key: 'escape', inFields: true, down: () => calls.push('esc') },
    ]);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inside = document.createElement('button');
    dialog.append(inside);
    document.body.append(dialog);

    press('v', {}, input);
    press('v', {}, inside);
    press('v', { altKey: true });
    expect(press('v', { ctrlKey: true }).defaultPrevented).toBe(false);
    press('Escape', {}, input);

    expect(calls).toEqual(['paste', 'esc']);
    dialog.remove();
    remove();
  });

  it('handles held keys once until released', () => {
    const calls: string[] = [];
    const remove = service.register([
      { key: 'space', down: () => calls.push('down'), up: () => calls.push('up') },
    ]);

    press(' ');
    press(' ', { repeat: true });
    release(' ');
    press(' ');
    window.dispatchEvent(new Event('blur'));

    expect(calls).toEqual(['down', 'up', 'down', 'up']);
    remove();
  });
});
