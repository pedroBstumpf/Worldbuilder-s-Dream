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
  styles: `
    :host {
      position: fixed;
      inset-block: 64px 12px;
      inset-inline-end: 12px;
      z-index: 10;
      display: block;
      inline-size: min(var(--sheet-width, 440px), calc(100vw - 24px));
      animation: slide-in var(--wd-dur-base) var(--wd-ease-out);
    }

    .sheet {
      display: flex;
      flex-direction: column;
      gap: 10px;
      block-size: 100%;
      padding: 16px 16px 12px;
      overflow: hidden;
      border: 1px solid var(--wd-rule-strong);
      border-radius: var(--wd-radius-panel);
      box-shadow: var(--wd-shadow-panel);
    }

    .head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 14px;
      align-items: center;
    }

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

    .titles {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-inline-size: 0;
    }

    .kind {
      font-size: 0.75rem;
      color: var(--wd-text-on-page-muted);
    }

    .status {
      font-family: var(--font-sans);
      text-transform: none;
      letter-spacing: 0;
    }

    .status[data-status='failed'] {
      color: var(--wd-danger-on-page);
    }

    .name {
      inline-size: 100%;
      padding: 2px 4px;
      margin-inline-start: -4px;
      font-family: var(--font-book);
      font-size: 1.75rem;
      line-height: 1.15;
      color: var(--wd-text-on-page);
      background: none;
      border: 1px solid transparent;
      border-radius: var(--wd-radius-control);
    }

    .name:hover {
      border-color: var(--pergaminho-300);
    }

    .name:focus-visible {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: 0;
    }

    .close {
      align-self: start;
    }

    .error {
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-danger-on-page);
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-block-size: 0;
      padding-inline-end: 4px;
      margin-inline-end: -4px;
      overflow-y: auto;
      outline: none;
    }

    .fields {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-block: 4px 8px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-inline-size: 0;
      padding: 0;
      border: 0;
    }

    .field-label {
      font-family: var(--font-sans);
      font-size: 0.875rem;
      font-weight: 600;
    }

    legend.field-label {
      margin-block-end: 4px;
    }

    .input {
      inline-size: 100%;
      padding: 6px 10px;
      font-family: var(--font-sans);
      font-size: 1rem;
      color: var(--wd-text-on-page);
      background: color-mix(in oklab, var(--pergaminho-50) 70%, transparent);
      border: 1px solid var(--pergaminho-300);
      border-radius: var(--wd-radius-control);
    }

    .input:focus-visible {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: 0;
    }

    .hint {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-on-page-muted);
    }

    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
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
      border-color: var(--couro-900);
    }

    .swatch:has(:focus-visible) {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: 2px;
    }

    .dot {
      inline-size: 22px;
      block-size: 22px;
      background: var(--ink);
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

    .link {
      align-self: flex-start;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-on-page-muted);
      text-decoration: underline;
      cursor: pointer;
      background: none;
      border: 0;
    }

    .trash {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      align-self: flex-start;
      padding: 6px 10px;
      margin-block-start: 8px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-danger-on-page);
      cursor: pointer;
      background: none;
      border: 1px solid currentcolor;
      border-radius: var(--wd-radius-control);
    }

    .editor {
      flex: 1;
    }

    @keyframes slide-in {
      from {
        opacity: 0;
        transform: translateX(24px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `,
})
export class EntitySheetComponent {
  readonly entityId = input.required<Uuid>();

  readonly closed = output();
  readonly trash = output<Uuid>();
  readonly openEntity = output<Uuid>();

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
