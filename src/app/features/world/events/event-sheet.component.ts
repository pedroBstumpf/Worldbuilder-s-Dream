import {
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { ENTITY_STRINGS } from '@core/strings/entity.strings';
import { TIME_STRINGS } from '@core/strings/time.strings';
import { ENTITY_INK_COLORS } from '@domain/entities';
import { EVENT_CATEGORIES, eventCategory, eventColor } from '@domain/events';
import type { RichTextDoc, Tick, Uuid } from '@domain/models';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TabsComponent, tabId, tabPanelId, type TabItem } from '@shared/ui/tabs/tabs.component';
import {
  RichTextEditorComponent,
  type MentionCandidate,
} from '../entities/editor/rich-text-editor.component';
import { EntityAvatarComponent } from '../entities/entity-avatar.component';
import { EntityStore } from '../state/entity.store';
import { EVENT_TITLE_MAX, EventStore } from '../state/event.store';
import { TimelineStore } from '../state/timeline.store';
import { DateInputComponent } from '../timeline/date-input.component';

type SheetTab = 'summary' | 'text';

const PREFIX = 'wd-event-sheet';
/** Pausa na digitação antes de perguntar sobre a faixa do mundo. */
const RANGE_CHECK_DELAY_MS = 1200;

/** Situação do evento no mapa aberto (`null`: nenhum mapa aberto). */
export interface EventPlacement {
  readonly mapName: string;
  readonly placed: boolean;
}

/** Datas do evento fora da faixa do mundo. */
export interface EventRange {
  readonly start: Tick;
  readonly end: Tick;
}

/**
 * Ficha do evento (docs/06 §4): a mesma página de pergaminho da ficha de entidade, com
 * título, datas no calendário do mundo, categoria, local, cor do marcador, posição no
 * mapa aberto e o texto (Tiptap, com menções). Toda edição é gravada pela `EventStore`.
 */
