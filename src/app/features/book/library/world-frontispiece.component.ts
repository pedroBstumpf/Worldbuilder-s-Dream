import { CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { booleanAttribute, Component, computed, input, output } from '@angular/core';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import type { Uuid, World } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { buttonClasses, iconButtonClasses } from '@shared/ui/button/button-styles';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import type { WorldAction } from './library-actions';
import type { LibraryStatus, LibraryView } from './library.store';
import { formatEditDate } from './format-edit-date';

/** Primeiros itens do menu "⋯", com o ícone de cada um. */
const MENU: readonly { action: WorldAction; icon: string }[] = [
  { action: 'rename', icon: 'edit' },
  { action: 'duplicate', icon: 'content_copy' },
  { action: 'export', icon: 'download' },
];

/**
 * Página direita da biblioteca, o "Frontispício" do mundo escolhido (docs/05):
 * miniatura emoldurada, nome, descrição, "Abrir mundo" e o menu "⋯" com as ações
 * secundárias (renomear, duplicar, exportar, arquivar, lixeira). Na lixeira: "Restaurar"
 * e "Excluir para sempre". Livro em branco: "Criar primeiro mundo" e "Importar mundo".
 * `decorative` desenha uma cópia sem controles, para as faixas da virada curvada
 * (ADR-0011 › Acessibilidade).
 */
@Component({
  selector: 'wd-world-frontispiece',
  imports: [
    ButtonComponent,
    CdkMenu,
    CdkMenuGroup,
    CdkMenuItem,
    CdkMenuTrigger,
    IconButtonComponent,
    IconComponent,
  ],
  template: `
    @if (world(); as w) {
      <!-- Miniatura do mapa; sem mapa ainda, a rosa dos ventos em traço fino. -->
      <div class="thumb" [class.faded]="view() === 'trash'" aria-hidden="true">
        @if (coverUrl(); as url) {
          <img [src]="url" alt="" />
        } @else {
          <svg viewBox="-50 -50 100 100" focusable="false">
            <circle r="34" />
            <path d="M0 -42 L5 0 L0 42 L-5 0 Z" />
            <path d="M-42 0 L0 -5 L42 0 L0 5 Z" />
          </svg>
        }
      </div>
      <h2 class="wd-inscription text-center text-2xl text-couro-900">{{ w.name }}</h2>
      <p class="line-clamp-4 text-center font-book text-lg text-couro-600 italic">
        {{ w.description || text.noDescription }}
      </p>
      <p class="text-center font-sans text-xs text-couro-600">{{ dateLine() }}</p>
      @if (decorative()) {
        <div class="flex items-center gap-2">
          <span [class]="primaryClasses">
            {{ view() === 'trash' ? actionText.restore : text.open }}
          </span>
          @if (view() !== 'trash') {
            <span [class]="moreClasses"><wd-icon name="more_horiz" /></span>
          }
        </div>
      } @else if (view() === 'trash') {
        <div class="flex flex-wrap justify-center gap-2">
          <button wd-button variant="primary" type="button" (click)="action.emit('restore')">
            {{ actionText.restore }}
          </button>
          <button wd-button variant="danger" type="button" (click)="action.emit('delete')">
            {{ actionText.delete }}
          </button>
        </div>
      } @else {
        <div class="flex items-center gap-2">
          <button wd-button variant="primary" type="button" (click)="open.emit(w.id)">
            {{ text.open }}
          </button>
          <button
            wd-icon-button
            type="button"
            icon="more_horiz"
            tooltipPosition="below"
            [label]="text.actionsFor(w.name)"
            [cdkMenuTriggerFor]="menu"
          ></button>
        </div>
      }
    } @else if (status() === 'ready') {
      @switch (view()) {
        @case ('worlds') {
          <p class="text-center font-book text-lg text-couro-600 italic">{{ text.emptyHint }}</p>
          @if (decorative()) {
            <span [class]="primaryClasses">{{ text.createFirst }}</span>
          } @else {
            <button wd-button variant="primary" type="button" (click)="create.emit()">
              {{ text.createFirst }}
            </button>
            <button wd-button variant="ghost" size="sm" type="button" (click)="import.emit()">
              <wd-icon name="upload_file" size="sm" />{{ text.importWorld }}
            </button>
          }
        }
        @case ('archived') {
          <p class="text-center font-book text-lg text-couro-600 italic">{{ text.noArchived }}</p>
        }
        @case ('trash') {
          <p class="text-center font-book text-lg text-couro-600 italic">{{ text.trashHint }}</p>
        }
      }
    }

    <ng-template #menu>
      <div class="wd-menu" cdkMenu>
        <div cdkMenuGroup role="group">
          @for (item of menuItems; track item.action) {
            <button
              type="button"
              class="wd-menu-item"
              cdkMenuItem
              (cdkMenuItemTriggered)="action.emit(item.action)"
            >
              <wd-icon [name]="item.icon" size="sm" />{{ actionText[item.action] }}
            </button>
          }
          @if (view() === 'archived') {
            <button
              type="button"
              class="wd-menu-item"
              cdkMenuItem
              (cdkMenuItemTriggered)="action.emit('unarchive')"
            >
              <wd-icon name="unarchive" size="sm" />{{ actionText.unarchive }}
            </button>
          } @else {
            <button
              type="button"
              class="wd-menu-item"
              cdkMenuItem
              (cdkMenuItemTriggered)="action.emit('archive')"
            >
              <wd-icon name="inventory_2" size="sm" />{{ actionText.archive }}
            </button>
          }
        </div>
        <hr class="wd-menu-divider" />
        <div cdkMenuGroup role="group">
          <button
            type="button"
            class="wd-menu-item"
            cdkMenuItem
            (cdkMenuItemTriggered)="action.emit('trash')"
          >
            <wd-icon name="delete" size="sm" />{{ actionText.trash }}
          </button>
        </div>
      </div>
    </ng-template>
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

    .thumb.faded {
      opacity: 0.6;
      filter: grayscale(1);
    }

    .thumb img {
      display: block;
      inline-size: 100%;
      aspect-ratio: 3 / 2;
      object-fit: cover;
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
  /** Miniatura do mapa do mundo; sem ela, a rosa dos ventos. */
  readonly coverUrl = input<string | null>(null);
  readonly status = input.required<LibraryStatus>();
  /** Lista de onde o mundo vem: decide as ações e a data mostrada. */
  readonly view = input<LibraryView>('worlds');
  readonly decorative = input(false, { transform: booleanAttribute });

  readonly open = output<Uuid>();
  readonly create = output();
  readonly import = output();
  readonly action = output<WorldAction>();

  protected readonly text = BOOK_STRINGS.library;
  protected readonly actionText = BOOK_STRINGS.library.actions;
  protected readonly menuItems = MENU;
  protected readonly primaryClasses = buttonClasses('primary', 'md');
  protected readonly moreClasses = iconButtonClasses('ghost', 'md');
  protected readonly dateLine = computed(() => {
    const world = this.world();
    if (!world) return '';
    if (this.view() === 'trash' && world.deletedAt) {
      return this.text.trashedOn(formatEditDate(world.deletedAt));
    }
    if (world.archivedAt) return this.text.archivedOn(formatEditDate(world.archivedAt));
    return this.text.edited(formatEditDate(world.updatedAt));
  });
}
