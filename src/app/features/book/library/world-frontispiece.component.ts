import { booleanAttribute, Component, computed, input, output } from '@angular/core';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import type { Uuid, World } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { buttonClasses } from '@shared/ui/button/button-styles';
import type { LibraryStatus } from './library.store';
import { formatEditDate } from './format-edit-date';

/**
 * Página direita da biblioteca, o "Frontispício" do mundo escolhido (docs/05):
 * miniatura emoldurada, nome, descrição e "Abrir mundo". Livro em branco: "Criar
 * primeiro mundo". `decorative` desenha uma cópia sem controles, para as faixas da
 * virada curvada (ADR-0011 › Acessibilidade).
 */
@Component({
  selector: 'wd-world-frontispiece',
  imports: [ButtonComponent],
  template: `
    @if (world(); as w) {
      <!-- Miniatura do mapa; sem mapa ainda, a rosa dos ventos em traço fino. -->
      <div class="thumb" aria-hidden="true">
        <svg viewBox="-50 -50 100 100" focusable="false">
          <circle r="34" />
          <path d="M0 -42 L5 0 L0 42 L-5 0 Z" />
          <path d="M-42 0 L0 -5 L42 0 L0 5 Z" />
        </svg>
      </div>
      <h2 class="wd-inscription text-center text-2xl text-couro-900">{{ w.name }}</h2>
      <p class="line-clamp-4 text-center font-book text-lg text-couro-600 italic">
        {{ w.description || text.noDescription }}
      </p>
      <p class="text-center font-sans text-xs text-couro-600">{{ edited() }}</p>
      @if (decorative()) {
        <span [class]="primaryClasses">{{ text.open }}</span>
      } @else {
        <button wd-button variant="primary" type="button" (click)="open.emit(w.id)">
          {{ text.open }}
        </button>
      }
    } @else if (status() === 'ready') {
      <p class="text-center font-book text-lg text-couro-600 italic">{{ text.emptyHint }}</p>
      @if (decorative()) {
        <span [class]="primaryClasses">{{ text.createFirst }}</span>
      } @else {
        <button wd-button variant="primary" type="button" (click)="create.emit()">
          {{ text.createFirst }}
        </button>
      }
    }
  `,
  host: { class: 'flex h-full flex-col items-center justify-center gap-3 p-[10%]' },
  styles: `
    .thumb {
      inline-size: 82%;
      background-color: var(--pergaminho-100);
      border: 2px solid var(--ouro-500);
      outline: 1px solid var(--wd-rule);
      outline-offset: 3px;
    }

    .thumb svg {
      display: block;
      inline-size: 40%;
      margin: 12% auto;
      fill: none;
      stroke: var(--ouro-700);
      stroke-width: 1;
    }
  `,
})
export class WorldFrontispieceComponent {
  readonly world = input<World | null>(null);
  readonly status = input.required<LibraryStatus>();
  readonly decorative = input(false, { transform: booleanAttribute });

  readonly open = output<Uuid>();
  readonly create = output();

  protected readonly text = BOOK_STRINGS.library;
  protected readonly primaryClasses = buttonClasses('primary', 'md');
  protected readonly edited = computed(() => {
    const world = this.world();
    return world ? this.text.edited(formatEditDate(world.updatedAt)) : '';
  });
}