@Component({
  selector: 'wd-event-sheet',
  imports: [
    DateInputComponent,
    EntityAvatarComponent,
    IconButtonComponent,
    IconComponent,
    RichTextEditorComponent,
    TabsComponent,
  ],
  template: `
    @if (event(); as event) {
      <section
        class="sheet wd-page"
        role="region"
        [attr.aria-label]="text.label(event.title)"
        (keydown.escape)="onEscape($event)"
      >
        <header class="head">
          <span class="emblem">
            <wd-entity-avatar kind="event" [color]="color()" [size]="56" />
          </span>
          <div class="titles">
            <p class="kind wd-inscription">
              {{ strings.kind }} · {{ categoryName() }}
              @if (status(); as status) {
                <span class="status" role="status" [attr.data-status]="status">
                  · {{ sheetText.status[status] }}
                </span>
              }
            </p>
            <label class="sr-only" [for]="prefix + '-title'">{{ text.title }}</label>
            <input
              #titleField
              class="name"
              type="text"
              autocomplete="off"
              [id]="prefix + '-title'"
              [value]="event.title"
              [attr.maxlength]="titleMax"
              [attr.aria-invalid]="titleError() ? 'true' : null"
              [attr.aria-describedby]="titleError() ? prefix + '-title-error' : null"
              (input)="retitle($any($event.target).value)"
              (blur)="restoreTitle($any($event.target))"
            />
            @if (titleError()) {
              <p class="error" [id]="prefix + '-title-error'">{{ strings.create.required }}</p>
            }
          </div>
          <button
            wd-icon-button
            type="button"
            icon="close"
            class="close"
            tooltipPosition="left"
            [label]="sheetText.close"
            (click)="closed.emit()"
          ></button>
        </header>

        <wd-tabs
          [idPrefix]="prefix"
          [label]="sheetText.tabsLabel"
          [tabs]="tabs"
          [selected]="tab()"
          (selectedChange)="tab.set($any($event))"
        />

        <div
          class="body"
          role="tabpanel"
          tabindex="-1"
          [id]="panelId()"
          [attr.aria-labelledby]="tabLabelId()"
        >
          @if (tab() === 'summary') {
            <div class="fields">
              <wd-date-input
                [idPrefix]="prefix + '-start'"
                [label]="text.start"
                [calendar]="timeline.calendar()"
                [value]="event.tickStart"
                (valueChange)="setStart($event)"
              />
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="event.tickEnd !== null"
                  (change)="toggleEnd($any($event.target).checked)"
                />
                {{ text.hasEnd }}
              </label>
              @if (event.tickEnd !== null) {
                <wd-date-input
                  [idPrefix]="prefix + '-end'"
                  [label]="text.end"
                  [calendar]="timeline.calendar()"
                  [value]="event.tickEnd"
                  (valueChange)="setEnd($event)"
                />
                @if (endError()) {
                  <p class="error" role="alert">{{ text.endBeforeStart }}</p>
                }
              }
              <button type="button" class="link wd-focus" (click)="goTo.emit(event.tickStart)">
                {{ text.goTo }}
              </button>

              <div class="field">
                <label class="field-label" [for]="prefix + '-category'">{{ text.category }}</label>
                <select
                  class="input"
                  [id]="prefix + '-category'"
                  (change)="store.edit(event.id, { category: $any($event.target).value })"
                >
                  @for (category of categories(); track category) {
                    <option [value]="category" [selected]="category === event.category">
                      {{ categoryLabel(category) }}
                    </option>
                  }
                </select>
              </div>

              <div class="field">
                <label class="field-label" [for]="prefix + '-location'">{{ text.location }}</label>
                <select
                  class="input"
                  [id]="prefix + '-location'"
                  [attr.aria-describedby]="prefix + '-location-hint'"
                  (change)="setLocation($any($event.target).value)"
                >
                  <option value="" [selected]="event.locationEntityId === null">
                    {{ text.noLocation }}
                  </option>
                  @for (location of locations(); track location.id) {
                    <option
                      [value]="location.id"
                      [selected]="location.id === event.locationEntityId"
                    >
                      {{ location.name }}
                    </option>
                  }
                </select>
                <p class="hint" [id]="prefix + '-location-hint'">{{ text.locationHint }}</p>
              </div>

              <section class="field" [attr.aria-labelledby]="prefix + '-map'">
                <h3 class="field-label" [id]="prefix + '-map'">{{ text.onMap }}</h3>
                @if (placement(); as placement) {
                  <p class="hint">
                    {{ placement.placed ? text.placedOnMap(placement.mapName) : text.notOnMap }}
                  </p>
                  <div class="actions">
                    @if (placement.placed) {
                      <button
                        type="button"
                        class="action wd-focus"
                        (click)="showOnMap.emit(event.id)"
                      >
                        <wd-icon name="my_location" size="sm" />
                        {{ text.show }}
                      </button>
                      <button type="button" class="action wd-focus" (click)="place.emit(event.id)">
                        <wd-icon name="edit_location_alt" size="sm" />
                        {{ text.move }}
                      </button>
                      <button
                        type="button"
                        class="action wd-focus"
                        (click)="unplace.emit(event.id)"
                      >
                        <wd-icon name="wrong_location" size="sm" />
                        {{ text.unplace }}
                      </button>
                    } @else {
                      <button type="button" class="action wd-focus" (click)="place.emit(event.id)">
                        <wd-icon name="add_location_alt" size="sm" />
                        {{ text.place }}
                      </button>
                    }
                  </div>
                } @else {
                  <p class="hint">{{ text.noMap }}</p>
                }
              </section>

              <fieldset class="field">
                <legend class="field-label">{{ text.color }}</legend>
                <div class="swatches">
                  <label
                    class="swatch"
                    data-default
                    [style.--ink]="categoryColor() ?? 'var(--ouro-300)'"
                  >
                    <input
                      type="radio"
                      class="sr-only"
                      [name]="prefix + '-color'"
                      [checked]="event.color === null"
                      (change)="store.edit(event.id, { color: null })"
                    />
                    <span class="dot" aria-hidden="true"></span>
                    <span class="sr-only">{{ text.defaultColor }}</span>
                  </label>
                  @for (ink of inks; track ink.id) {
                    <label class="swatch" [style.--ink]="ink.hex">
                      <input
                        type="radio"
                        class="sr-only"
                        [name]="prefix + '-color'"
                        [checked]="event.color === ink.hex"
                        (change)="store.edit(event.id, { color: ink.hex })"
                      />
                      <span class="dot" aria-hidden="true"></span>
                      <span class="sr-only">{{ colorNames[ink.id] }}</span>
                    </label>
                  }
                </div>
              </fieldset>

              <button type="button" class="trash wd-focus" (click)="trash.emit(event.id)">
                <wd-icon name="delete" size="sm" />
                {{ text.trash }}
              </button>
            </div>
          } @else {
            @defer (on immediate) {
              <wd-rich-text-editor
                class="editor"
                [content]="event.content"
                [label]="editorText.textLabel(event.title)"
                [candidates]="candidates()"
                [save]="saveText()"
                (openMention)="openEntity.emit($event)"
              />
            } @placeholder {
              <p class="hint" role="status">{{ editorText.loading }}</p>
            }
          }
        </div>
      </section>
    }
  `,
  styleUrl: '../entities/sheet.css',
  styles: `
    .emblem {
      display: grid;
      place-items: center;
      inline-size: 72px;
      block-size: 72px;
      border: 1px solid var(--pergaminho-300);
      border-radius: 12px;
    }

    .check {
      display: flex;
      gap: 8px;
      align-items: center;
      font-family: var(--font-sans);
      font-size: 0.875rem;
    }

    .check input {
      accent-color: var(--couro-700);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .action {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 5px 10px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-on-page);
      cursor: pointer;
      background: var(--wd-page-muted);
      border: 1px solid var(--pergaminho-300);
      border-radius: var(--wd-radius-control);
    }

    .action:hover {
      border-color: var(--couro-600);
    }
  `,
})
export class EventSheetComponent {
  readonly eventId = input.required<Uuid>();
  /** Situação no mapa aberto; `null` sem mapa. */
  readonly placement = input<EventPlacement | null>(null);

