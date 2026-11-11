import { FocusMonitor } from '@angular/cdk/a11y';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IconButtonComponent } from './icon-button.component';

@Component({
  imports: [IconButtonComponent],
  template: `
    <button
      wd-icon-button
      type="button"
      icon="straighten"
      label="Régua"
      tooltipPosition="right"
      [pressed]="pressed()"
    ></button>
    <button wd-icon-button type="button" icon="close" label="Fechar" size="sm"></button>
  `,
})
class HostComponent {
  readonly pressed = signal<boolean | undefined>(false);
}

describe('IconButtonComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    TestBed.tick();
    const [tool, close] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as [HTMLButtonElement, HTMLButtonElement];
    return { fixture, tool, close };
  }

  it('uses the label as accessible name without a duplicate description', () => {
    const { tool } = setup();
    expect(tool.getAttribute('aria-label')).toBe('Régua');
    expect(tool.hasAttribute('aria-describedby')).toBe(false);
  });

  it('renders the icon', () => {
    expect(setup().tool.querySelector('wd-icon')?.textContent?.trim()).toBe('straighten');
  });

  it('shows the label as a tooltip on keyboard focus', () => {
    const { tool } = setup();
    TestBed.inject(FocusMonitor).focusVia(tool, 'keyboard');
    TestBed.tick();

    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlay.querySelector('wd-tooltip-panel')?.textContent?.trim()).toBe('Régua');
  });

  it('reflects the pressed state', () => {
    const { fixture, tool, close } = setup();
    expect(tool.getAttribute('aria-pressed')).toBe('false');
    expect(close.hasAttribute('aria-pressed')).toBe(false);

    fixture.componentInstance.pressed.set(true);
    TestBed.tick();
    expect(tool.getAttribute('aria-pressed')).toBe('true');
  });

  it('applies the size', () => {
    const { tool, close } = setup();
    expect(tool.classList).toContain('size-11');
    expect(close.classList).toContain('size-8');
  });
});
