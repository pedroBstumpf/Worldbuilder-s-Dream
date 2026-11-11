import { booleanAttribute, Component, input } from '@angular/core';

/**
 * Selo discreto do modo demonstração (docs/10, regra 4): pílula de couro fixa no topo,
 * acima do conteúdo e abaixo dos diálogos; com `inline`, fica no fluxo (barra superior). Não recebe cliques (`pointer-events: none`),
 * para nunca cobrir um controle. Quem decide se aparece é o app (token `DEMO_MODE`).
 */
@Component({
  selector: 'wd-demo-badge',
  template: `
    <span class="wd-inscription text-(--wd-text-on-surface)">{{ label() }}</span>
    @if (detail()) {
      <span aria-hidden="true" class="text-(--wd-accent) max-sm:hidden">·</span>
      <span class="text-(--wd-text-muted) max-sm:sr-only">{{ detail() }}</span>
    }
  `,
  host: {
    role: 'note',
    class:
      'pointer-events-none flex items-center gap-2 rounded-full border border-(--wd-rule) ' +
      'bg-couro-900/90 px-3 py-1 text-xs whitespace-nowrap shadow-panel',
    '[class]': "inline() ? '' : floating",
  },
})
export class DemoBadgeComponent {
  /** Texto principal, em caixa-alta (Cinzel). */
  readonly label = input.required<string>();
  /** Complemento; em telas estreitas fica só para leitores de tela. */
  readonly detail = input('');
  /** Dentro de uma barra, no fluxo do layout, em vez de flutuar no topo. */
  readonly inline = input(false, { transform: booleanAttribute });

  protected readonly floating = 'fixed top-2 left-1/2 z-50 -translate-x-1/2';
}