  readonly closed = output();
  readonly trash = output<Uuid>();
  readonly openEntity = output<Uuid>();
  /** "Ir para esta data": move o cursor da linha do tempo. */
  readonly goTo = output<Tick>();
  /** "Marcar no mapa" ou "Mudar o ponto". */
  readonly place = output<Uuid>();
  readonly unplace = output<Uuid>();
  readonly showOnMap = output<Uuid>();
  /** As datas caíram fora da faixa do mundo. */
  readonly outOfRange = output<EventRange>();

  protected readonly store = inject(EventStore);
  protected readonly timeline = inject(TimelineStore);
  private readonly entities = inject(EntityStore);

  protected readonly strings = TIME_STRINGS.events;
  protected readonly text = TIME_STRINGS.events.sheet;
  protected readonly sheetText = ENTITY_STRINGS.sheet;
  protected readonly editorText = ENTITY_STRINGS.editor;
  protected readonly colorNames = ENTITY_STRINGS.colors;
  protected readonly inks = ENTITY_INK_COLORS;
  protected readonly titleMax = EVENT_TITLE_MAX;
  protected readonly prefix = PREFIX;
  protected readonly tabs: readonly TabItem[] = [
    { id: 'summary', label: this.sheetText.tabs.summary },
    { id: 'text', label: this.sheetText.tabs.text },
  ];

  protected readonly tab = linkedSignal<Uuid, SheetTab>({
    source: this.eventId,
    computation: () => 'summary',
  });
  protected readonly titleError = linkedSignal<Uuid, boolean>({
    source: this.eventId,
    computation: () => false,
  });
  protected readonly endError = linkedSignal<Uuid, boolean>({
    source: this.eventId,
    computation: () => false,
  });

