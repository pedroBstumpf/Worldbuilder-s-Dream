import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import type { Point } from '@domain/geometry';
import {
  ANNOTATION_INK_COLORS,
  LABEL_SIZES,
  PIN_ICONS,
  readAnnotation,
  type AnnotationShape,
} from '@domain/maps';
import type { MapAnnotation, Tick, Uuid } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { EntityStore } from '../state/entity.store';
import { EventStore } from '../state/event.store';
import type { AnnotationEdit } from '../state/map.store';
import { TimelineStore } from '../state/timeline.store';
import { DateInputComponent } from '../timeline/date-input.component';

const WIDTH = 300;
const MARGIN = 12;
/** Altura mínima garantida: perto da borda de baixo, o editor sobe. */
const MIN_HEIGHT = 320;
/** Abaixo da barra superior e acima da linha do tempo. */
const TOP = 64;
const BOTTOM = 104;
const PREFIX = 'wd-annotation';

/** Vínculo do pino ou da região: entidade ou evento. */
export type AnnotationLink = { entityId: Uuid } | { eventId: Uuid };

/**
 * Editor de uma anotação (docs/06 §5), num popover junto dela: título (ou texto do
 * rótulo), cor, ícone do pino, tamanho do rótulo, linha e opacidade, vínculo a entidade
 * ou evento, validade no tempo ("A partir de", "Até") e excluir. Cada mudança é gravada
 * na hora (e entra no desfazer); o título, ao sair do campo ou com Enter. Esc fecha.
 */
