import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ButtonSize, ButtonVariant } from './button-styles';
import { ButtonComponent } from './button.component';

@Component({
  imports: [ButtonComponent],
  template: `
    <button wd-button type="button" class="extra" [variant]="variant()" [size]="size()">
      Abrir mundo
    </button>
    <a wd-button href="/biblioteca">Biblioteca</a>
  `,
})
class HostComponent {
  readonly variant = signal<ButtonVariant>('primary');
  readonly size = signal<ButtonSize>('md');
}

describe('ButtonComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      button: root.querySelector('button') as HTMLButtonElement,
      link: root.querySelector('a') as HTMLAnchorElement,
    };
  }

  it('keeps the native button and its content', () => {
    const { button } = setup();
    expect(button.type).toBe('button');
    expect(button.textContent?.trim()).toBe('Abrir mundo');
  });

  it('applies the variant and size classes', () => {
    const { fixture, button } = setup();
    expect(button.classList).toContain('bg-ouro-400');
    expect(button.classList).toContain('min-h-10');

    fixture.componentInstance.variant.set('danger');
    fixture.componentInstance.size.set('sm');
    fixture.detectChanges();

    expect(button.classList).toContain('bg-lacre');
    expect(button.classList).toContain('min-h-8');
    expect(button.classList).not.toContain('bg-ouro-400');
  });

  it('keeps classes set in the template', () => {
    expect(setup().button.classList).toContain('extra');
  });

  it('defaults links to the secondary variant', () => {
    expect(setup().link.classList).toContain('bg-(--wd-control-bg)');
  });
});
