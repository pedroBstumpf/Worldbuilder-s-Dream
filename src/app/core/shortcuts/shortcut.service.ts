import { DOCUMENT, inject, Injectable } from '@angular/core';

/** Um atalho de teclado (docs/04 › Atalhos). */
export interface Shortcut {
  /** `KeyboardEvent.key` em minúsculas (`'v'`, `'['`, `'escape'`) ou `'space'`. */
  readonly key: string;
  /** Exige Ctrl (ou Cmd no Mac). Sem a flag, o atalho não dispara com Ctrl/Cmd/Alt. */
  readonly mod?: boolean;
  readonly shift?: boolean;
  /** Dispara também com foco num campo de texto (ex.: Esc). */
  readonly inFields?: boolean;
  /** Mantém o comportamento padrão do navegador (ex.: colar). */
  readonly keepDefault?: boolean;
  /** Só vale quando devolve `true` (ex.: Enter só com uma ferramenta de desenho ativa). */
  readonly when?: (event: KeyboardEvent) => boolean;
  readonly down: (event: KeyboardEvent) => void;
  /** Ao soltar (atalhos de segurar, como Espaço). */
  readonly up?: (event: KeyboardEvent) => void;
}

function keyOf(event: KeyboardEvent): string {
  return event.code === 'Space' ? 'space' : event.key.toLowerCase();
}

/** Foco num campo onde a tecla é texto. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'file'].includes(
      target.type,
    );
  }
  return false;
}

/**
 * Atalhos com escopo: cada tela registra os seus e os remove ao sair. Desativados com
 * foco num campo de texto e dentro de diálogos (que têm o próprio teclado).
 */
@Injectable({ providedIn: 'root' })
export class ShortcutService {
  private readonly document = inject(DOCUMENT);
  private readonly scopes: Shortcut[][] = [];
  private readonly held = new Map<string, Shortcut>();

  constructor() {
    this.document.addEventListener('keydown', (event) => this.onDown(event));
    this.document.addEventListener('keyup', (event) => this.onUp(event));
    // Ao perder o foco da janela, solta as teclas seguradas (o keyup nunca chega).
    this.document.defaultView?.addEventListener('blur', () => this.releaseAll());
  }

  /** Registra um escopo; o mais recente tem prioridade. Devolve a função que o remove. */
  register(shortcuts: Shortcut[]): () => void {
    this.scopes.push(shortcuts);
    return () => {
      const index = this.scopes.indexOf(shortcuts);
      if (index >= 0) this.scopes.splice(index, 1);
      for (const [key, shortcut] of this.held) {
        if (shortcuts.includes(shortcut)) this.held.delete(key);
      }
    };
  }

  private find(event: KeyboardEvent): Shortcut | undefined {
    const key = keyOf(event);
    const mod = event.ctrlKey || event.metaKey;
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const match = this.scopes[i]?.find(
        (s) =>
          s.key === key &&
          (s.mod ?? false) === mod &&
          (s.shift === undefined || s.shift === event.shiftKey) &&
          !event.altKey &&
          (s.when?.(event) ?? true),
      );
      if (match) return match;
    }
    return undefined;
  }

  private onDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const shortcut = this.find(event);
    if (!shortcut) return;
    if (!shortcut.inFields && isTyping(event.target)) return;
    if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
    if (!shortcut.keepDefault) event.preventDefault();
    if (shortcut.up) {
      // Segurar: só o primeiro keydown conta.
      if (event.repeat || this.held.has(keyOf(event))) return;
      this.held.set(keyOf(event), shortcut);
    } else if (event.repeat && !shortcut.inFields) {
      return;
    }
    shortcut.down(event);
  }

  private onUp(event: KeyboardEvent): void {
    const shortcut = this.held.get(keyOf(event));
    if (!shortcut) return;
    this.held.delete(keyOf(event));
    shortcut.up?.(event);
  }

  private releaseAll(): void {
    const held = [...this.held.values()];
    this.held.clear();
    for (const shortcut of held) shortcut.up?.(new KeyboardEvent('keyup'));
  }
}