@Component({
  selector: 'wd-annotation-editor',
  imports: [ButtonComponent, DateInputComponent, IconButtonComponent, IconComponent],
  template: `
    @if (shape(); as s) {
      <section
        class="editor wd-panel"
        role="dialog"
        [attr.aria-labelledby]="prefix + '-heading'"
        (keydown.escape)="onEscape($event)"
      >
        <header class="head">
          <h2 class="heading wd-inscription" [id]="prefix + '-heading'">
            {{ text.label(kinds[s.kind]) }}
          </h2>
          <button
            wd-icon-button
            type="button"
            icon="close"
            size="sm"
            tooltipPosition="below"
            [label]="text.close"
            (click)="closed.emit()"
          ></button>
        </header>

        @if (s.kind !== 'measure') {
          <label class="field">
            <span class="legend">{{ s.kind === 'label' ? text.text : text.title }}</span>
            <input
              #titleInput
              type="text"
              class="input"
              maxlength="160"
              [placeholder]="s.kind === 'label' ? text.textPlaceholder : ''"
              [value]="annotation().title ?? ''"
              (change)="setTitle($any($event.target).value)"
              (keydown.enter)="$any($event.target).blur()"
            />
          </label>

          <fieldset class="field">
            <legend class="legend">{{ optionText.color }}</legend>
            <div class="swatches">
              @for (ink of inks; track ink.id) {
                <label class="swatch" [style.--ink]="ink.hex">
                  <input
                    type="radio"
                    class="sr-only"
                    [name]="prefix + '-color'"
                    [checked]="s.color === ink.hex"
                    (change)="setShape({ color: ink.hex })"
                  />
                  <span class="dot" aria-hidden="true"></span>
                  <span class="sr-only">{{ colorNames[ink.id] }}</span>
                </label>
              }
            </div>
          </fieldset>
        }

        @if (s.kind === 'pin') {
          <fieldset class="field">
            <legend class="legend">{{ text.icon }}</legend>
            <div class="icons">
              @for (icon of icons; track icon) {
                <label class="choice icon-choice" [title]="iconNames[icon]">
                  <input
                    type="radio"
                    class="sr-only"
                    [name]="prefix + '-icon'"
                    [checked]="s.icon === icon"
                    (change)="setShape({ icon })"
                  />
                  <wd-icon [name]="icon" size="sm" />
                  <span class="sr-only">{{ iconNames[icon] }}</span>
                </label>
              }
            </div>
          </fieldset>
        }

        @if (s.kind === 'label') {
          <fieldset class="field">
            <legend class="legend">{{ text.size }}</legend>
            <div class="row">
              @for (size of sizes; track size) {
                <label class="choice">
                  <input
                    type="radio"
                    class="sr-only"
                    [name]="prefix + '-size'"
                    [checked]="s.size === size"
                    (change)="setShape({ size })"
                  />
                  <span class="choice-label">{{ text.sizes[size] }}</span>
                </label>
              }
            </div>
          </fieldset>
        }

        @if (s.kind === 'stroke') {
          <fieldset class="field">
            <legend class="legend">{{ optionText.line }}</legend>
            <div class="row">
              @for (dashed of [false, true]; track dashed) {
                <label class="choice">
                  <input
                    type="radio"
                    class="sr-only"
                    [name]="prefix + '-line'"
                    [checked]="s.dashed === dashed"
                    (change)="setShape({ dashed })"
                  />
                  <span class="choice-label">{{
                    dashed ? optionText.dashed : optionText.solid
                  }}</span>
                </label>
              }
            </div>
          </fieldset>
        }

        @if (s.kind === 'stroke' || s.kind === 'region') {
          <label class="field">
            <span class="legend">{{ optionText.opacity }}</span>
            <input
              type="range"
              class="range"
              min="10"
              max="100"
              step="10"
              [value]="opacity()"
              [attr.aria-valuetext]="opacity() + '%'"
              (change)="setShape({ opacity: +$any($event.target).value / 100 })"
            />
          </label>
        }

        @if (s.kind === 'pin' || s.kind === 'region') {
          <div class="field">
            <label class="legend" [for]="prefix + '-link'">{{ text.link }}</label>
            <div class="row">
              <select
                class="input"
                [id]="prefix + '-link'"
                [value]="linkValue()"
                (change)="setLink($any($event.target).value)"
              >
                <option value="">{{ text.noLink }}</option>
                <optgroup [label]="text.entities">
                  @for (entity of entityOptions(); track entity.id) {
                    <option
                      [value]="'e:' + entity.id"
                      [selected]="linkValue() === 'e:' + entity.id"
                    >
                      {{ entity.name }}
                    </option>
                  }
                </optgroup>
                <optgroup [label]="text.events">
                  @for (event of eventOptions(); track event.id) {
                    <option [value]="'v:' + event.id" [selected]="linkValue() === 'v:' + event.id">
                      {{ event.title }}
                    </option>
                  }
                </optgroup>
              </select>
              @if (link(); as l) {
                <button
                  wd-icon-button
                  type="button"
                  icon="open_in_full"
                  size="sm"
                  tooltipPosition="below"
                  [label]="text.openLink"
                  (click)="openLink.emit(l)"
                ></button>
              }
            </div>
          </div>
        }

        <fieldset class="field">
          <legend class="legend">{{ text.validity }}</legend>
          <label class="check">
            <input
              type="checkbox"
              [checked]="annotation().tickStart !== null"
              (change)="toggleStart($any($event.target).checked)"
            />
            {{ text.from }}
          </label>
          @if (annotation().tickStart !== null) {
            <wd-date-input
              tone="surface"
              [idPrefix]="prefix + '-start'"
              [label]="text.from"
              [calendar]="timeline.calendar()"
              [value]="annotation().tickStart ?? 0"
              (valueChange)="setRange($event, annotation().tickEnd)"
            />
          }
          <label class="check">
            <input
              type="checkbox"
              [checked]="annotation().tickEnd !== null"
              (change)="toggleEnd($any($event.target).checked)"
            />
            {{ text.until }}
          </label>
          @if (annotation().tickEnd !== null) {
            <wd-date-input
              tone="surface"
              [idPrefix]="prefix + '-end'"
              [label]="text.until"
              [calendar]="timeline.calendar()"
              [value]="annotation().tickEnd ?? 0"
              (valueChange)="setRange(annotation().tickStart, $event)"
            />
          }
          @if (rangeError()) {
            <p class="error" role="alert">{{ text.endBeforeStart }}</p>
          }
          @if (annotation().tickStart === null && annotation().tickEnd === null) {
            <p class="hint">{{ text.always }}</p>
          }
        </fieldset>

        <footer class="foot">
          <button wd-button type="button" variant="danger" size="sm" (click)="remove.emit()">
            <wd-icon name="delete" size="sm" />{{ text.remove }}
          </button>
        </footer>
      </section>
    }
  `,
  host: {
    '[style.left.px]': 'position().left',
    '[style.top.px]': 'position().top',
    '[style.--editor-max.px]': 'position().maxHeight',
  },
  styles: `
    :host {
      position: fixed;
      z-index: 25;
      display: block;
      inline-size: 300px;
    }

    .editor {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-block-size: var(--editor-max, calc(100dvh - 160px));
      padding: 10px 14px 12px;
      overflow-y: auto;
      animation: editor-in var(--wd-dur-base) var(--wd-ease-out);
    }

    .head {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }

    .heading {
      font-size: 0.8125rem;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-inline-size: 0;
    }

    .legend {
      padding: 0;
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .input {
      inline-size: 100%;
      min-inline-size: 0;
      padding: 6px 10px;
      font-family: var(--font-sans);
      font-size: 0.9375rem;
      color: var(--wd-text-on-surface);
      background: var(--wd-surface-active);
      border: 1px solid var(--wd-rule);
      border-radius: var(--wd-radius-control);
    }

    .input:focus-visible,
    .range:focus-visible,
    .check input:focus-visible {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: 1px;
    }

    .row {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .swatch {
      --ink: transparent;

      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      cursor: pointer;
      border: 2px solid transparent;
      border-radius: 999px;
    }

    .swatch:has(:checked) {
      border-color: var(--wd-accent);
    }

    .dot {
      inline-size: 20px;
      block-size: 20px;
      background: var(--ink);
      border: 1px solid var(--wd-divider);
      border-radius: 999px;
    }

    .icons {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }

    .choice {
      display: grid;
      flex: 1;
      place-items: center;
      min-block-size: 32px;
      padding: 4px;
      color: var(--wd-text-on-surface);
      cursor: pointer;
      border: 1px solid var(--wd-divider);
      border-radius: var(--wd-radius-control);
    }

    .choice:has(:checked) {
      color: var(--wd-accent);
      border-color: var(--wd-accent);
      box-shadow: inset 0 0 0 1px var(--wd-accent);
    }

    .swatch:has(:focus-visible),
    .choice:has(:focus-visible) {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: 2px;
    }

    .choice-label {
      font-family: var(--font-sans);
      font-size: 0.8125rem;
    }

    .range {
      inline-size: 100%;
      accent-color: var(--wd-accent);
    }

    .check {
      display: flex;
      gap: 8px;
      align-items: center;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-on-surface);
    }

    .check input {
      accent-color: var(--wd-accent);
    }

    .hint {
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      color: var(--wd-text-muted);
    }

    .error {
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      color: var(--wd-danger);
    }

    .foot {
      display: flex;
      justify-content: flex-end;
      padding-block-start: 8px;
      border-block-start: 1px solid var(--wd-divider);
    }

    @keyframes editor-in {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .editor {
        animation: none;
      }
    }
  `,
})
export class AnnotationEditorComponent {
  readonly annotation = input.required<MapAnnotation>();
  /** Ponto da anotação na tela, em coordenadas da janela. */
  readonly anchor = input.required<Point>();
  /** Foco no primeiro campo ao abrir (criação e clique; não ao reabrir pela lista). */
  readonly autofocus = input(true);

