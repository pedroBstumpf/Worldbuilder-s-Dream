import {
  afterNextRender,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ENTITY_STRINGS } from '@core/strings/entity.strings';
import type { RichTextDoc, Uuid } from '@domain/models';
import { foldText, type SearchKind } from '@domain/search';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';
import { Editor, type JSONContent } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { EntityAvatarComponent } from '../entity-avatar.component';

/** Entidade que pode ser citada com `@`. */
export interface MentionCandidate {
  readonly id: Uuid;
  readonly label: string;
  readonly kind: SearchKind;
  readonly aliases: readonly string[];
}

interface MentionItem {
  readonly id: Uuid;
  readonly label: string;
  readonly kind: SearchKind;
}

interface SuggestionView {
  readonly items: readonly MentionItem[];
  readonly index: number;
  readonly top: number;
  readonly left: number;
  readonly select: (item: MentionItem) => void;
}

/** Quantas sugestões mostrar. */
const MENTION_LIMIT = 8;
/** Espera entre a digitação e o aviso de mudança (a store ainda espera antes de gravar). */
const EMIT_DELAY_MS = 250;

type Command =
  | 'bold'
  | 'italic'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'undo'
  | 'redo';

/**
 * Editor de texto da ficha (Tiptap, ADR-0010; docs/04 › Textos): StarterKit, links só
 * `https:` e `mailto:`, placeholder, contagem de caracteres e menções com `@`. Salva JSON
 * (nada de HTML). Fica num chunk próprio, carregado com `@defer` na aba Texto.
 */
@Component({
  selector: 'wd-rich-text-editor',
  imports: [EntityAvatarComponent, IconComponent, TooltipDirective],
  template: `
    <div class="toolbar" role="toolbar" [attr.aria-label]="text.toolbar">
      @for (button of buttons; track button.command) {
        @if (button.separator) {
          <span class="sep" aria-hidden="true"></span>
        }
        <button
          type="button"
          class="tool wd-focus"
          [attr.aria-label]="button.label"
          [attr.aria-pressed]="button.toggle ? isActive(button.command) : null"
          [disabled]="!can(button.command)"
          [wdTooltip]="button.label"
          wdTooltipPosition="below"
          (mousedown)="$event.preventDefault()"
          (click)="run(button.command)"
        >
          <wd-icon [name]="button.icon" size="sm" />
        </button>
      }
    </div>
    <div #host class="host"></div>
    <p class="count" aria-live="off">{{ text.characters(characters(), maxLength()) }}</p>

    @if (suggestion(); as view) {
      <ul
        class="suggestions wd-panel"
        role="listbox"
        [id]="listId"
        [attr.aria-label]="text.mentionList"
        [style.top.px]="view.top"
        [style.left.px]="view.left"
      >
        @for (item of view.items; track item.id; let i = $index) {
          <li
            role="option"
            class="option"
            [id]="listId + '-' + i"
            [attr.aria-selected]="i === view.index"
            (mousedown)="$event.preventDefault(); view.select(item)"
          >
            <wd-entity-avatar [kind]="item.kind" [name]="item.label" [size]="24" />
            <span>{{ item.label }}</span>
          </li>
        } @empty {
          <li class="none" role="option" aria-disabled="true" aria-selected="false">
            {{ text.mentionEmpty }}
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-block-size: 0;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      align-items: center;
      padding: 2px;
      border-block-end: 1px solid var(--pergaminho-300);
    }

    .sep {
      inline-size: 1px;
      block-size: 20px;
      margin-inline: 4px;
      background: var(--pergaminho-300);
    }

    .tool {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      color: var(--wd-text-on-page-muted);
      cursor: pointer;
      background: none;
      border: 0;
      border-radius: var(--wd-radius-control);
    }

    .tool:hover:not(:disabled) {
      color: var(--wd-text-on-page);
      background: var(--pergaminho-200);
    }

    .tool[aria-pressed='true'] {
      color: var(--wd-text-on-page);
      background: var(--pergaminho-300);
    }

    .tool:disabled {
      cursor: default;
      opacity: 0.4;
    }

    .host {
      flex: 1;
      min-block-size: 12rem;
    }

    .count {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-on-page-muted);
      text-align: end;
    }

    .suggestions {
      position: fixed;
      z-index: 1000;
      min-inline-size: 220px;
      max-inline-size: 320px;
      max-block-size: 280px;
      padding: 4px;
      overflow-y: auto;
    }

    .option,
    .none {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 6px 8px;
      font-family: var(--font-book);
      font-size: 1rem;
      border-radius: var(--wd-radius-control);
    }

    .option {
      cursor: pointer;
    }

    .option[aria-selected='true'] {
      color: var(--wd-text-on-accent);
      background: var(--wd-accent);
    }

    .none {
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-muted);
    }
  `,
})
export class RichTextEditorComponent {
  /** Conteúdo inicial (lido uma vez; depois o editor é a fonte). */
  readonly content = input<RichTextDoc | null>(null);
  /** Nome acessível da área de texto. */
  readonly label = input.required<string>();
  readonly candidates = input<readonly MentionCandidate[]>([]);
  readonly maxLength = input(500_000);

