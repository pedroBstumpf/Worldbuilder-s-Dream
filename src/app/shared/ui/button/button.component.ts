import { Component, computed, input } from '@angular/core';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles';

/**
 * Botão de texto sobre o elemento nativo: `<button wd-button variant="primary">`.
 * Teclado, `disabled`, `type` e formulários continuam sendo do `<button>`.
 * Use `primary` (ouro) no máximo uma vez por contexto (docs/05).
 */
@Component({
  selector: 'button[wd-button], a[wd-button]',
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');

  protected readonly classes = computed(() => buttonClasses(this.variant(), this.size()));
}