  readonly edit = output<AnnotationEdit>();
  readonly remove = output();
  readonly closed = output();
  readonly openLink = output<AnnotationLink>();

  protected readonly text = MAP_STRINGS.annotations.editor;
  protected readonly optionText = MAP_STRINGS.annotations.options;
  protected readonly kinds = MAP_STRINGS.annotations.kinds;
  protected readonly colorNames = MAP_STRINGS.annotations.colors;
  protected readonly iconNames = MAP_STRINGS.annotations.icons;
  protected readonly inks = ANNOTATION_INK_COLORS;
  protected readonly icons = PIN_ICONS;
  protected readonly sizes = LABEL_SIZES;
  protected readonly prefix = PREFIX;
  protected readonly timeline = inject(TimelineStore);
  private readonly entities = inject(EntityStore);
  private readonly events = inject(EventStore);
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly annotationId = computed(() => this.annotation().id);
  protected readonly shape = computed(() => readAnnotation(this.annotation()));
  protected readonly rangeError = signal(false);
  protected readonly opacity = computed(() => {
    const shape = this.shape();
    const opacity = shape && 'opacity' in shape ? shape.opacity : 1;
    return Math.round(opacity * 100);
  });
  protected readonly link = computed<AnnotationLink | null>(() => {
    const { entityId, eventId } = this.annotation();
    if (entityId) return { entityId };
    if (eventId) return { eventId };
    return null;
  });
  protected readonly linkValue = computed(() => {
    const { entityId, eventId } = this.annotation();
    if (entityId) return `e:${entityId}`;
    if (eventId) return `v:${eventId}`;
    return '';
  });
  protected readonly entityOptions = computed(() =>
    [...this.entities.entities()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  );
  protected readonly eventOptions = computed(() => this.events.sorted());

  /** Ao lado direito do ponto, sem sair da janela. */
  protected readonly position = computed(() => {
    const { x, y } = this.anchor();
    const width = globalThis.innerWidth || WIDTH * 3;
    const height = globalThis.innerHeight || 900;
    const right = x + 24 + WIDTH + MARGIN <= width;
    const left = right ? x + 24 : x - 24 - WIDTH;
    const top = Math.max(TOP, Math.min(y - 60, height - BOTTOM - MIN_HEIGHT));
    return {
      left: Math.min(Math.max(left, MARGIN), width - WIDTH - MARGIN),
      top,
      maxHeight: Math.max(160, height - BOTTOM - top),
    };
  });

  constructor() {
    const injector = inject(Injector);
    // Ao abrir outra anotação: foco no primeiro campo (se pedido) e sem erro de validade.
    effect(() => {
      this.annotationId();
      this.rangeError.set(false);
      if (!untracked(this.autofocus)) return;
      afterNextRender(
        () => {
          const target =
            this.titleInput()?.nativeElement ??
            this.host.nativeElement.querySelector<HTMLElement>('input, select, button');
          target?.focus({ preventScroll: true });
        },
        { injector },
      );
    });
  }

  protected setTitle(value: string): void {
    const title = value.trim() || null;
    if (title !== this.annotation().title) this.edit.emit({ title });
  }

  protected setShape(change: Partial<AnnotationShape>): void {
    const shape = this.shape();
    if (shape) this.edit.emit({ shape: { ...shape, ...change } as AnnotationShape });
  }

  protected setLink(value: string): void {
    const id = value.slice(2);
    this.edit.emit({
      entityId: value.startsWith('e:') ? id : null,
      eventId: value.startsWith('v:') ? id : null,
    });
  }

  protected toggleStart(on: boolean): void {
    const end = this.annotation().tickEnd;
    const now = this.timeline.currentTick();
    this.setRange(on ? (end !== null ? Math.min(now, end) : now) : null, end);
  }

  protected toggleEnd(on: boolean): void {
    const start = this.annotation().tickStart;
    const now = this.timeline.currentTick();
    this.setRange(start, on ? (start !== null ? Math.max(now, start) : now) : null);
  }

  protected setRange(tickStart: Tick | null, tickEnd: Tick | null): void {
    const invalid = tickStart !== null && tickEnd !== null && tickEnd < tickStart;
    this.rangeError.set(invalid);
    if (!invalid) this.edit.emit({ tickStart, tickEnd });
  }

  protected onEscape(event: Event): void {
    event.stopPropagation();
    this.closed.emit();
  }
}
