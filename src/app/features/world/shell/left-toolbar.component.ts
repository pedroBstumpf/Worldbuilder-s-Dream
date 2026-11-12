import { CdkMenu, CdkMenuItemCheckbox, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, input, output } from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import type { LayerId, ToolId } from '@engine/map-engine';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

/** Camadas que o usuário pode esconder (o fundo e a ferramenta ficam sempre). */
export const TOGGLEABLE_LAYERS = [
  'regions',
  'routes',
  'tokens',
  'labels',
] as const satisfies LayerId[];
export type ToggleableLayer = (typeof TOGGLEABLE_LAYERS)[number];

type AnnotationTool = 'pin' | 'brush' | 'eraser' | 'measure' | 'region' | 'label';

/** Ferramentas de anotação (docs/06 §5) em dois grupos: marcar e desenhar, medir e escrever. */
const ANNOTATION_TOOLS: readonly (readonly { id: AnnotationTool; icon: string }[])[] = [
  [
    { id: 'pin', icon: 'location_on' },
    { id: 'brush', icon: 'brush' },
    { id: 'eraser', icon: 'ink_eraser' },
  ],
  [
    { id: 'measure', icon: 'straighten' },
    { id: 'region', icon: 'pentagon' },
    { id: 'label', icon: 'title' },
  ],
];

/**
 * Barra esquerda (docs/05 › `wd-toolbar-left`): ferramentas em blocos de 44 px com tooltip
 * à direita. Ferramenta ativa em ouro (`aria-pressed`). Recolher anima `transform`; o
 * botão de recolher fica acima da barra e continua visível.
 */
@Component({
  selector: 'wd-left-toolbar',
  imports: [
    CdkMenu,
    CdkMenuItemCheckbox,
    CdkMenuTrigger,
    IconButtonComponent,
    IconComponent,
    TooltipDirective,
  ],
  template: `
    <button
      type="button"
      class="toggle wd-panel wd-focus"
      [attr.aria-label]="collapsed() ? text.expand : text.collapse"
      [attr.aria-expanded]="!collapsed()"
      [wdTooltip]="collapsed() ? text.expand : text.collapse"
      wdTooltipPosition="right"
      (click)="collapsedChange.emit(!collapsed())"
    >
      <wd-icon [name]="collapsed() ? 'left_panel_open' : 'left_panel_close'" size="sm" />
    </button>
    <div
      class="bar wd-panel"
      role="toolbar"
      aria-orientation="vertical"
      [attr.aria-label]="text.label"
      [attr.data-collapsed]="collapsed()"
      [inert]="collapsed()"
    >
      <button
        wd-icon-button
        type="button"
        icon="arrow_selector_tool"
        tooltipPosition="right"
        [label]="text.select"
        [pressed]="tool() === 'select'"
        (click)="toolChange.emit('select')"
      ></button>
      <button
        wd-icon-button
        type="button"
        icon="pan_tool"
        tooltipPosition="right"
        [label]="text.pan"
        [pressed]="tool() === 'pan'"
        (click)="toolChange.emit('pan')"
      ></button>
      @for (group of annotationTools; track $index) {
        <hr class="rule" />
        @for (item of group; track item.id) {
          <button
            wd-icon-button
            type="button"
            tooltipPosition="right"
            [attr.data-tool]="item.id"
            [icon]="item.icon"
            [label]="toolLabels[item.id]"
            [pressed]="tool() === item.id"
            (click)="toolChange.emit(tool() === item.id ? 'pan' : item.id)"
          ></button>
        }
      }
      <hr class="rule" />
      <button
        wd-icon-button
        type="button"
        icon="fit_screen"
        tooltipPosition="right"
        [label]="text.fit"
        (click)="fit.emit()"
      ></button>
      <button
        wd-icon-button
        type="button"
        icon="layers"
        tooltipPosition="right"
        [label]="text.layers"
        [cdkMenuTriggerFor]="layersMenu"
        [cdkMenuPosition]="menuPosition"
      ></button>
      <hr class="rule" />
      <button
        wd-icon-button
        type="button"
        icon="square_foot"
        tooltipPosition="right"
        [label]="text.calibrate"
        [pressed]="tool() === 'calibrate'"
        (click)="toolChange.emit(tool() === 'calibrate' ? 'pan' : 'calibrate')"
      ></button>
      <button
        wd-icon-button
        type="button"
        icon="add_link"
        tooltipPosition="right"
        [label]="text.link"
        [pressed]="tool() === 'link'"
        (click)="toolChange.emit(tool() === 'link' ? 'pan' : 'link')"
      ></button>
    </div>

    <ng-template #layersMenu>
      <div class="wd-menu" cdkMenu>
        @for (layer of layers; track layer) {
          <button
            type="button"
            class="wd-menu-item"
            cdkMenuItemCheckbox
            [cdkMenuItemChecked]="!hiddenLayers().includes(layer)"
            (cdkMenuItemTriggered)="toggleLayer.emit(layer)"
          >
            <wd-icon
              [name]="hiddenLayers().includes(layer) ? 'check_box_outline_blank' : 'check_box'"
              size="sm"
            />
            {{ text.layerNames[layer] }}
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      position: fixed;
      inset-block-start: 64px;
      inset-inline-start: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
      pointer-events: none;
    }

    .bar,
    .toggle {
      pointer-events: auto;
    }

    .bar {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-block-size: calc(100dvh - 64px - 32px - 104px);
      padding: 6px;
      overflow-y: auto;
      scrollbar-width: none;
      transition:
        transform var(--wd-dur-base) var(--wd-ease-out),
        opacity var(--wd-dur-base) var(--wd-ease-out);
    }

    .bar[data-collapsed='true'] {
      opacity: 0;
      transform: translateX(calc(-100% - 16px));
    }

    .rule {
      margin: 2px 6px;
      border: 0;
      border-block-start: 1px solid var(--wd-divider);
    }

    .toggle {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      cursor: pointer;
      color: var(--wd-text-muted);
    }

    .toggle:hover {
      color: var(--wd-accent);
    }

    @media (prefers-reduced-motion: reduce) {
      .bar {
        transition: none;
      }
    }
  `,
})
export class LeftToolbarComponent {
  readonly tool = input.required<ToolId>();
  readonly hiddenLayers = input<readonly LayerId[]>([]);
  readonly collapsed = input(false);

  readonly toolChange = output<ToolId>();
  /** O zoom é pela roda, pinça ou teclado; a barra só enquadra o mapa. */
  readonly fit = output();
  readonly toggleLayer = output<ToggleableLayer>();
  readonly collapsedChange = output<boolean>();

  protected readonly text = MAP_STRINGS.toolbar;
  protected readonly layers = TOGGLEABLE_LAYERS;
  protected readonly annotationTools = ANNOTATION_TOOLS;
  protected readonly toolLabels: Record<AnnotationTool, string> = {
    pin: this.text.pin,
    brush: this.text.brush,
    eraser: this.text.eraser,
    measure: this.text.measure,
    region: this.text.region,
    label: this.text.text,
  };
  protected readonly menuPosition = [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 8 },
  ] as const;
}