  protected readonly event = computed(() => this.store.byId().get(this.eventId()) ?? null);
  protected readonly status = computed(() => this.store.saveStatus()[this.eventId()] ?? null);
  protected readonly panelId = computed(() => tabPanelId(PREFIX, this.tab()));
  protected readonly tabLabelId = computed(() => tabId(PREFIX, this.tab()));
  protected readonly color = computed(() => {
    const event = this.event();
    return event ? eventColor(event) : null;
  });
  protected readonly categoryColor = computed(
    () => eventCategory(this.event()?.category ?? '')?.color ?? null,
  );
  protected readonly categoryName = computed(() =>
    this.categoryLabel(this.event()?.category ?? ''),
  );
  /** Categorias sugeridas, mais a do evento se for uma livre (de importação, por exemplo). */
  protected readonly categories = computed(() => {
    const ids = EVENT_CATEGORIES.map((category) => category.id);
    const current = this.event()?.category;
    return current && !ids.includes(current) ? [...ids, current] : ids;
  });
  protected readonly locations = computed(() =>
    this.entities.sorted().filter((entity) => entity.kind === 'location'),
  );
  protected readonly candidates = computed<MentionCandidate[]>(() =>
    this.entities.sorted().map((entity) => ({
      id: entity.id,
      label: entity.name,
      kind: entity.kind,
      aliases: entity.aliases,
    })),
  );
  protected readonly saveText = computed(() => {
    const id = this.eventId();
    return (doc: RichTextDoc) => this.store.editContent(id, doc);
  });

  private readonly titleField = viewChild<ElementRef<HTMLInputElement>>('titleField');
  private rangeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.rangeTimer) clearTimeout(this.rangeTimer);
    });
  }

  /** Foco no título (ficha recém-criada). */
  focusTitle(select = false): void {
    const field = this.titleField()?.nativeElement;
    field?.focus();
    if (select) field?.select();
  }

  protected categoryLabel(id: string): string {
    return this.strings.categories[id] ?? id;
  }

  protected retitle(value: string): void {
    const title = value.replace(/\s+/g, ' ').trim();
    this.titleError.set(!title);
    if (title) this.store.edit(this.eventId(), { title });
  }

  protected restoreTitle(field: HTMLInputElement): void {
    if (!field.value.trim()) field.value = this.event()?.title ?? '';
    this.titleError.set(false);
  }

  protected setStart(tick: Tick): void {
    const event = this.event();
    if (!event) return;
    // Mover o início leva o fim junto (a duração se mantém).
    const end = event.tickEnd === null ? null : event.tickEnd + (tick - event.tickStart);
    this.store.setDates(event.id, tick, end);
    this.endError.set(false);
    this.checkRange();
  }

  protected setEnd(tick: Tick): void {
    const event = this.event();
    if (!event) return;
    if (tick < event.tickStart) {
      this.endError.set(true);
      return;
    }
    this.endError.set(false);
    this.store.setDates(event.id, event.tickStart, tick);
    this.checkRange();
  }

  protected toggleEnd(on: boolean): void {
    const event = this.event();
    if (!event) return;
    const end = on ? this.timeline.calendar().add('day', 1, event.tickStart) : null;
    this.store.setDates(event.id, event.tickStart, end);
    this.endError.set(false);
    if (end !== null) this.checkRange();
  }

  protected setLocation(id: string): void {
    this.store.edit(this.eventId(), { locationEntityId: id || null });
  }

  protected onEscape(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    this.closed.emit();
  }

  /**
   * Datas fora da faixa do mundo: pergunta depois de uma pausa, para não interromper quem
   * ainda está digitando o ano (cada dígito já é uma data válida).
   */
  private checkRange(): void {
    if (this.rangeTimer) clearTimeout(this.rangeTimer);
    this.rangeTimer = setTimeout(() => {
      this.rangeTimer = null;
      const event = this.event();
      if (!event) return;
      const range = this.timeline.range();
      const end = event.tickEnd ?? event.tickStart;
      if (event.tickStart < range.start || end > range.end) {
        this.outOfRange.emit({ start: event.tickStart, end });
      }
    }, RANGE_CHECK_DELAY_MS);
  }
}
