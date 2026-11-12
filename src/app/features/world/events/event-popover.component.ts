import { Component, computed, inject, input, output } from '@angular/core';
import { TIME_STRINGS } from '@core/strings/time.strings';
import { eventColor } from '@domain/events';
import type { Point } from '@domain/geometry';
import type { WorldEvent } from '@domain/models';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { EntityAvatarComponent } from '../entities/entity-avatar.component';
import { WorldStore } from '../state/world.store';

/** Largura máxima (docs/05 › Popover do mapa: até 320 px). */
const WIDTH = 320;
const MARGIN = 12;

/**
 * Popover de evento (docs/05 › `wd-popover`): couro com filete dourado duplo, título em
 * serifa, data no calendário do mundo e ações em ícones na base. Abre ao passar o ponteiro
 * por um marcador (no mapa ou no trilho); o clique no marcador abre a ficha.
 */
@Component({
  selector: 'wd-event-popover',
  imports: [EntityAvatarComponent, IconButtonComponent],
  template: `
    <div class="popover wd-panel" role="group" [attr.aria-label]="event().title">
      <div class="head">
        <wd-entity-avatar kind="event" [color]="color()" [size]="28" />
        <p class="title">{{ event().title }}</p>
      </div>
      <p class="date">
        {{ start() }}
        @if (end(); as end) {
          <span class="until">{{ text.until(end) }}</span>
        }
      </p>
      <div class="actions">
        <button
          wd-icon-button
          type="button"
          icon="history"
          size="sm"
          tooltipPosition="below"
          [label]="text.goTo"
          (click)="goTo.emit()"
        ></button>
        <button
          wd-icon-button
          type="button"
          icon="open_in_full"
          size="sm"
          tooltipPosition="below"
          [label]="text.open"
          (click)="open.emit()"
        ></button>
      </div>
    </div>
  `,
  host: {
    '[style.left.px]': 'left()',
    '[style.top.px]': 'anchor().y',
    '(pointerenter)': 'enter.emit()',
    '(pointerleave)': 'leave.emit()',
  },
  styles: `
    :host {
      position: fixed;
      z-index: 20;
      display: block;
      inline-size: max-content;
      max-inline-size: 320px;
      padding-block-end: 10px;
      transform: translate(-50%, -100%);
      animation: pop-in var(--wd-dur-base) var(--wd-ease-out);
    }

    .popover {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-inline-size: 200px;
      padding: 10px 12px 6px;
    }

    .head {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .title {
      font-family: var(--font-book);
      font-size: 1.25rem;
      line-height: 1.2;
      color: var(--wd-text-on-surface);
    }

    .date {
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      color: var(--wd-text-muted);
    }

    .until::before {
      content: ' ';
    }

    .actions {
      display: flex;
      gap: 2px;
      justify-content: flex-end;
      padding-block-start: 4px;
      border-block-start: 1px solid var(--wd-divider);
    }

    @keyframes pop-in {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `,
})
export class EventPopoverComponent {
  readonly event = input.required<WorldEvent>();
  /** Ponto acima do marcador, em coordenadas da janela. */
  readonly anchor = input.required<Point>();

  readonly open = output();
  readonly goTo = output();
  readonly enter = output();
  readonly leave = output();

  protected readonly text = TIME_STRINGS.events.popover;
  private readonly world = inject(WorldStore);

  protected readonly color = computed(() => eventColor(this.event()));
  protected readonly start = computed(() => this.world.calendar().format(this.event().tickStart));
  protected readonly end = computed(() => {
    const end = this.event().tickEnd;
    return end === null ? null : this.world.calendar().format(end);
  });
  /** Centro horizontal sem deixar o popover sair da janela. */
  protected readonly left = computed(() => {
    const half = WIDTH / 2;
    const width = globalThis.innerWidth || WIDTH * 2;
    return Math.min(Math.max(this.anchor().x, half + MARGIN), width - half - MARGIN);
  });
}
