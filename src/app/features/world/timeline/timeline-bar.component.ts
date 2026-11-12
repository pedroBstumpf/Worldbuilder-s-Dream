import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TIME_STRINGS } from '@core/strings/time.strings';
import type { Tick, Uuid } from '@domain/models';
import {
  eraMarks,
  isEventActive,
  PLAY_SPEEDS,
  rulerMarks,
  snapTick,
  tickToX,
  xToTick,
  type RulerMark,
} from '@domain/timeline';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { TimelineStore } from '../state/timeline.store';

/** Evento como aparece no trilho. `color` nulo = ouro. */
export interface TimelineEventMark {
  readonly id: Uuid;
  readonly title: string;
  readonly tickStart: Tick;
  readonly tickEnd: Tick | null;
  readonly color: string | null;
}

/** Marcador sob o ponteiro (para o popover), em coordenadas da janela. */
export interface TimelineEventHover {
  readonly id: Uuid;
  readonly x: number;
  readonly y: number;
}

/** Altura do SVG e posição do trilho. */
const HEIGHT = 64;
const TRACK_Y = 34;
/** Menor distância entre rótulos da régua. */
const LABEL_GAP = 56;
/** Arraste menor que isso é clique. */
const DRAG_SLOP = 4;
const ZOOM_STEP = 1.25;

type Gesture =
  | { kind: 'cursor'; pointerId: number }
  | {
      kind: 'pan';
      pointerId: number;
      startX: number;
      startView: { start: Tick; end: Tick };
      moved: boolean;
      eventId: Uuid | null;
    };

/**
 * Barra inferior "linha do tempo" (docs/06 §7, docs/05 › `wd-timeline-bar`): régua no
 * calendário do mundo, eras em losango, eventos (losangos ou barras), trilho percorrido em
 * ouro e o cursor, que é um `role="slider"` com a data formatada. Roda do mouse dá zoom
 * em torno do ponteiro; arrastar o fundo desloca; clicar no fundo move o cursor.
 */
