import { Component, computed, input } from '@angular/core';
import type { SearchKind } from '@domain/search';
import { IconComponent } from '@shared/ui/icon/icon.component';

/** Ícone de cada tipo quando não há retrato (personagem usa a inicial). */
export const KIND_ICONS: Record<SearchKind, string> = {
  character: 'person',
  location: 'location_on',
  faction: 'shield',
  item: 'swords',
  note: 'sticky_note_2',
  event: 'diamond',
};

/** Anel padrão por tipo (docs/05 › Cores por tipo de entidade). */
const DEFAULT_RING: Record<SearchKind, string> = {
  character: 'var(--ouro-400)',
  location: 'var(--bronze)',
  faction: 'var(--cobre)',
  item: 'var(--latao)',
  note: 'var(--pergaminho-400)',
  event: 'var(--ouro-300)',
};

/**
 * Retrato ou selo da entidade, com forma própria por tipo (nunca só a cor, docs/05):
 * personagem circular, local quadrado arredondado, facção escudo, item hexágono, nota
 * folha com canto dobrado e evento losango. Decorativo: o nome fica no controle.
 */
@Component({
  selector: 'wd-entity-avatar',
  imports: [IconComponent],
  host: {
    'aria-hidden': 'true',
    '[attr.data-kind]': 'kind()',
    '[style.--size.px]': 'size()',
    '[style.--ring]': 'ring()',
  },
  template: `
    <span class="fill">
      @if (portraitUrl(); as url) {
        <img [src]="url" alt="" draggable="false" />
      } @else if (kind() === 'character') {
        <span class="initial">{{ initial() }}</span>
      } @else {
        <wd-icon [name]="icon()" [size]="size() >= 48 ? 'lg' : 'sm'" />
      }
    </span>
  `,
  styles: `
    :host {
      --shape: circle(50%);

      position: relative;
      display: inline-block;
      flex-shrink: 0;
      inline-size: var(--size);
      block-size: var(--size);
      background: var(--ring);
      clip-path: var(--shape);
    }

    :host([data-kind='location']) {
      --shape: inset(0 round 22%);
    }

    :host([data-kind='faction']) {
      --shape: polygon(50% 0, 100% 10%, 100% 52%, 50% 100%, 0 52%, 0 10%);
    }

    :host([data-kind='item']) {
      --shape: polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%);
    }

    :host([data-kind='note']) {
      --shape: polygon(0 0, 72% 0, 100% 28%, 100% 100%, 0 100%);
    }

    :host([data-kind='event']) {
      --shape: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
    }

    .fill {
      position: absolute;
      inset: 2px;
      display: grid;
      place-items: center;
      overflow: hidden;
      color: var(--ring);
      background: var(--couro-800);
      clip-path: var(--shape);
    }

    :host(:not([data-kind='character'], [data-kind='location'])) .fill {
      inset: 3px;
    }

    img {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
    }

    .initial {
      font-family: var(--font-book);
      font-size: calc(var(--size) * 0.5);
      line-height: 1;
      color: var(--pergaminho-100);
    }
  `,
})
export class EntityAvatarComponent {
  readonly kind = input.required<SearchKind>();
  readonly name = input('');
  readonly color = input<string | null>(null);
  readonly portraitUrl = input<string | null>(null);
  /** Lado em px. */
  readonly size = input(36);

  protected readonly ring = computed(() => this.color() ?? DEFAULT_RING[this.kind()]);
  protected readonly icon = computed(() => KIND_ICONS[this.kind()]);
  protected readonly initial = computed(() => [...this.name().trim()][0]?.toUpperCase() ?? '?');
}
