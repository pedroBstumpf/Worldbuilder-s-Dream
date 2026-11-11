import { Component, input } from '@angular/core';

/** Tamanhos em px: 18 em controles pequenos, 24 no padrão, 28 nas barras. */
export type IconSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<IconSize, number> = { sm: 18, md: 24, lg: 28 };

/**
 * Ícone da fonte Material Symbols Rounded (peso 300, sem preenchimento).
 * Sempre decorativo: o nome acessível fica no controle que o contém.
 */
@Component({
  selector: 'wd-icon',
  template: '{{ name() }}',
  host: {
    'aria-hidden': 'true',
    '[style.font-size.px]': 'sizePx()',
  },
  styles: `
    :host {
      display: inline-block;
      flex-shrink: 0;
      inline-size: 1em;
      block-size: 1em;
      overflow: hidden;
      font-family: var(--wd-font-icon);
      font-weight: 300;
      font-style: normal;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      white-space: nowrap;
      direction: ltr;
      font-feature-settings: 'liga';
      -webkit-font-smoothing: antialiased;
      user-select: none;
    }
  `,
})
export class IconComponent {
  /** Nome do símbolo (ligadura), ex.: `close`, `location_on`. */
  readonly name = input.required<string>();
  readonly size = input<IconSize>('md');

  protected sizePx(): number {
    return SIZE_PX[this.size()];
  }
}