@Component({
  selector: 'wd-timeline-bar',
  imports: [IconButtonComponent],
  template: `
    <section class="bar" role="region" [attr.aria-label]="text.region">
      <div class="controls">
        <button
          wd-icon-button
          type="button"
          [icon]="store.isPlaying() ? 'pause' : 'play_arrow'"
          [label]="store.isPlaying() ? text.pause : text.play"
          (click)="store.toggle()"
        ></button>
        <button
          type="button"
          class="speed wd-focus"
          [attr.aria-label]="text.speed(text.speeds[store.speed()])"
          (click)="cycleSpeed()"
        >
          {{ text.speeds[store.speed()] }}
        </button>
        <button
          wd-icon-button
          type="button"
          icon="repeat"
          size="sm"
          [pressed]="store.loop()"
          [label]="text.loop"
          (click)="store.setLoop(!store.loop())"
        ></button>
      </div>

      <div
        #area
        class="area"
        [attr.data-gesture]="gesture()?.kind ?? null"
        (wheel)="onWheel($event)"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="cancelGesture()"
        (pointerleave)="leave()"
      >
        <svg
          class="track"
          [attr.viewBox]="'0 0 ' + width() + ' ' + height"
          [attr.width]="width()"
          [attr.height]="height"
          aria-hidden="true"
          focusable="false"
        >
          @for (mark of marks(); track mark.tick) {
            <g class="mark" [class.major]="mark.major" [attr.transform]="translate(mark.tick)">
              <line [attr.y1]="trackY - 12" [attr.y2]="trackY - 4" />
              <text y="12" text-anchor="middle">{{ mark.label }}</text>
            </g>
          }
          <line
            class="rest"
            [attr.x1]="rangeX().start"
            [attr.x2]="rangeX().end"
            [attr.y1]="trackY"
            [attr.y2]="trackY"
          />
          <line
            class="passed"
            [attr.x1]="rangeX().start"
            [attr.x2]="cursorX()"
            [attr.y1]="trackY"
            [attr.y2]="trackY"
          />
          @if (nowX(); as x) {
            <g class="now" [attr.transform]="'translate(' + x + ' 0)'">
              <line [attr.y1]="trackY - 14" [attr.y2]="trackY + 14" />
            </g>
          }
          @for (era of eras(); track era.tick) {
            <g class="era" [attr.transform]="translate(era.tick)">
              <path [attr.d]="diamond(trackY, 6)" />
              <text [attr.y]="trackY + 24" text-anchor="middle">{{ era.name }}</text>
            </g>
          }
          @for (event of visibleEvents(); track event.id) {
            <g
              class="event"
              [attr.data-event-id]="event.id"
              [class.active]="event.active"
              [style.--event-color]="event.color"
            >
              @if (event.x2 !== null) {
                <rect
                  [attr.x]="event.x1"
                  [attr.y]="trackY - 4"
                  [attr.width]="Math.max(event.x2 - event.x1, 6)"
                  height="8"
                  rx="4"
                />
              }
              <path [attr.d]="diamond(trackY, 7, event.x1)" />
            </g>
          }
        </svg>

        @if (cursorInView()) {
          <div
            class="cursor-line"
            aria-hidden="true"
            [style.transform]="'translateX(' + cursorX() + 'px)'"
          ></div>
        }
        <div
          class="cursor wd-focus"
          role="slider"
          tabindex="0"
          id="wd-timeline-cursor"
          aria-orientation="horizontal"
          aria-describedby="wd-timeline-instructions"
          [attr.aria-label]="text.cursor"
          [attr.aria-valuemin]="store.range().start"
          [attr.aria-valuemax]="store.range().end"
          [attr.aria-valuenow]="store.currentTick()"
          [attr.aria-valuetext]="valueText()"
          [attr.data-offscreen]="!cursorInView()"
          [style.transform]="'translateX(' + knobX() + 'px)'"
          (keydown)="onKey($event)"
          (pointerdown)="startCursorDrag($event)"
        ></div>
        <p class="date" aria-hidden="true" [style.transform]="labelTransform()">
          {{ store.label() }}
        </p>
        <p id="wd-timeline-instructions" class="sr-only">{{ text.instructions }}</p>
      </div>

      <div class="controls">
        <button
          wd-icon-button
          type="button"
          icon="unfold_more_double"
          size="sm"
          tooltipPosition="above"
          [label]="text.showAll"
          (click)="store.showAll()"
        ></button>
        <button
          wd-icon-button
          type="button"
          icon="add_diamond"
          tooltipPosition="above"
          [label]="text.newEvent"
          (click)="createEvent.emit()"
        ></button>
        <button
          wd-icon-button
          type="button"
          icon="calendar_month"
          tooltipPosition="above"
          [label]="text.calendar"
          (click)="openCalendar.emit()"
        ></button>
      </div>
    </section>
  `,
  styles: `
    :host {
      position: fixed;
      inset: auto 0 0;
      z-index: 5;
      display: block;
    }

    /* 88 px, couro 95%, filete dourado superior (docs/05 › wd-timeline-bar). */
    .bar {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      block-size: var(--wd-timeline-height, 88px);
      padding-inline: 12px;
      color: var(--wd-text-on-surface);
      background-color: color-mix(in oklab, var(--wd-surface) 95%, transparent);
      background-image: var(--wd-texture-leather);
      border-block-start: 1px solid var(--wd-rule-strong);
      box-shadow: var(--wd-shadow-panel);
    }

    .controls {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .speed {
      min-inline-size: 72px;
      padding: 4px 8px;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--wd-text-muted);
      cursor: pointer;
      background: none;
      border: 1px solid var(--wd-divider);
      border-radius: var(--wd-radius-control);
    }

    .speed:hover {
      color: var(--wd-accent);
    }

    .area {
      position: relative;
      block-size: 64px;
      overflow: visible;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }

    .area[data-gesture='pan'] {
      cursor: grabbing;
    }

    .track {
      display: block;
      overflow: hidden;
    }

    .mark line {
      stroke: var(--wd-divider);
      stroke-width: 1;
    }

    .mark text {
      font-family: var(--font-sans);
      font-size: 11px;
      fill: var(--wd-text-muted);
    }

    .mark.major line {
      stroke: var(--wd-rule-strong);
    }

    .mark.major text {
      font-weight: 600;
      fill: var(--wd-text-on-surface);
    }

    .rest,
    .passed {
      stroke-width: 4;
      stroke-linecap: round;
    }

    .rest {
      stroke: var(--couro-600);
    }

    .passed {
      stroke: var(--wd-accent);
    }

    .now line {
      stroke: var(--pergaminho-100);
      stroke-dasharray: 2 3;
      stroke-width: 1.5;
    }

    .era path {
      fill: var(--wd-surface);
      stroke: var(--wd-rule-strong);
      stroke-width: 1.5;
    }

    .era text {
      font-family: var(--font-inscription);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      fill: var(--wd-accent);
    }

    .event {
      --event-color: var(--ouro-300);

      cursor: pointer;
    }

    .event path {
      fill: var(--event-color);
      stroke: var(--couro-950);
      stroke-width: 1.5;
    }

    .event rect {
      fill: color-mix(in oklab, var(--event-color) 55%, transparent);
      stroke: var(--event-color);
      stroke-width: 1;
    }

    .event.active path {
      stroke: var(--ouro-200);
      stroke-width: 2;
    }

    .cursor-line {
      position: absolute;
      inset-block: 0;
      inset-inline-start: -1px;
      inline-size: 2px;
      pointer-events: none;
      background: linear-gradient(transparent, var(--wd-accent) 30% 70%, transparent);
    }

    .cursor {
      position: absolute;
      /* Centro no trilho (TRACK_Y = 34). */
      inset-block-start: 24px;
      inset-inline-start: -10px;
      inline-size: 20px;
      block-size: 20px;
      cursor: ew-resize;
      background: radial-gradient(circle at 35% 35%, var(--ouro-200), var(--ouro-400) 60%);
      border: 2px solid var(--couro-950);
      border-radius: 999px;
      box-shadow: 0 0 10px 2px var(--wd-accent-glow);
    }

    /* Cursor fora da faixa visível: fica na borda, apagado. */
    .cursor[data-offscreen='true'] {
      opacity: 0.5;
      box-shadow: none;
    }

    .date {
      position: absolute;
      inset-block-end: calc(100% + 18px);
      inset-inline-start: 0;
      padding: 3px 10px;
      font-family: var(--font-book);
      font-size: 1rem;
      color: var(--wd-text-on-surface);
      white-space: nowrap;
      pointer-events: none;
      background: var(--wd-surface);
      border: 1px solid var(--wd-rule-strong);
      border-radius: var(--wd-radius-control);
      box-shadow: var(--wd-shadow-panel);
    }
  `,
})
export class TimelineBarComponent {
  /** Eventos do mundo, em ordem de início. */
  readonly events = input<readonly TimelineEventMark[]>([]);
  /** "Agora da narrativa" (marcador opcional). */
  readonly nowTick = input<Tick | null>(null);

