import { Component, computed, inject, input } from '@angular/core';
import { iconButtonClasses, type ButtonSize, type ButtonVariant } from '../button/button-styles';
import { IconComponent } from '../icon/icon.component';
import { TooltipDirective } from '../tooltip/tooltip.directive';

/**
 * Botão só com ícone: `<button wd-icon-button icon="straighten" label="Régua">`.
 * O `label` (obrigatório) é ao mesmo tempo o nome acessível e o tooltip (docs/04).
 * `pressed` liga o modo alternável (ferramenta ativa): aria-pressed e fundo ouro.
 */
@Component({
  selector: 'button[wd-icon-button]',
  imports: [IconComponent],
  hostDirectives: [
    {
      directive: TooltipDirective,
      inputs: ['wdTooltip: label', 'wdTooltipPosition: tooltipPosition'],
    },
  ],
  template: "<wd-icon [name]=\"icon()\" [size]=\"size() === 'sm' ? 'sm' : 'md'\" />",
  host: {
    '[attr.aria-label]': 'tooltip.message()',
    '[attr.aria-pressed]': 'pressed() ?? null',
    '[class]': 'classes()',
  },
})
export class IconButtonComponent {
  /** Nome do símbolo do Material Symbols. */
  readonly icon = input.required<string>();
  readonly variant = input<ButtonVariant>('ghost');
  readonly size = input<ButtonSize>('md');
  /** Omitido: botão comum. `true`/`false`: botão alternável (aria-pressed). */
  readonly pressed = input<boolean | undefined>(undefined);

  protected readonly tooltip = inject(TooltipDirective);
  protected readonly classes = computed(() => iconButtonClasses(this.variant(), this.size()));
}
