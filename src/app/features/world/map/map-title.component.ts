import {
  CdkMenu,
  CdkMenuGroup,
  CdkMenuItem,
  CdkMenuItemRadio,
  CdkMenuTrigger,
} from '@angular/cdk/menu';
import { Component, input, output } from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import type { MapTreeRow } from '@domain/maps';
import type { Uuid, WorldMap } from '@domain/models';
import { IconComponent } from '@shared/ui/icon/icon.component';

export type MapTitleAction = 'rename' | 'move-to-root' | 'scale' | 'import' | 'versions';

/**
 * Título do mapa na barra superior (docs/05): mostra o mapa ativo e abre o seletor com a
 * árvore de mapas e as ações do mapa atual.
 */
@Component({
  selector: 'wd-map-title',
  imports: [CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuItemRadio, CdkMenuTrigger, IconComponent],
  template: `
    <button type="button" class="trigger wd-focus" [cdkMenuTriggerFor]="menu">
      <!-- Nome acessível = texto visível (trilha e mapa) + o complemento para leitor de tela. -->
      @for (ancestor of ancestors(); track ancestor.id) {
        <span class="ancestor">{{ ancestor.name }} ›</span>
      }
      <span class="wd-inscription truncate text-lg text-ouro-400">{{ title() }}</span>
      <span class="sr-only">{{ text.change }}</span>
      <wd-icon name="expand_more" size="sm" class="text-ouro-500" />
    </button>

    <ng-template #menu>
      <div class="wd-menu" cdkMenu>
        <p class="wd-menu-heading wd-inscription" aria-hidden="true">{{ text.maps }}</p>
        <div cdkMenuGroup role="group" [attr.aria-label]="text.maps">
          @for (row of tree(); track row.map.id) {
            <button
              type="button"
              class="wd-menu-item font-book text-base"
              cdkMenuItemRadio
              [cdkMenuItemChecked]="row.map.id === activeId()"
              [style.padding-inline-start.px]="12 + row.depth * 18"
              (cdkMenuItemTriggered)="selectMap.emit(row.map.id)"
            >
              <wd-icon
                [name]="row.map.id === activeId() ? 'radio_button_checked' : 'map'"
                size="sm"
              />
              <span class="truncate">{{ row.map.name }}</span>
            </button>
          }
        </div>
        <hr class="wd-menu-divider" />
        <div cdkMenuGroup role="group" [attr.aria-label]="text.actions">
          <button
            type="button"
            class="wd-menu-item"
            cdkMenuItem
            (cdkMenuItemTriggered)="action.emit('rename')"
          >
            <wd-icon name="edit" size="sm" />{{ text.rename }}
          </button>
          @if (canMoveToRoot()) {
            <button
              type="button"
              class="wd-menu-item"
              cdkMenuItem
              (cdkMenuItemTriggered)="action.emit('move-to-root')"
            >
              <wd-icon name="vertical_align_top" size="sm" />{{ text.moveToRoot }}
            </button>
          }
          <button
            type="button"
            class="wd-menu-item"
            cdkMenuItem
            (cdkMenuItemTriggered)="action.emit('scale')"
          >
            <wd-icon name="square_foot" size="sm" />{{ text.setScale }}
          </button>
          <button
            type="button"
            class="wd-menu-item"
            cdkMenuItem
            (cdkMenuItemTriggered)="action.emit('import')"
          >
            <wd-icon name="add_photo_alternate" size="sm" />{{ text.importAnother }}
          </button>
          <button
            type="button"
            class="wd-menu-item"
            cdkMenuItem
            (cdkMenuItemTriggered)="action.emit('versions')"
          >
            <wd-icon name="history" size="sm" />{{ text.versions }}
          </button>
        </div>
        @if (links().length > 0) {
          <hr class="wd-menu-divider" />
          <div cdkMenuGroup role="group" [attr.aria-label]="linkText.title">
            @for (link of links(); track link.id) {
              <button
                type="button"
                class="wd-menu-item"
                cdkMenuItem
                (cdkMenuItemTriggered)="removeLink.emit(link.id)"
              >
                <wd-icon name="link_off" size="sm" />{{ linkText.remove(link.targetName) }}
              </button>
            }
          </div>
        }
      </div>
    </ng-template>
  `,
  host: { class: 'flex min-w-0 justify-center' },
  styles: `
    .trigger {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-inline-size: 0;
      max-inline-size: 100%;
      min-block-size: 40px;
      padding-inline: 12px;
      cursor: pointer;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--wd-radius-control);
      transition: background-color var(--wd-dur-fast) var(--wd-ease-out);
    }

    .trigger:hover,
    .trigger[aria-expanded='true'] {
      background-color: var(--wd-surface-raised);
      border-color: var(--wd-rule);
    }

    .ancestor {
      flex-shrink: 1;
      overflow: hidden;
      font-family: var(--font-book);
      font-size: 0.875rem;
      color: var(--wd-text-muted);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (width < 768px) {
      .ancestor {
        display: none;
      }
    }
  `,
})
export class MapTitleComponent {
  readonly title = input.required<string>();
  readonly tree = input.required<readonly MapTreeRow[]>();
  readonly activeId = input<Uuid | null>(null);
  readonly ancestors = input<readonly WorldMap[]>([]);
  readonly canMoveToRoot = input(false);
  /** Links do mapa atual, para removê-los. */
  readonly links = input<readonly { id: Uuid; targetName: string }[]>([]);

  readonly selectMap = output<Uuid>();
  readonly action = output<MapTitleAction>();
  readonly removeLink = output<Uuid>();

  protected readonly text = MAP_STRINGS.selector;
  protected readonly linkText = MAP_STRINGS.link;
}