  readonly eventClick = output<Uuid>();
  readonly hover = output<TimelineEventHover | null>();
  readonly createEvent = output();
  readonly openCalendar = output();

  protected readonly store = inject(TimelineStore);
  protected readonly text = TIME_STRINGS.timeline;
  protected readonly height = HEIGHT;
  protected readonly trackY = TRACK_Y;
  protected readonly Math = Math;

  protected readonly width = signal(800);
  protected readonly gesture = signal<Gesture | null>(null);
  /** Largura da etiqueta da data, para não sair da tela nas pontas. */
  private readonly labelWidth = signal(160);
  private hoveredId: Uuid | null = null;

  private readonly area = viewChild.required<ElementRef<HTMLElement>>('area');

  protected readonly x = (tick: Tick) => tickToX(tick, this.store.view(), this.width());
  protected readonly cursorX = computed(() => this.x(this.store.currentTick()));
  protected readonly cursorInView = computed(
    () => this.cursorX() >= 0 && this.cursorX() <= this.width(),
  );
  protected readonly knobX = computed(() => Math.min(this.width(), Math.max(0, this.cursorX())));
  protected readonly rangeX = computed(() => ({
    start: Math.max(-8, this.x(this.store.range().start)),
    end: Math.min(this.width() + 8, this.x(this.store.range().end)),
  }));
  protected readonly nowX = computed(() => {
    const now = this.nowTick();
    if (now === null) return null;
    const x = this.x(now);
    return x >= 0 && x <= this.width() ? x : null;
  });

