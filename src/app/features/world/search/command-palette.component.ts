import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ENTITY_KIND_STRINGS, ENTITY_STRINGS } from '@core/strings/entity.strings';
import type { Uuid } from '@domain/models';
import { foldText, type SearchKind, type WorldSearch } from '@domain/search';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { EntityAvatarComponent } from '../entities/entity-avatar.component';

/** Comando da paleta (ação da tela, criar entidade, abrir mapa). */
export interface PaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  /** Mostrado no grupo Mapas em vez de Comandos. */
  readonly group?: 'commands' | 'maps';
}

export interface PaletteData {
  readonly search: WorldSearch;
  readonly commands: readonly PaletteCommand[];
}

export type PaletteResult =
  | { readonly type: 'entity'; readonly id: Uuid }
  | { readonly type: 'event'; readonly id: Uuid }
  | { readonly type: 'command'; readonly id: string };

interface Option {
  readonly key: string;
  readonly label: string;
  readonly detail: string | null;
  readonly icon: string | null;
  readonly kind: SearchKind | null;
  readonly result: PaletteResult;
}

interface Group {
  readonly id: 'entities' | 'events' | 'commands' | 'maps';
  readonly options: readonly Option[];
}

const ENTITY_LIMIT = 8;
const EVENT_LIMIT = 5;

/**
 * Busca e paleta de comandos (`Ctrl/Cmd+K`, docs/04 › Atalhos): uma caixa de busca
 * (combobox) com resultados agrupados em Entidades, Eventos, Comandos e Mapas. Setas
 * escolhem, Enter abre, Esc fecha. Devolve o resultado escolhido a quem abriu.
 */
@Component({
  selector: 'wd-command-palette',
  imports: [DialogComponent, EntityAvatarComponent, IconComponent],
  template: `
    <wd-dialog [title]="text.title">
      <div class="palette">
        <span class="search">
          <wd-icon name="search" size="sm" />
          <input
            id="wd-palette-input"
            type="text"
            role="combobox"
            autocomplete="off"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="wd-palette-list"
            cdkFocusInitial
            [attr.aria-label]="text.input"
            [attr.aria-activedescendant]="activeId()"
            [placeholder]="text.placeholder"
            [value]="query()"
            (input)="setQuery($any($event.target).value)"
            (keydown)="onKey($event)"
          />
        </span>
        <div id="wd-palette-list" role="listbox" class="list" [attr.aria-label]="text.title">
          @for (group of groups(); track group.id) {
            <div role="group" [attr.aria-labelledby]="'wd-palette-group-' + group.id">
              <p class="group" role="presentation" [id]="'wd-palette-group-' + group.id">
                {{ text.groups[group.id] }}
              </p>
              @for (option of group.options; track option.key) {
                <div
                  role="option"
                  class="option"
                  [id]="optionId(option)"
                  [attr.aria-selected]="option.key === activeKey()"
                  (mousedown)="$event.preventDefault()"
                  tabindex="-1"
                  (click)="choose(option)"
                  (keydown.enter)="choose(option)"
                  (mousemove)="activeKey.set(option.key)"
                >
                  @if (option.kind) {
                    <wd-entity-avatar [kind]="option.kind" [name]="option.label" [size]="28" />
                  } @else if (option.icon) {
                    <span class="icon"><wd-icon [name]="option.icon" size="sm" /></span>
                  }
                  <span class="label">{{ option.label }}</span>
                  @if (option.detail) {
                    <span class="detail">{{ option.detail }}</span>
                  }
                </div>
              }
            </div>
          } @empty {
            <p class="empty">{{ text.empty }}</p>
          }
        </div>
        <p class="hint" aria-hidden="true">{{ text.hint }}</p>
      </div>
    </wd-dialog>
  `,
  styles: `
    .palette {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .search {
      display: flex;
      gap: 8px;
      align-items: center;
      padding-inline: 10px;
      color: var(--wd-text-muted);
      background: var(--couro-700);
      border: 1px solid var(--wd-rule);
      border-radius: var(--wd-radius-control);
    }

    .search:focus-within {
      border-color: var(--wd-focus-ring);
      box-shadow: 0 0 0 1px var(--wd-focus-ring);
    }

    input {
      flex: 1;
      padding-block: 10px;
      font-family: var(--font-sans);
      font-size: 1rem;
      color: var(--wd-text-on-surface);
      background: none;
      border: 0;
      outline: none;
    }

    input::placeholder {
      color: var(--wd-text-muted);
    }

    .list {
      max-block-size: min(55dvh, 420px);
      overflow-y: auto;
    }

    .group {
      padding: 8px 8px 4px;
      font-family: var(--font-inscription);
      font-size: 0.75rem;
      color: var(--wd-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .option {
      display: flex;
      gap: 10px;
      align-items: center;
      min-block-size: 40px;
      padding: 4px 8px;
      cursor: pointer;
      border-radius: var(--wd-radius-control);
    }

    .option[aria-selected='true'] {
      background: var(--wd-surface-active);
      box-shadow: inset 2px 0 0 var(--wd-accent);
    }

    .icon {
      display: grid;
      place-items: center;
      inline-size: 28px;
      color: var(--wd-accent);
    }

    .label {
      flex: 1;
      min-inline-size: 0;
      overflow: hidden;
      font-family: var(--font-book);
      font-size: 1.0625rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-muted);
      white-space: nowrap;
    }

    .empty,
    .hint {
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-muted);
    }

    .empty {
      padding: 16px 8px;
      text-align: center;
    }

    .hint {
      font-size: 0.75rem;
      text-align: end;
    }
  `,
})
export class CommandPaletteComponent {
  private readonly ref = inject<DialogRef<PaletteResult>>(DialogRef);
  private readonly data = inject<PaletteData>(DIALOG_DATA);
  private readonly announcer = inject(LiveAnnouncer);

