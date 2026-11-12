import { Component, computed, input, output } from '@angular/core';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import type { Uuid, World } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TabsComponent, tabId, tabPanelId, type TabItem } from '@shared/ui/tabs/tabs.component';
import { LIBRARY_VIEWS, type LibraryStatus, type LibraryView } from './library.store';
import { formatEditDate } from './format-edit-date';

const TABS_PREFIX = 'wd-library';

/**
 * Página esquerda da biblioteca, o "Sumário" (docs/05 › Biblioteca): mundos como índice
 * de livro e, ao final, "Criar novo mundo" e "Importar mundo". Abas levam aos arquivados
 * e à lixeira. Livro em branco: ilustração em traço de pena.
 */
@Component({
  selector: 'wd-library-contents',
  imports: [ButtonComponent, IconComponent, TabsComponent],
  template: `
    <p class="font-book text-sm text-couro-600 italic">{{ text.exLibris(ownerName()) }}</p>
    <h1 id="wd-library-title" class="wd-inscription text-2xl text-couro-900" tabindex="-1">
      {{ text.heading }}
    </h1>

    @switch (status()) {
      @case ('error') {
        <p class="font-book text-lacre" role="alert">{{ text.loadFailed }}</p>
        <button wd-button type="button" size="sm" class="self-start" (click)="retry.emit()">
          {{ text.retry }}
        </button>
      }
      @case ('ready') {
        @if (blank()) {
          <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <!-- Pena e tinteiro em traço fino. -->
            <svg class="quill" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <path d="M96 10 C70 18 48 40 36 74 L32 92 L44 80 C66 70 86 46 96 10 Z" />
              <path d="M96 10 L40 82" />
              <path d="M32 92 L26 104" />
              <path d="M18 104 h36 v8 h-36 Z" />
            </svg>
            <p class="font-book text-xl text-couro-900">{{ text.empty }}</p>
          </div>
        } @else {
          <wd-tabs
            [idPrefix]="tabsPrefix"
            [label]="text.views"
            [tabs]="tabs()"
            [selected]="view()"
            (selectedChange)="changeView($event)"
          />
          <div
            role="tabpanel"
            class="flex min-h-0 flex-1 flex-col"
            [id]="panelId()"
            [attr.aria-labelledby]="tabId()"
          >
            @if (worlds().length === 0) {
              <p class="font-book text-lg text-couro-600 italic">{{ emptyText() }}</p>
            }
            <ol
              class="flex min-h-0 flex-col gap-1 overflow-y-auto font-book text-lg text-couro-900"
            >
              @for (world of worlds(); track world.id) {
                <li>
                  <button
                    type="button"
                    class="toc-item"
                    [attr.aria-current]="world.id === selectedId() ? 'true' : null"
                    (click)="choose.emit(world.id)"
                  >
                    <span class="toc-mark" aria-hidden="true"></span>
                    <span class="truncate">{{ world.name }}</span>
                    <span class="toc-dots" aria-hidden="true"></span>
                    <span class="text-sm text-couro-600">{{ editDate(world) }}</span>
                  </button>
                </li>
              }
            </ol>
          </div>
          @if (view() === 'worlds') {
            <div class="flex flex-wrap gap-2">
              <button wd-button variant="ghost" size="sm" type="button" (click)="create.emit()">
                <span aria-hidden="true">✒</span> {{ text.createNew }}
              </button>
              <button wd-button variant="ghost" size="sm" type="button" (click)="import.emit()">
                <wd-icon name="upload_file" size="sm" />{{ text.importWorld }}
              </button>
            </div>
          }
        }
      }
      @default {
        <p class="font-book text-couro-600 italic" role="status">{{ text.loading }}</p>
      }
    }
  `,
  host: { class: 'flex h-full flex-col gap-4' },
  styles: `
    .toc-item {
      display: flex;
      gap: 8px;
      align-items: baseline;
      inline-size: 100%;
      padding: 4px 6px;
      text-align: start;
      cursor: pointer;
      border-radius: var(--wd-radius-control);
    }

    .toc-item:hover {
      background-color: color-mix(in oklab, var(--pergaminho-300) 35%, transparent);
    }

    .toc-mark {
      flex-shrink: 0;
      inline-size: 8px;
      block-size: 8px;
      transform: rotate(45deg);
    }

    .toc-item[aria-current='true'] .toc-mark {
      background-color: var(--ouro-700);
    }

    .toc-dots {
      flex: 1;
      min-inline-size: 16px;
      border-block-end: 1px dotted var(--couro-500);
    }

    .quill {
      inline-size: 96px;
      fill: none;
      stroke: var(--couro-600);
      stroke-width: 1.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class LibraryContentsComponent {
  /** Mundos da lista atual (`view`). */
  readonly worlds = input.required<readonly World[]>();
  readonly selectedId = input<Uuid | null>(null);
  readonly status = input.required<LibraryStatus>();
  readonly ownerName = input.required<string>();
  readonly view = input<LibraryView>('worlds');
  /** Nenhum mundo em lista alguma: só a ilustração do livro em branco. */
  readonly blank = input(false);
  /** Quantos há em cada lista, para os rótulos das abas. */
  readonly counts = input<Readonly<Record<LibraryView, number>>>({
    worlds: 0,
    archived: 0,
    trash: 0,
  });

  readonly choose = output<Uuid>();
  readonly create = output();
  readonly import = output();
  readonly retry = output();
  readonly viewChange = output<LibraryView>();

  protected readonly text = BOOK_STRINGS.library;
  protected readonly tabsPrefix = TABS_PREFIX;
  protected readonly tabs = computed<TabItem[]>(() =>
    LIBRARY_VIEWS.map((view) => ({
      id: view,
      label:
        view === 'worlds'
          ? this.text.viewNames.worlds
          : this.text.viewCount(this.text.viewNames[view], this.counts()[view]),
    })),
  );
  protected readonly tabId = computed(() => tabId(TABS_PREFIX, this.view()));
  protected readonly panelId = computed(() => tabPanelId(TABS_PREFIX, this.view()));
  protected readonly emptyText = computed(() => {
    const view = this.view();
    return view === 'worlds'
      ? this.text.noWorlds
      : view === 'archived'
        ? this.text.noArchived
        : this.text.noTrash;
  });

  protected changeView(id: string): void {
    const view = LIBRARY_VIEWS.find((v) => v === id);
    if (view) this.viewChange.emit(view);
  }

  /** Na lixeira, a data em que o mundo entrou nela; nas outras listas, a última edição. */
  protected editDate(world: World): string {
    const date = this.view() === 'trash' ? (world.deletedAt ?? world.updatedAt) : world.updatedAt;
    return formatEditDate(date);
  }
}