  /** Marcas da régua sem rótulos sobrepostos (o início da unidade maior tem prioridade). */
  protected readonly marks = computed(() => {
    const kept: (RulerMark & { x: number })[] = [];
    for (const mark of rulerMarks(this.store.calendar(), this.store.view(), this.width())) {
      const x = this.x(mark.tick);
      const previous = kept.at(-1);
      if (previous && x - previous.x < LABEL_GAP) {
        if (mark.major && !previous.major) kept[kept.length - 1] = { ...mark, x };
        continue;
      }
      kept.push({ ...mark, x });
    }
    return kept;
  });

  protected readonly eras = computed(() => {
    const view = this.store.view();
    return eraMarks(this.store.calendar()).filter(
      (era) => era.tick >= view.start && era.tick <= view.end,
    );
  });

  /** Eventos ativos no instante atual (losango com destaque). */
  private readonly activeEvents = computed(() => {
    const tick = this.store.currentTick();
    const window = this.store.eventWindow();
    return this.events().filter((event) => isEventActive(event, tick, window));
  });

  protected readonly visibleEvents = computed(() => {
    const view = this.store.view();
    const active = new Set(this.activeEvents().map((event) => event.id));
    return this.events()
      .filter(
        (event) => (event.tickEnd ?? event.tickStart) >= view.start && event.tickStart <= view.end,
      )
      .map((event) => ({
        id: event.id,
        color: event.color,
        active: active.has(event.id),
        x1: this.x(event.tickStart),
        x2: event.tickEnd === null ? null : this.x(event.tickEnd),
      }));
  });

  protected readonly valueText = computed(() => {
    const titles = this.activeEvents().map((event) => event.title);
    return titles.length > 0
      ? `${this.store.label()}. ${this.text.eventsHere(titles.join(', '))}`
      : this.store.label();
  });