  /**
   * Recebe o texto alterado. É uma função (e não um output) porque a última mudança
   * também é entregue ao destruir o editor, quando os outputs já não emitem.
   */
  readonly save = input.required<(doc: RichTextDoc) => void>();
  /** Clique numa menção: abrir a ficha citada. */
  readonly openMention = output<Uuid>();

  protected readonly text = ENTITY_STRINGS.editor;
  protected readonly listId = `wd-mentions-${crypto.randomUUID().slice(0, 8)}`;
  protected readonly suggestion = signal<SuggestionView | null>(null);
  protected readonly characters = signal(0);
  /** Muda a cada transação, para a barra refletir o estado do cursor. */
  private readonly revision = signal(0);

  protected readonly buttons: readonly {
    command: Command;
    icon: string;
    label: string;
    toggle: boolean;
    separator?: boolean;
  }[] = [
    { command: 'bold', icon: 'format_bold', label: this.text.bold, toggle: true },
    { command: 'italic', icon: 'format_italic', label: this.text.italic, toggle: true },
    {
      command: 'heading2',
      icon: 'format_h2',
      label: this.text.heading,
      toggle: true,
      separator: true,
    },
    { command: 'heading3', icon: 'format_h3', label: this.text.subheading, toggle: true },
    {
      command: 'bulletList',
      icon: 'format_list_bulleted',
      label: this.text.bulletList,
      toggle: true,
      separator: true,
    },
    {
      command: 'orderedList',
      icon: 'format_list_numbered',
      label: this.text.orderedList,
      toggle: true,
    },
    { command: 'blockquote', icon: 'format_quote', label: this.text.quote, toggle: true },
    { command: 'undo', icon: 'undo', label: this.text.undo, toggle: false, separator: true },
    { command: 'redo', icon: 'redo', label: this.text.redo, toggle: false },
  ];

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private editor: Editor | null = null;
  /** `save` lido na criação: a última mudança vai para quem abriu o editor. */
  private saveFn: ((doc: RichTextDoc) => void) | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterNextRender(() => this.create());
    inject(DestroyRef).onDestroy(() => {
      this.flush();
      this.editor?.destroy();
      this.editor = null;
    });
  }

  /** Põe o cursor no texto. */
  focus(): void {
    this.editor?.commands.focus();
  }

  protected isActive(command: Command): boolean {
    this.revision();
    const editor = this.editor;
    if (!editor) return false;
    switch (command) {
      case 'heading2':
        return editor.isActive('heading', { level: 2 });
      case 'heading3':
        return editor.isActive('heading', { level: 3 });
      default:
        return editor.isActive(command);
    }
  }

  protected can(command: Command): boolean {
    this.revision();
    const editor = this.editor;
    if (!editor) return false;
    if (command === 'undo') return editor.can().undo();
    if (command === 'redo') return editor.can().redo();
    return true;
  }

  protected run(command: Command): void {
    const chain = this.editor?.chain().focus();
    if (!chain) return;
    const commands: Record<Command, () => boolean> = {
      bold: () => chain.toggleBold().run(),
      italic: () => chain.toggleItalic().run(),
      heading2: () => chain.toggleHeading({ level: 2 }).run(),
      heading3: () => chain.toggleHeading({ level: 3 }).run(),
      bulletList: () => chain.toggleBulletList().run(),
      orderedList: () => chain.toggleOrderedList().run(),
      blockquote: () => chain.toggleBlockquote().run(),
      undo: () => chain.undo().run(),
      redo: () => chain.redo().run(),
    };
    commands[command]();
  }

  private onClick(event: MouseEvent): void {
    const mention =
      event.target instanceof Element ? event.target.closest('[data-type="mention"]') : null;
    const id = mention?.getAttribute('data-id');
    if (id && (event.ctrlKey || event.metaKey || !this.editor?.isFocused)) {
      this.openMention.emit(id);
    }
  }

  private create(): void {
    const element = this.host().nativeElement;
    const initial = untracked(() => this.content());
    this.saveFn = untracked(() => this.save());
    this.editor = new Editor({
      element,
      content: (initial as JSONContent | null) ?? '',
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          code: false,
          codeBlock: false,
          link: {
            openOnClick: false,
            autolink: true,
            defaultProtocol: 'https',
            protocols: ['https', 'mailto'],
            isAllowedUri: (url) => /^(https:|mailto:)/i.test(url),
            HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
          },
        }),
        Placeholder.configure({ placeholder: this.text.placeholder }),
        CharacterCount.configure({ limit: untracked(() => this.maxLength()) }),
        Mention.configure({
          HTMLAttributes: { class: 'mention' },
          suggestion: {
            items: ({ query }) => this.mentionItems(query),
            render: () => this.renderSuggestion(),
          },
        }),
      ],
      editorProps: {
        attributes: {
          class: 'wd-prose',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': untracked(() => this.label()),
          spellcheck: 'true',
          lang: 'pt-BR',
        },
      },
      onTransaction: () => this.revision.update((n) => n + 1),
      onUpdate: () => this.scheduleEmit(),
    });
    this.characters.set(this.editor.storage.characterCount.characters());
    element.addEventListener('click', (event) => this.onClick(event));
  }

  private mentionItems(query: string): MentionItem[] {
    const folded = foldText(query.trim());
    const candidates = untracked(() => this.candidates());
    const matches = folded
      ? candidates.filter(
          (c) =>
            foldText(c.label).includes(folded) ||
            c.aliases.some((alias) => foldText(alias).includes(folded)),
        )
      : candidates;
    return matches
      .slice(0, MENTION_LIMIT)
      .map((candidate) => ({ id: candidate.id, label: candidate.label, kind: candidate.kind }));
  }

  private renderSuggestion() {
    let index = 0;
    let props: SuggestionProps<MentionItem> | null = null;
    const show = () => {
      if (!props) return;
      const rect = props.clientRect?.();
      const items = props.items;
      index = Math.min(index, Math.max(items.length - 1, 0));
      const command = props.command;
      this.suggestion.set({
        items,
        index,
        top: (rect?.bottom ?? 0) + 6,
        left: Math.min(rect?.left ?? 0, window.innerWidth - 336),
        select: (item) => command({ id: item.id, label: item.label }),
      });
      const dom = this.editor?.view.dom;
      dom?.setAttribute('aria-controls', this.listId);
      dom?.setAttribute('aria-expanded', 'true');
      if (items.length > 0) dom?.setAttribute('aria-activedescendant', `${this.listId}-${index}`);
      else dom?.removeAttribute('aria-activedescendant');
    };
    const hide = () => {
      props = null;
      this.suggestion.set(null);
      const dom = this.editor?.view.dom;
      dom?.removeAttribute('aria-controls');
      dom?.removeAttribute('aria-expanded');
      dom?.removeAttribute('aria-activedescendant');
    };
    return {
      onStart: (next: SuggestionProps<MentionItem>) => {
        index = 0;
        props = next;
        show();
      },
      onUpdate: (next: SuggestionProps<MentionItem>) => {
        props = next;
        show();
      },
      onExit: hide,
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        const items = props?.items ?? [];
        if (event.key === 'Escape') {
          hide();
          return true;
        }
        if (items.length === 0) return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const step = event.key === 'ArrowDown' ? 1 : -1;
          index = (index + step + items.length) % items.length;
          show();
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = items[index];
          if (item) props?.command({ id: item.id, label: item.label });
          return true;
        }
        return false;
      },
    };
  }

  private scheduleEmit(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => this.flush(), EMIT_DELAY_MS);
  }

  /** Avisa a mudança pendente agora (ao sair da aba ou fechar a ficha). */
  private flush(): void {
    if (!this.emitTimer || !this.editor) return;
    clearTimeout(this.emitTimer);
    this.emitTimer = null;
    this.characters.set(this.editor.storage.characterCount.characters());
    this.saveFn?.(this.editor.getJSON() as RichTextDoc);
  }
}
