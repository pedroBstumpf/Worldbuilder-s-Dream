import { DestroyRef, Directive, DOCUMENT, inject, input, output, signal } from '@angular/core';
import { isAcceptedImageMime } from '@domain/maps';

/** O que está sendo arrastado sobre a janela. */
export type DragState = 'idle' | 'image' | 'invalid';

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/**
 * Durante o arraste o navegador só mostra o MIME dos itens. Sem MIME (alguns sistemas),
 * considera imagem e deixa a validação dos bytes para o drop.
 */
function dragKind(event: DragEvent): DragState {
  const items = [...(event.dataTransfer?.items ?? [])].filter((item) => item.kind === 'file');
  if (items.length === 0) return 'image';
  return items.some((item) => item.type === '' || isAcceptedImageMime(item.type))
    ? 'image'
    : 'invalid';
}

/** Primeira imagem colada (Ctrl/Cmd+V com uma imagem na área de transferência). */
function pastedImage(event: ClipboardEvent): File | null {
  for (const item of event.clipboardData?.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
}

/**
 * Importação de mapa (docs/06 §0, passo 1): arrastar e soltar em **qualquer lugar da
 * janela** e colar imagem. O botão "Escolher arquivo" fica na área de importação.
 */
@Directive({ selector: '[wdMapImport]', exportAs: 'wdMapImport' })
export class MapImportDirective {
  /** Desliga a escuta (ex.: enquanto uma importação está em andamento). */
  readonly disabled = input(false, { alias: 'wdMapImportDisabled' });
  readonly fileReceived = output<File>({ alias: 'wdMapImport' });

  private readonly state = signal<DragState>('idle');
  readonly dragState = this.state.asReadonly();

  constructor() {
    const document = inject(DOCUMENT);
    const view = document.defaultView;
    if (!view) return;
    // dragenter/dragleave disparam a cada elemento cruzado; o contador diz se ainda está sobre a janela.
    let depth = 0;
    const listeners: [keyof WindowEventMap, (event: Event) => void][] = [
      [
        'dragenter',
        (event) => {
          if (!this.accepts(event)) return;
          depth += 1;
          this.state.set(dragKind(event as DragEvent));
        },
      ],
      [
        'dragover',
        (event) => {
          if (!this.accepts(event)) return;
          event.preventDefault();
          const kind = dragKind(event as DragEvent);
          const transfer = (event as DragEvent).dataTransfer;
          if (transfer) transfer.dropEffect = kind === 'image' ? 'copy' : 'none';
          this.state.set(kind);
        },
      ],
      [
        'dragleave',
        (event) => {
          if (!this.accepts(event)) return;
          depth = Math.max(0, depth - 1);
          if (depth === 0) this.state.set('idle');
        },
      ],
      [
        'drop',
        (event) => {
          if (!this.accepts(event)) return;
          event.preventDefault();
          depth = 0;
          this.state.set('idle');
          const file = (event as DragEvent).dataTransfer?.files[0];
          if (file) this.fileReceived.emit(file);
        },
      ],
      [
        'paste',
        (event) => {
          if (this.disabled()) return;
          const file = pastedImage(event as ClipboardEvent);
          if (!file) return;
          event.preventDefault();
          this.fileReceived.emit(file);
        },
      ],
    ];
    for (const [type, listener] of listeners) view.addEventListener(type, listener);
    inject(DestroyRef).onDestroy(() => {
      for (const [type, listener] of listeners) view.removeEventListener(type, listener);
    });
  }

  private accepts(event: Event): boolean {
    return !this.disabled() && hasFiles(event as DragEvent);
  }
}
