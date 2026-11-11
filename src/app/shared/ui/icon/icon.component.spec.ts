import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IconComponent, type IconSize } from './icon.component';

@Component({
  imports: [IconComponent],
  template: `<wd-icon name="location_on" [size]="size" />`,
})
class HostComponent {
  size: IconSize = 'md';
}

describe('IconComponent', () => {
  function render(size: IconSize = 'md'): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.size = size;
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('wd-icon') as HTMLElement;
  }

  it('renders the symbol name as a ligature', () => {
    expect(render().textContent?.trim()).toBe('location_on');
  });

  it('is hidden from assistive technology', () => {
    expect(render().getAttribute('aria-hidden')).toBe('true');
  });

  it('maps the size to pixels', () => {
    expect(render('lg').style.fontSize).toBe('28px');
  });
});
