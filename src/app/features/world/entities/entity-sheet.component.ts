import {
  Component,
  computed,
  DOCUMENT,
  effect,
  type ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { ENTITY_KIND_STRINGS, ENTITY_STRINGS } from '@core/strings/entity.strings';
import { ENTITY_INK_COLORS } from '@domain/entities';
import { ENTITY_KINDS, type EntityKind, type RichTextDoc, type Uuid } from '@domain/models';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TabsComponent, tabId, tabPanelId, type TabItem } from '@shared/ui/tabs/tabs.component';
import { ToastService } from '@shared/ui/toast/toast.service';
import { pickImageFile } from '../import/pick-image-file';
import { EntityStore } from '../state/entity.store';
import { ENTITY_NAME_MAX } from './create-entity-dialog.component';
import {
  RichTextEditorComponent,
  type MentionCandidate,
} from './editor/rich-text-editor.component';
import { EntityAvatarComponent } from './entity-avatar.component';
import { EntityMapSectionComponent } from './entity-map-section.component';
import { LabelInputComponent } from './label-input.component';
import { readPortrait } from './read-portrait';

type SheetTab = 'summary' | 'text';

const PREFIX = 'wd-sheet';

/**
 * Ficha da entidade (docs/05 › Padrões de UI): página de pergaminho que desliza sobre o
 * Explorar, com retrato emoldurado e as abas Resumo e Texto. Toda edição é gravada
 * sozinha pela `EntityStore`; o status ("Salvando…", "Salvo") fica no cabeçalho.
 */
