import { Dialog } from '@angular/cdk/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { DEV_STRINGS } from '@core/strings/dev.strings';
import { UI_STRINGS } from '@core/strings/ui.strings';
import { provideUiStrings } from '@shared/ui/ui-strings';
import DevPage from './dev.page';

describe('DevPage', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideUiStrings(UI_STRINGS)] });
    const fixture = TestBed.createComponent(DevPage);
    TestBed.tick();
    const root = fixture.nativeElement as HTMLElement;
    const buttonByText = (text: string) =>
      Array.from(root.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === text,
      ) as HTMLButtonElement;
    return { root, buttonByText };
  }

  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('shows every component section', () => {
    const headings = Array.from(setup().root.querySelectorAll('h2')).map((h) =>
      h.textContent?.trim(),
    );

    expect(headings).toEqual([
      DEV_STRINGS.buttons.heading,
      DEV_STRINGS.iconButtons.heading,
      DEV_STRINGS.tooltips.heading,
      DEV_STRINGS.dialogs.heading,
      DEV_STRINGS.toasts.heading,
    ]);
  });

  it('presses only the active tool', () => {
    const { root } = setup();
    const ruler = root.querySelector(
      `button[aria-label="${DEV_STRINGS.iconButtons.tools.ruler}"]`,
    ) as HTMLButtonElement;

    ruler.click();
    TestBed.tick();

    const pressed = root.querySelectorAll('[role="toolbar"] [aria-pressed="true"]');
    expect(Array.from(pressed)).toEqual([ruler]);
  });

  it('opens the example dialogs', () => {
    const { buttonByText } = setup();

    buttonByText(DEV_STRINGS.dialogs.openReading).click();
    TestBed.tick();

    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlay.querySelector('[role="dialog"] h2')?.textContent?.trim()).toBe(
      DEV_STRINGS.dialogs.readingTitle,
    );
  });
});
