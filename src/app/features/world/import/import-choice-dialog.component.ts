import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

export type ImportChoice = 'child' | 'replace' | 'version';

export interface ImportChoiceData {
  /** Nome do mapa aberto. */
  readonly current: string;
  /** Data do cursor da linha do tempo, já formatada. */
  readonly date: string;
}

/**
 * Imagem solta (ou colada) com um mapa aberto (docs/06 §0, passo 6): criar um mapa novo,
 * dentro do atual na árvore, substituir a imagem do atual ou criar uma versão da imagem
 * a partir da data do cursor.
 */
@Component({
  selector: 'wd-import-choice-dialog',
  imports: [ButtonComponent, DialogComponent, IconComponent],
  template: `
    <wd-dialog [title]="text.title">
      <p class="mb-4 font-sans text-sm text-pergaminho-400">{{ text.question(data.current) }}</p>
      <div class="flex flex-col gap-3">
        <button
          wd-button
          variant="secondary"
          type="button"
          class="option"
          (click)="ref.close('child')"
        >
          <wd-icon name="add_photo_alternate" />
          <span class="flex flex-col items-start text-start">
            <span>{{ text.createChild }}</span>
            <span class="font-normal text-pergaminho-400">{{
              text.createChildHint(data.current)
            }}</span>
          </span>
        </button>
        <button
          wd-button
          variant="secondary"
          type="button"
          class="option"
          (click)="ref.close('replace')"
        >
          <wd-icon name="swap_horiz" />
          <span class="flex flex-col items-start text-start">
            <span>{{ text.replace }}</span>
            <span class="font-normal text-pergaminho-400">{{ text.replaceHint }}</span>
          </span>
        </button>
        <button
          wd-button
          variant="secondary"
          type="button"
          class="option"
          (click)="ref.close('version')"
        >
          <wd-icon name="history" />
          <span class="flex flex-col items-start text-start">
            <span>{{ text.version(data.date) }}</span>
            <span class="font-normal text-pergaminho-400">{{ text.versionHint }}</span>
          </span>
        </button>
      </div>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
    </wd-dialog>
  `,
  styles: `
    .option {
      justify-content: flex-start;
      min-block-size: 64px;
      white-space: normal;
    }
  `,
})
export class ImportChoiceDialogComponent {
  protected readonly ref = inject<DialogRef<ImportChoice>>(DialogRef);
  protected readonly data = inject<ImportChoiceData>(DIALOG_DATA);
  protected readonly text = MAP_STRINGS.choice;
}
