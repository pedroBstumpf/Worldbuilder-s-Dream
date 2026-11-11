import { FocusMonitor } from '@angular/cdk/a11y';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  TOOLTIP_HIDE_DELAY_MS,
  TOOLTIP_SHOW_DELAY_MS,
  TooltipDirective,
} from './tooltip.directive';

@Component({
  imports: [TooltipDirective],
  template: `
    <button type="button" [wdTooltip]="message()" wdTooltipPosition="right">Régua</button>
    <button type="button" aria-label="Pincel" wdTooltip="Pincel">B</button>
  `,
})
class HostComponent {
  readonly message = signal('Medir distâncias');
}

describe('TooltipDirective', () => {
  let overlay: HTMLElement;

  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    TestBed.tick();
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const [described, labelled] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as [HTMLButtonElement, HTMLButtonElement];
    return { fixture, described, labelled };
  }

  const panelText = () => overlay.querySelector('wd-tooltip-panel')?.textContent?.trim() ?? null;

  afterEach(() => vi.useRealTimers());

  it('opens after the hover delay and closes after leaving', () => {
    vi.useFakeTimers();
    const { described } = setup();

    described.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS - 1);
    expect(panelText()).toBeNull();

    vi.advanceTimersByTime(1);
    TestBed.tick();
    expect(panelText()).toBe('Medir distâncias');

    described.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY_MS);
    expect(panelText()).toBeNull();
  });

  it('opens at once on keyboard focus and closes on blur', () => {
    const { described } = setup();

    TestBed.inject(FocusMonitor).focusVia(described, 'keyboard');
    TestBed.tick();
    expect(panelText()).toBe('Medir distâncias');

    described.blur();
    expect(panelText()).toBeNull();
  });

  it('closes on Escape', () => {
    const { described } = setup();
    TestBed.inject(FocusMonitor).focusVia(described, 'keyboard');
    TestBed.tick();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(panelText()).toBeNull();
  });

  it('describes the host with the message', () => {
    const { described } = setup();
    const id = described.getAttribute('aria-describedby');

    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')?.textContent).toBe('Medir distâncias');
  });

  it('follows message changes', () => {
    const { fixture, described } = setup();
    fixture.componentInstance.message.set('Régua');
    TestBed.tick();

    const id = described.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(id)?.textContent).toBe('Régua');
  });

  it('skips the description when it repeats the aria-label', () => {
    expect(setup().labelled.hasAttribute('aria-describedby')).toBe(false);
  });
});