@Component({
  selector: 'wd-entity-sheet',
  imports: [
    EntityMapSectionComponent,
    EntityAvatarComponent,
    IconButtonComponent,
    IconComponent,
    LabelInputComponent,
    RichTextEditorComponent,
    TabsComponent,
  ],
  template: `
    @if (entity(); as entity) {
      <section
        class="sheet wd-page"
        role="region"
        [attr.aria-label]="text.label(entity.name)"
        (keydown.escape)="onEscape($event)"
      >
        <header class="head">
          <button
            type="button"
            class="portrait wd-focus"
            [attr.aria-label]="entity.portraitAssetId ? text.changePortrait : text.choosePortrait"
            [disabled]="portraitBusy()"
            (click)="choosePortrait()"
          >
            <wd-entity-avatar
              [kind]="entity.kind"
              [name]="entity.name"
              [color]="entity.color"
              [portraitUrl]="portraitUrl()"
              [size]="88"
            />
            <span class="badge" aria-hidden="true"><wd-icon name="photo_camera" size="sm" /></span>
          </button>
          <div class="titles">
            <p class="kind wd-inscription">
              {{ kindNames[entity.kind].one }}
              @if (status(); as status) {
                <span class="status" role="status" [attr.data-status]="status">
                  · {{ text.status[status] }}
                </span>
              }
            </p>
            <label class="sr-only" [for]="prefix + '-name'">{{ text.name }}</label>
            <input
              #nameField
              class="name"
              type="text"
              autocomplete="off"
              [id]="prefix + '-name'"
              [value]="entity.name"
              [attr.maxlength]="nameMax"
              [attr.aria-invalid]="nameError() ? 'true' : null"
              [attr.aria-describedby]="nameError() ? prefix + '-name-error' : null"
              (input)="rename($any($event.target).value)"
              (blur)="restoreName($any($event.target))"
            />
            @if (nameError()) {
              <p class="error" [id]="prefix + '-name-error'">{{ text.nameRequired }}</p>
            }
          </div>
          <button
            wd-icon-button
            type="button"
            icon="close"
            class="close"
            tooltipPosition="left"
            [label]="text.close"
            (click)="closed.emit()"
          ></button>
        </header>

        <wd-tabs
          [idPrefix]="prefix"
          [label]="text.tabsLabel"
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
              <div class="field">
                <label class="field-label" [for]="prefix + '-subtitle'">{{ text.subtitle }}</label>
                <input
                  type="text"
                  autocomplete="off"
                  maxlength="200"
                  class="input"
                  [id]="prefix + '-subtitle'"
                  [value]="entity.subtitle ?? ''"
                  [attr.aria-describedby]="prefix + '-subtitle-hint'"
                  (input)="setSubtitle($any($event.target).value)"
                />
                <p class="hint" [id]="prefix + '-subtitle-hint'">{{ text.subtitleHint }}</p>
              </div>

              <div class="field">
                <label class="field-label" [for]="prefix + '-kind'">{{ text.kind }}</label>
                <select
                  class="input"
                  [id]="prefix + '-kind'"
                  [value]="entity.kind"
                  (change)="setKind($any($event.target).value)"
                >
                  @for (kind of kinds; track kind) {
                    <option [value]="kind" [selected]="kind === entity.kind">
                      {{ kindNames[kind].one }}
                    </option>
                  }
                </select>
              </div>

              <fieldset class="field">
                <legend class="field-label">{{ text.color }}</legend>
                <div class="swatches">
                  <label class="swatch" [attr.data-default]="''">
                    <input
                      type="radio"
                      class="sr-only"
                      [name]="prefix + '-color'"
                      [checked]="entity.color === null"
                      (change)="setColor(null)"
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
                        [checked]="entity.color === ink.hex"
                        (change)="setColor(ink.hex)"
                      />
                      <span class="dot" aria-hidden="true"></span>
                      <span class="sr-only">{{ colorNames[ink.id] }}</span>
                    </label>
                  }
                </div>
              </fieldset>

              <wd-label-input
                [fieldId]="prefix + '-aliases'"
                [label]="text.aliases"
                [hint]="text.aliasesHint"
                [values]="entity.aliases"
                [exclude]="entity.name"
                (valuesChange)="store.edit(entity.id, { aliases: $event })"
              />
              <wd-label-input
                [fieldId]="prefix + '-tags'"
                [label]="text.tags"
                [hint]="text.tagsHint"
                [values]="entity.tags"
                (valuesChange)="store.edit(entity.id, { tags: $event })"
              />

              @if (entity.portraitAssetId) {
                <button type="button" class="link wd-focus" (click)="removePortrait()">
                  {{ text.removePortrait }}
                </button>
              }

              <wd-entity-map-section
                [entityId]="entity.id"
                [prefix]="prefix"
                (place)="placeOnMap.emit($event)"
                (show)="showOnMap.emit($event)"
              />

              <section class="field" [attr.aria-labelledby]="prefix + '-cited'">
                <h3 class="field-label" [id]="prefix + '-cited'">{{ text.citedIn }}</h3>
                @if (citations.value(); as list) {
                  @if (list.length === 0) {
                    <p class="hint">{{ text.notCited }}</p>
                  } @else {
                    <ul class="citations">
                      @for (citation of list; track citation.id) {
                        <li>
                          @if (citation.kind === 'entity') {
                            <button
                              type="button"
                              class="citation wd-focus"
                              (click)="openEntity.emit(citation.id)"
                            >
                              <wd-entity-avatar
                                [kind]="citation.entityKind ?? 'note'"
                                [name]="citation.title"
                                [size]="24"
                              />
                              {{ citation.title }}
                            </button>
                          } @else {
                            <span class="citation">
                              <wd-entity-avatar kind="event" [size]="24" />
                              {{ citation.title }}
                            </span>
                          }
                        </li>
                      }
                    </ul>
                  }
                }
              </section>

              <button type="button" class="trash wd-focus" (click)="trash.emit(entity.id)">
                <wd-icon name="delete" size="sm" />
                {{ text.trash }}
              </button>
            </div>
          } @else {
            @defer (on immediate) {
              <wd-rich-text-editor
                class="editor"
                [content]="entity.content"
                [label]="editorText.textLabel(entity.name)"
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
  styleUrl: './sheet.css',
  styles: `
    .portrait {
      position: relative;
      padding: 3px;
      cursor: pointer;
      background: none;
      border: 1px solid var(--pergaminho-300);
      border-radius: 12px;
    }

    .badge {
      position: absolute;
      inset-block-end: -4px;
      inset-inline-end: -4px;
      display: grid;
      place-items: center;
      inline-size: 26px;
      block-size: 26px;
      color: var(--pergaminho-50);
      background: var(--couro-700);
      border-radius: 999px;
    }

    .swatch[data-default] .dot {
      background: conic-gradient(
        var(--ouro-400) 0 25%,
        var(--bronze) 0 50%,
        var(--cobre) 0 75%,
        var(--latao) 0
      );
    }

    .citations {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .citation {
      display: flex;
      gap: 8px;
      align-items: center;
      inline-size: 100%;
      padding: 4px 6px;
      font-family: var(--font-book);
      font-size: 1rem;
      color: var(--wd-text-on-page);
      text-align: start;
      background: none;
      border: 0;
      border-radius: var(--wd-radius-control);
    }

    button.citation {
      cursor: pointer;
    }

    button.citation:hover {
      background: var(--pergaminho-200);
    }
  `,
})
export class EntitySheetComponent {
  readonly entityId = input.required<Uuid>();

  readonly closed = output();
  readonly trash = output<Uuid>();
  readonly openEntity = output<Uuid>();
  /** "Marcar posição" no mapa aberto (o id é da entidade). */
  readonly placeOnMap = output<Uuid>();
  /** "Mostrar no mapa" (o id é do token). */
  readonly showOnMap = output<Uuid>();

  protected readonly store = inject(EntityStore);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  protected readonly text = ENTITY_STRINGS.sheet;
  protected readonly editorText = ENTITY_STRINGS.editor;
  protected readonly colorNames = ENTITY_STRINGS.colors;
  protected readonly kindNames = ENTITY_KIND_STRINGS;
  protected readonly kinds = ENTITY_KINDS;
  protected readonly inks = ENTITY_INK_COLORS;
  protected readonly nameMax = ENTITY_NAME_MAX;
  protected readonly prefix = PREFIX;
  protected readonly tabs: readonly TabItem[] = [
    { id: 'summary', label: this.text.tabs.summary },
    { id: 'text', label: this.text.tabs.text },
  ];

  /** Ao trocar de entidade, a ficha volta ao Resumo (o editor é recriado ao abrir o Texto). */
  protected readonly tab = linkedSignal<Uuid, SheetTab>({
    source: this.entityId,
    computation: () => 'summary',
  });
  protected readonly nameError = linkedSignal<Uuid, boolean>({
    source: this.entityId,
    computation: () => false,
  });
  protected readonly portraitBusy = signal(false);

  protected readonly entity = computed(() => this.store.byId().get(this.entityId()) ?? null);
  protected readonly status = computed(() => this.store.saveStatus()[this.entityId()] ?? null);
  protected readonly panelId = computed(() => tabPanelId(PREFIX, this.tab()));
  protected readonly tabLabelId = computed(() => tabId(PREFIX, this.tab()));
  protected readonly portraitUrl = computed(() => {
    const assetId = this.entity()?.portraitAssetId;
    return assetId ? (this.store.portraits()[assetId] ?? null) : null;
  });
  protected readonly candidates = computed<MentionCandidate[]>(() =>
    this.store
      .sorted()
      .filter((entity) => entity.id !== this.entityId())
      .map((entity) => ({
        id: entity.id,
        label: entity.name,
        kind: entity.kind,
        aliases: entity.aliases,
      })),
  );
  /** "Citada em": relido quando a ficha muda de entidade ou o texto de alguém é salvo. */
  protected readonly citations = resource({
    params: () => ({ id: this.entityId(), entities: this.store.entities() }),
    loader: ({ params }) => this.store.citations(params.id),
  });

  /**
   * Gravação do texto presa à entidade: o editor guarda a função ao ser criado e a chama
   * também ao ser destruído, quando a ficha já pode mostrar outra entidade.
   */
  protected readonly saveText = computed(() => {
    const id = this.entityId();
    return (doc: RichTextDoc) => this.store.editContent(id, doc);
  });

  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');

  constructor() {
    effect(() => {
      const assetId = this.entity()?.portraitAssetId;
      if (assetId) void this.store.loadPortrait(assetId);
    });
  }

  /** Foco no nome (ficha recém-aberta). */
  focusName(select = false): void {
    const field = this.nameField()?.nativeElement;
    field?.focus();
    if (select) field?.select();
  }

  protected rename(value: string): void {
    const name = value.replace(/\s+/g, ' ').trim();
    this.nameError.set(!name);
    if (name) this.store.edit(this.entityId(), { name });
  }

  protected restoreName(field: HTMLInputElement): void {
    if (!field.value.trim()) field.value = this.entity()?.name ?? '';
    this.nameError.set(false);
  }

  protected setSubtitle(value: string): void {
    this.store.edit(this.entityId(), { subtitle: value.trim() ? value : null });
  }

  protected setKind(kind: EntityKind): void {
    if (ENTITY_KINDS.includes(kind)) this.store.edit(this.entityId(), { kind });
  }

  protected setColor(color: string | null): void {
    this.store.edit(this.entityId(), { color });
  }

  protected async choosePortrait(): Promise<void> {
    const file = await pickImageFile(this.document);
    if (!file) return;
    this.portraitBusy.set(true);
    try {
      const portrait = await readPortrait(file);
      await this.store.setPortrait(this.entityId(), portrait.image, portrait.size);
      const assetId = this.entity()?.portraitAssetId;
      if (assetId) await this.store.loadPortrait(assetId);
    } catch {
      this.toasts.show({ message: this.text.portraitFailed, kind: 'error' });
    } finally {
      this.portraitBusy.set(false);
    }
  }

  protected async removePortrait(): Promise<void> {
    try {
      await this.store.removePortrait(this.entityId());
    } catch {
      this.toasts.show({ message: this.text.saveFailed, kind: 'error' });
    }
  }

  protected onEscape(event: Event): void {
    // A lista de menções do editor trata o próprio Esc (e cancela o evento).
    if (event.defaultPrevented) return;
    event.preventDefault();
    this.closed.emit();
  }
}
