import { Component, ElementRef, inject, input, model } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  /** Ícone acima do rótulo (abas do Explorar). */
  readonly icon?: string;
}

/** Id da aba e do painel, para o painel usar `aria-labelledby` e as abas `aria-controls`. */
export function tabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function tabPanelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

/**
 * Lista de abas (WAI-ARIA Tabs, ativação automática): setas, Home e End movem o foco e
 * selecionam; só a aba ativa entra no Tab. O painel fica com quem usa:
 * ```html
 * <wd-tabs idPrefix="wd-sheet" label="Seções" [tabs]="tabs" [(selected)]="tab" />
 * <div role="tabpanel" [id]="panelId" [attr.aria-labelledby]="tabId" tabindex="0">…</div>
 * ```
 * Aba ativa com filete dourado (docs/05).
 */
@Component({
  selector: 'wd-tabs',
  imports: [IconComponent],
  template: `
    <div role="tablist" class="tablist" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          class="tab wd-focus"
          [id]="tabId(tab.id)"
          [attr.aria-selected]="tab.id === selected()"
          [attr.aria-controls]="panelId(tab.id)"
          [attr.data-icon]="tab.icon ? '' : null"
          [tabIndex]="tab.id === selected() ? 0 : -1"
          (click)="selected.set(tab.id)"
          (keydown)="onKey($event)"
        >
          @if (tab.icon) {
            <wd-icon [name]="tab.icon" size="sm" />
          }
          <span class="name">{{ tab.label }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .tablist {
      display: flex;
      gap: 2px;
      border-block-end: 1px solid var(--wd-divider);
    }

    .tab {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      align-items: center;
      min-inline-size: 0;
      padding: 6px 2px 8px;
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-control-muted);
      cursor: pointer;
      background: none;
      border: 0;
      border-radius: var(--wd-radius-control) var(--wd-radius-control) 0 0;
      transition: color var(--wd-dur-fast) var(--wd-ease-out);
    }

    .tab:not([data-icon]) {
      flex: 0 0 auto;
      padding-inline: 12px;
      font-size: 0.875rem;
    }

    .tab:hover {
      color: var(--wd-control-text);
    }

    .tab[aria-selected='true'] {
      color: var(--wd-control-selected);
      box-shadow: inset 0 -2px 0 var(--wd-control-selected-rule);
    }

    .name {
      max-inline-size: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      .tab {
        transition: none;
      }
    }
  `,
})
export class TabsComponent {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly selected = model.required<string>();
  /** Nome acessível da lista de abas. */
  readonly label = input.required<string>();
  /** Prefixo dos ids (único na página). */
  readonly idPrefix = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected tabId(id: string): string {
    return tabId(this.idPrefix(), id);
  }

  protected panelId(id: string): string {
    return tabPanelId(this.idPrefix(), id);
  }

  protected onKey(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const index = tabs.findIndex((tab) => tab.id === this.selected());
    const last = tabs.length - 1;
    const next = {
      ArrowRight: index >= last ? 0 : index + 1,
      ArrowLeft: index <= 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    const tab = next === undefined ? undefined : tabs[next];
    if (!tab) return;
    event.preventDefault();
    this.selected.set(tab.id);
    this.host.nativeElement
      .querySelector<HTMLElement>(`#${CSS.escape(this.tabId(tab.id))}`)
      ?.focus();
  }
}
