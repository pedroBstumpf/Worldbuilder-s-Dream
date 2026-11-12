import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';

/** "Excluir para sempre?": recebe o nome do mundo e fecha com `true` ao confirmar. */
@Component({
  selector: 'wd-delete-world-dialog',
  imports: [ButtonComponent, DialogComponent],
  template: `
    <wd-dialog ornate [title]="text.title">
      <p class="font-sans text-base">{{ text.question(name) }}</p>
      <p class="font-sans text-sm text-pergaminho-400">{{ text.hint }}</p>
      <button
        wd-button
        wdDialogAction
        variant="ghost"
        type="button"
        cdkFocusInitial
        (click)="ref.close()"
      >
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="danger" type="button" (click)="ref.close(true)">
        {{ text.confirm }}
      </button>
    </wd-dialog>
  `,
})
export class DeleteWorldDialogComponent {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly name = inject<string>(DIALOG_DATA);
  protected readonly text = BOOK_STRINGS.deleteWorld;
}
