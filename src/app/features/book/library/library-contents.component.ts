import { Component, input, output } from '@angular/core';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import type { Uuid, World } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import type { LibraryStatus } from './library.store';
import { formatEditDate } from './format-edit-date';

/**
 * Página esquerda da biblioteca, o "Sumário" (docs/05 › Biblioteca): mundos como índice
 * de livro e, ao final, "Criar novo mundo". Livro em branco: ilustração em traço de pena.
 */
@Component({
  selector: 'wd-library-contents',
  imports: [ButtonComponent],
  template: `
    <p class="font-book text-sm text-couro-600 italic">{{ text.exLibris(ownerName()) }}</p>
    <h1 id="wd-library-title" class="wd-inscription text-2xl text-couro-900" tabindex="-1">
      {{ text.heading }}
    </h1>

    @switch (status()) {
      @case ('error') {
        <p class="font-book text-lacre" role="alert">{{ text.loadFailed }}</p>
        <button wd-button type="button" size="sm" class="self-start" (click)="retry.emit()">
          {{ text.retry }}
        </button>
      }
      @case ('ready') {
        @if (worlds().length === 0) {
          <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <!-- Pena e tinteiro em traço fino. -->
            <svg class="quill" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <path d="M96 10 C70 18 48 40 36 74 L32 92 L44 80 C66 70 86 46 96 10 Z" />
              <path d="M96 10 L40 82" />
              <path d="M32 92 L26 104" />
              <path d="M18 104 h36 v8 h-36 Z" />
            </svg>
            <p class="font-book text-xl text-couro-900">{{ text.empty }}</p>
          </div>
        } @else {
          <ol class="flex min-h-0 flex-col gap-1 overflow-y-auto font-book text-lg text-couro-900">
            @for (world of worlds(); track world.id) {
              <li>
                <button
                  type="button"
                  class="toc-item"
                  [attr.aria-current]="world.id === selectedId() ? 'true' : null"
                  (click)="choose.emit(world.id)"
                >
                  <span class="toc-mark" aria-hidden="true"></span>
                  <span class="truncate">{{ world.name }}</span>
                  <span class="toc-dots" aria-hidden="true"></span>
                  <span class="text-sm text-couro-600">{{ editDate(world) }}</span>
                </button>
              </li>
            }
          </ol>
          <button
            wd-button
            variant="ghost"
            size="sm"
            type="button"
            class="self-start"
            (click)="create.emit()"
          >
            <span aria-hidden="true">✒</span> {{ text.createNew }}
          </button>
        }
      }
      @default {
        <p class="font-book text-couro-600 italic" role="status">{{ text.loading }}</p>
      }
    }
  `,
  host: { class: 'flex h-full flex-col gap-4' },
  styles: `
    .toc-item {
      display: flex;
      gap: 8px;
      align-items: baseline;
      inline-size: 100%;
      padding: 4px 6px;
      text-align: start;
      cursor: pointer;
      border-radius: var(--wd-radius-control);
    }

    .toc-item:hover {
      background-color: color-mix(in oklab, var(--pergaminho-300) 35%, transparent);
    }

    .toc-mark {
      flex-shrink: 0;
      inline-size: 8px;
      block-size: 8px;
      transform: rotate(45deg);
    }

    .toc-item[aria-current='true'] .toc-mark {
      background-color: var(--ouro-700);
    }

    .toc-dots {
      flex: 1;
      min-inline-size: 16px;
      border-block-end: 1px dotted var(--couro-500);
    }

    .quill {
      inline-size: 96px;
      fill: none;
      stroke: var(--couro-600);
      stroke-width: 1.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class LibraryContentsComponent {
  readonly worlds = input.required<readonly World[]>();
  readonly selectedId = input<Uuid | null>(null);
  readonly status = input.required<LibraryStatus>();
  readonly ownerName = input.required<string>();

  readonly choose = output<Uuid>();
  readonly create = output();
  readonly retry = output();

  protected readonly text = BOOK_STRINGS.library;

  protected editDate(world: World): string {
    return formatEditDate(world.updatedAt);
  }
}
