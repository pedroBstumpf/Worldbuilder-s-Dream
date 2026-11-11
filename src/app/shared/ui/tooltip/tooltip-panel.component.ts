import { Component, input } from '@angular/core';

/**
 * Balão visual do tooltip. Fica oculto para leitores de tela: o texto chega pelo
 * aria-describedby do AriaDescriber (ou pelo aria-label, quando é o mesmo texto).
 */
@Component({
  selector: 'wd-tooltip-panel',
  template: '{{ message() }}',
  host: {
    'aria-hidden': 'true',
    class:
      'wd-inscription block max-w-64 rounded-control border border-(--wd-rule) bg-couro-900 ' +
      'px-2 py-1 text-xs text-pergaminho-100 shadow-panel',
  },
  styles: `
    :host {
      animation: tooltip-in var(--wd-dur-fast) var(--wd-ease-out);
    }

    @keyframes tooltip-in {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `,
})
export class TooltipPanelComponent {
  readonly message = input('');
}
