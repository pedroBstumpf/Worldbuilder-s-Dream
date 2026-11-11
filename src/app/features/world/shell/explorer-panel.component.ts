import { CdkDrag, type CdkDragEnd, type CdkDragMove } from '@angular/cdk/drag-drop';
import { Component, input, output, signal } from '@angular/core';
import { clampExplorerWidth, EXPLORER_WIDTH } from '@core/prefs/ui-prefs';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

/** Passo do redimensionamento pelo teclado. */
const RESIZE_STEP = 16;

/**
 * Barra direita "Explorar" (docs/05 › `wd-explorer`). No M1 é só a moldura com o estado
 * vazio; abas e lista chegam no M2. Largura ajustável (CDK Drag no eixo X ou setas na
 * alça), salva em `ui_prefs`. Recolher anima `transform`.
 */
@Component({
  selector: 'wd-explorer-panel',
  imports: [CdkDrag, IconComponent, TooltipDirective],
  template: `
    <aside
      class="panel wd-panel"
      aria-labelledby="wd-explorer-title"
      [style.inline-size.px]="liveWidth() ?? width()"
      [attr.data-collapsed]="collapsed()"
      [inert]="collapsed()"
    >
      <div
        class="handle"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        [attr.aria-label]="text.resize"
        [attr.aria-valuenow]="width()"
        [attr.aria-valuemin]="limits.min"
        [attr.aria-valuemax]="limits.max"
        cdkDrag
        cdkDragLockAxis="x"
        (cdkDragMoved)="onDrag($event)"
        (cdkDragEnded)="onDragEnd($event)"
        (keydown)="onKey($event)"
      ></div>
      <h2 id="wd-explorer-title" class="wd-inscription text-center text-base text-ouro-400">
        {{ text.title }}
      </h2>
      <hr class="rule" />
      <div class="empty">
        <wd-icon name="travel_explore" size="lg" class="text-ouro-500" />
        <p class="font-book text-lg">{{ text.empty }}</p>
        <p class="font-sans text-sm text-pergaminho-400">{{ text.emptyHint }}</p>
      </div>
    </aside>
    <button
      type="button"
      class="toggle wd-panel wd-focus"
      [attr.aria-label]="collapsed() ? text.expand : text.collapse"
      [attr.aria-expanded]="!collapsed()"
      [wdTooltip]="collapsed() ? text.expand : text.collapse"
      wdTooltipPosition="left"
      (click)="collapsedChange.emit(!collapsed())"
    >
      <wd-icon [name]="collapsed() ? 'right_panel_open' : 'right_panel_close'" size="sm" />
    </button>
  `,
  styles: `
    :host {
      position: fixed;
      inset-block: 64px 12px;
      inset-inline-end: 12px;
      display: flex;
      flex-direction: row-reverse;
      gap: 8px;
      align-items: flex-start;
      pointer-events: none;
    }

    .panel,
    .toggle {
      pointer-events: auto;
    }

    .panel {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 8px;
      block-size: 100%;
      padding: 14px 16px;
      transition:
        transform var(--wd-dur-base) var(--wd-ease-out),
        opacity var(--wd-dur-base) var(--wd-ease-out);
    }

    .panel[data-collapsed='true'] {
      opacity: 0;
      transform: translateX(calc(100% + 16px));
    }

    .handle {
      position: absolute;
      inset-block: 12px;
      inset-inline-start: -5px;
      z-index: 1;
      inline-size: 10px;
      cursor: ew-resize;
      border-radius: 999px;
    }

    .handle:hover,
    .handle:focus-visible {
      background: linear-gradient(var(--wd-rule-strong), var(--wd-rule-strong)) center / 2px 100%
        no-repeat;
    }

    .rule {
      border: 0;
      border-block-start: 1px solid var(--wd-rule);
    }

    .empty {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      justify-content: center;
      text-align: center;
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
      .panel {
        transition: none;
      }
    }
  `,
})
export class ExplorerPanelComponent {
  readonly width = input<number>(EXPLORER_WIDTH.default);
  readonly collapsed = input(false);

  readonly widthChange = output<number>();
  readonly collapsedChange = output<boolean>();

  protected readonly text = MAP_STRINGS.explorer;
  protected readonly limits = EXPLORER_WIDTH;
  /** Largura durante o arraste (só grava ao soltar). */
  protected readonly liveWidth = signal<number | null>(null);
  private startWidth = 0;

  protected onDrag(event: CdkDragMove): void {
    if (this.liveWidth() === null) this.startWidth = this.width();
    // A alça fica na borda esquerda: arrastar para a esquerda alarga.
    this.liveWidth.set(clampExplorerWidth(this.startWidth - event.distance.x));
  }

  protected onDragEnd(event: CdkDragEnd): void {
    // A alça volta ao lugar: quem se move é a borda do painel.
    event.source.reset();
    const width = this.liveWidth();
    this.liveWidth.set(null);
    if (width !== null) this.widthChange.emit(width);
  }

  protected onKey(event: KeyboardEvent): void {
    const delta = { ArrowLeft: RESIZE_STEP, ArrowRight: -RESIZE_STEP }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    this.widthChange.emit(clampExplorerWidth(this.width() + delta));
  }
}
