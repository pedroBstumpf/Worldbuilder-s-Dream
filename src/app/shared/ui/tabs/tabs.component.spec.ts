import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabsComponent, type TabItem } from './tabs.component';

@Component({
  imports: [TabsComponent],
  template: `<wd-tabs idPrefix="t" label="Seções" [tabs]="tabs" [(selected)]="selected" />`,
})
class HostComponent {
  readonly tabs: TabItem[] = [
    { id: 'a', label: 'Personagens', icon: 'person' },
    { id: 'b', label: 'Locais', icon: 'location_on' },
    { id: 'c', label: 'Acervo', icon: 'shield' },
  ];
  readonly selected = signal('a');
}

describe('TabsComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    TestBed.tick();
    const tabs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    return { fixture, tabs };
  }

  it('marks the selected tab and links each tab to its panel', () => {
    const { tabs } = setup();
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(tabs[1]?.id).toBe('t-tab-b');
    expect(tabs[1]?.getAttribute('aria-controls')).toBe('t-panel-b');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves selection and focus with arrows, wrapping, Home and End', () => {
    const { fixture, tabs } = setup();
    const key = (key: string) => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      TestBed.tick();
    };
    tabs[0]?.focus();

    key('ArrowLeft');
    expect(fixture.componentInstance.selected()).toBe('c');
    expect(document.activeElement).toBe(tabs[2]);
    key('ArrowRight');
    expect(fixture.componentInstance.selected()).toBe('a');
    key('End');
    expect(fixture.componentInstance.selected()).toBe('c');
    key('Home');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('selects on click', () => {
    const { fixture, tabs } = setup();
    tabs[1]?.click();
    expect(fixture.componentInstance.selected()).toBe('b');
  });
});