  protected readonly labelTransform = computed(() => {
    const half = this.labelWidth() / 2;
    const x = Math.min(Math.max(this.knobX() - half, -8), this.width() - this.labelWidth() + 8);
    return `translateX(${x}px)`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const area = this.area().nativeElement;
      const observer = new ResizeObserver(() => {
        const width = Math.round(area.clientWidth);
        if (width > 0) {
          this.width.set(width);
          this.store.setWidth(width);
        }
        const label = area.querySelector<HTMLElement>('.date');
        if (label) this.labelWidth.set(label.offsetWidth);
      });
      observer.observe(area);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Foco no cursor (atalho T). */
  focusCursor(): void {
    this.area().nativeElement.querySelector<HTMLElement>('[role="slider"]')?.focus();
  }

  protected translate(tick: Tick): string {
    return `translate(${this.x(tick)} 0)`;
  }

  protected diamond(y: number, r: number, x = 0): string {
    return `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;
  }

  protected cycleSpeed(): void {
    const index = PLAY_SPEEDS.indexOf(this.store.speed());
    this.store.setSpeed(PLAY_SPEEDS[(index + 1) % PLAY_SPEEDS.length] ?? 'year');
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const view = this.store.view();
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      this.store.pan(Math.round((event.deltaX / this.width()) * (view.end - view.start)));
      return;
    }
    const anchor = xToTick(this.localX(event), view, this.width());
    this.store.zoom(event.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, anchor);
  }

  protected startCursorDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.store.pause();
    this.capture(event);
    this.gesture.set({ kind: 'cursor', pointerId: event.pointerId });
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const marker = (event.target as Element | null)?.closest('[data-event-id]');
    this.capture(event);
    this.gesture.set({
      kind: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startView: this.store.view(),
      moved: false,
      eventId: marker?.getAttribute('data-event-id') ?? null,
    });
  }

  protected onPointerMove(event: PointerEvent): void {
    const gesture = this.gesture();
    if (!gesture) {
      this.emitHover(event);
      return;
    }
    if (gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'cursor') {
      this.store.setTick(this.tickAt(event));
      return;
    }
    const dx = event.clientX - gesture.startX;
    if (!gesture.moved && Math.abs(dx) < DRAG_SLOP) return;
    if (!gesture.moved) this.gesture.set({ ...gesture, moved: true });
    const span = gesture.startView.end - gesture.startView.start;
    const delta = Math.round((-dx / this.width()) * span);
    this.store.pan(gesture.startView.start + delta - this.store.view().start);
  }

  protected onPointerUp(event: PointerEvent): void {
    const gesture = this.gesture();
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture.set(null);
    if (gesture.kind !== 'pan' || gesture.moved) return;
    if (gesture.eventId) {
      this.eventClick.emit(gesture.eventId);
      return;
    }
    this.store.pause();
    this.store.setTick(this.tickAt(event));
  }

  protected leave(): void {
    this.hoveredId = null;
    this.hover.emit(null);
  }

  protected cancelGesture(): void {
    this.gesture.set(null);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const range = this.store.range();
    const actions: Record<string, () => void> = {
      ArrowLeft: () => this.store.step(-1, event.shiftKey),
      ArrowDown: () => this.store.step(-1, event.shiftKey),
      ArrowRight: () => this.store.step(1, event.shiftKey),
      ArrowUp: () => this.store.step(1, event.shiftKey),
      Home: () => this.store.seek(range.start),
      End: () => this.store.seek(range.end),
      PageUp: () => this.jumpToEvent(-1),
      PageDown: () => this.jumpToEvent(1),
      '+': () => this.store.zoom(1 / ZOOM_STEP),
      '=': () => this.store.zoom(1 / ZOOM_STEP),
      '-': () => this.store.zoom(ZOOM_STEP),
      '0': () => this.store.showAll(),
      ' ': () => this.store.toggle(),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key !== ' ') this.store.pause();
    action();
  }

  /** Page Up/Down: início do evento anterior ou seguinte. */
  private jumpToEvent(direction: 1 | -1): void {
    const tick = this.store.currentTick();
    const starts = this.events().map((event) => event.tickStart);
    const target =
      direction === 1
        ? starts.filter((start) => start > tick).sort((a, b) => a - b)[0]
        : starts.filter((start) => start < tick).sort((a, b) => b - a)[0];
    if (target !== undefined) this.store.seek(target);
  }

  private emitHover(event: PointerEvent): void {
    const marker = (event.target as Element | null)?.closest('[data-event-id]');
    const id = marker?.getAttribute('data-event-id') ?? null;
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    if (!marker || !id) {
      this.hover.emit(null);
      return;
    }
    const rect = marker.getBoundingClientRect();
    this.hover.emit({ id, x: rect.left + rect.width / 2, y: rect.top });
  }

  private tickAt(event: PointerEvent): Tick {
    const raw = xToTick(this.localX(event), this.store.view(), this.width());
    return snapTick(this.store.calendar(), raw, this.store.precision());
  }

  private localX(event: MouseEvent): number {
    return event.clientX - this.area().nativeElement.getBoundingClientRect().left;
  }

  private capture(event: PointerEvent): void {
    try {
      this.area().nativeElement.setPointerCapture(event.pointerId);
    } catch {
      // jsdom e ponteiros sintéticos não aceitam captura.
    }
  }
}