  protected readonly text = ENTITY_STRINGS.palette;
  protected readonly query = signal('');
  protected readonly activeKey = signal<string | null>(null);

  protected readonly groups = computed<Group[]>(() => {
    const query = this.query().trim();
    const folded = foldText(query);
    const commands = this.data.commands.filter(
      (command) => !folded || foldText(command.label).includes(folded),
    );
    const toCommand = (command: PaletteCommand): Option => ({
      key: `c:${command.id}`,
      label: command.label,
      detail: null,
      icon: command.icon,
      kind: null,
      result: { type: 'command', id: command.id },
    });
    const hits = query ? this.data.search.search(query) : [];
    const entities: Option[] = hits
      .filter((hit) => hit.kind !== 'event')
      .slice(0, ENTITY_LIMIT)
      .map((hit) => ({
        key: `e:${hit.id}`,
        label: hit.title,
        detail: hit.alias
          ? ENTITY_STRINGS.explorer.alsoKnownAs(hit.alias)
          : ENTITY_KIND_STRINGS[hit.kind as Exclude<SearchKind, 'event'>].one,
        icon: null,
        kind: hit.kind,
        result: { type: 'entity', id: hit.id },
      }));
    const events: Option[] = hits
      .filter((hit) => hit.kind === 'event')
      .slice(0, EVENT_LIMIT)
      .map((hit) => ({
        key: `v:${hit.id}`,
        label: hit.title,
        detail: null,
        icon: null,
        kind: 'event',
        result: { type: 'event', id: hit.id },
      }));
    const groups: Group[] = [
      { id: 'entities', options: entities },
      { id: 'events', options: events },
      {
        id: 'commands',
        options: commands.filter((c) => c.group !== 'maps').map(toCommand),
      },
      { id: 'maps', options: commands.filter((c) => c.group === 'maps').map(toCommand) },
    ];
    return groups.filter((group) => group.options.length > 0);
  });

  private readonly options = computed(() => this.groups().flatMap((group) => group.options));
  protected readonly activeId = computed(() => {
    const option = this.options().find((o) => o.key === this.activeKey());
    return option ? this.optionId(option) : null;
  });

  constructor() {
    // Nova lista: o primeiro item fica ativo e o total é anunciado.
    effect(() => {
      const options = this.options();
      this.activeKey.set(options[0]?.key ?? null);
      if (this.query().trim()) void this.announcer.announce(this.text.resultCount(options.length));
    });
  }

  protected optionId(option: Option): string {
    return `wd-palette-${option.key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  }

  protected setQuery(value: string): void {
    this.query.set(value);
  }

  protected onKey(event: KeyboardEvent): void {
    const options = this.options();
    const index = options.findIndex((o) => o.key === this.activeKey());
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = options[(index + step + options.length) % options.length];
      this.activeKey.set(next?.key ?? null);
      if (next) {
        document.getElementById(this.optionId(next))?.scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[index];
      if (option) this.choose(option);
    }
  }

  protected choose(option: Option): void {
    this.ref.close(option.result);
  }
}
