import { Component, DOCUMENT, inject, input, output } from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';
import type { DragState } from './map-import.directive';
import { pickImageFile } from './pick-image-file';

/**
 * Área de importação do mundo sem mapa (docs/05): folha de pergaminho com borda tracejada
 * dourada e a rosa dos ventos. Acende enquanto uma imagem é arrastada sobre a janela.
 */
@Component({
  selector: 'wd-map-import-area',
  imports: [ButtonComponent, IconComponent, TooltipDirective],
  template: `
    <section
      class="sheet wd-page"
      aria-labelledby="wd-import-title"
      aria-describedby="wd-import-instructions"
      [attr.data-drag]="dragState()"
      [attr.aria-busy]="busy()"
    >
      <svg class="rose" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
        <circle r="40" />
        <circle r="30" />
        <path d="M0 -46 L6 0 L0 46 L-6 0 Z" />
        <path d="M-46 0 L0 -6 L46 0 L0 6 Z" />
        <path d="M-24 -24 L3 -3 L24 24 L-3 3 Z" />
        <path d="M24 -24 L3 3 L-24 24 L-3 -3 Z" />
      </svg>
      <h2
        id="wd-import-title"
        class="text-center font-book text-2xl text-couro-900"
        aria-live="polite"
      >
        {{ heading() }}
      </h2>
      <p class="text-center font-sans text-sm text-couro-600">{{ text.formats }}</p>
      <p id="wd-import-instructions" class="sr-only">{{ text.instructions }}</p>
      <div class="flex flex-wrap justify-center gap-3">
        <button wd-button variant="primary" type="button" [disabled]="busy()" (click)="choose()">
          <wd-icon name="upload_file" size="sm" />
          {{ text.chooseFile }}
        </button>
        <!-- Drive: Fase 2 (ADR-0007). aria-disabled mantém o botão focável para o tooltip. -->
        <button
          wd-button
          variant="secondary"
          type="button"
          aria-disabled="true"
          class="cursor-not-allowed opacity-60"
          [wdTooltip]="text.fromDriveSoon"
        >
          <wd-icon name="add_to_drive" size="sm" />
          {{ text.fromDrive }}
        </button>
      </div>
    </section>
  `,
  host: { class: 'grid h-full place-items-center p-6' },
  styles: `
    .sheet {
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
      justify-content: center;
      inline-size: min(640px, 100%);
      min-block-size: min(420px, 70dvh);
      padding: 48px 32px;
      border: 2px dashed var(--ouro-500);
      border-radius: var(--wd-radius-panel);
      box-shadow: var(--wd-shadow-panel);
      transition: transform var(--wd-dur-base) var(--wd-ease-out);
    }

    .rose {
      inline-size: 96px;
      fill: none;
      stroke: var(--ouro-700);
      stroke-width: 1;
    }

    /* Arrastando uma imagem: moldura acesa e leve aproximação. */
    .sheet[data-drag='image'] {
      border: 2px solid var(--ouro-300);
      box-shadow:
        0 0 0 4px var(--wd-accent-glow),
        var(--wd-shadow-panel);
      transform: scale(1.02);
    }

    .sheet[data-drag='invalid'] {
      border: 2px solid var(--lacre);
    }

    .sheet[aria-busy='true'] .rose {
      animation: spin 2.4s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .sheet {
        transition: none;
      }

      .sheet[data-drag='image'] {
        transform: none;
      }

      .sheet[aria-busy='true'] .rose {
        animation: none;
      }
    }
  `,
})
export class MapImportAreaComponent {
  readonly dragState = input<DragState>('idle');
  readonly busy = input(false);
  readonly fileChosen = output<File>();

  protected readonly text = MAP_STRINGS.import;
  private readonly document = inject(DOCUMENT);

  protected heading(): string {
    if (this.busy()) return this.text.preparing;
    if (this.dragState() === 'image') return this.text.dropToCreate;
    if (this.dragState() === 'invalid') return this.text.notAnImage;
    return this.text.title;
  }

  protected async choose(): Promise<void> {
    const file = await pickImageFile(this.document);
    if (file) this.fileChosen.emit(file);
  }
}
