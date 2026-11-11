import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { DEV_STRINGS } from '@core/strings/dev.strings';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';

export type DevDialogKind = 'simple' | 'reading' | 'danger';

/** Resultado: `true` quando a ação principal foi confirmada. */
export type DevDialogResult = boolean;

/** Diálogo de exemplo da página /dev, nas três formas previstas no docs/05. */
@Component({
  selector: 'wd-dev-demo-dialog',
  imports: [ButtonComponent, DialogComponent],
  template: `
    @switch (kind) {
      @case ('reading') {
        <wd-dialog surface="page" ornate [title]="text.readingTitle">
          <p>{{ text.readingBody }}</p>
          <button wd-button wdDialogAction type="button" (click)="ref.close(false)">
            {{ text.close }}
          </button>
        </wd-dialog>
      }
      @case ('danger') {
        <wd-dialog [title]="text.dangerTitle">
          <p>{{ text.dangerBody }}</p>
          <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close(false)">
            {{ text.cancel }}
          </button>
          <button wd-button wdDialogAction variant="danger" type="button" (click)="ref.close(true)">
            {{ text.delete }}
          </button>
        </wd-dialog>
      }
      @default {
        <wd-dialog [title]="text.simpleTitle">
          <p>{{ text.simpleBody }}</p>
          <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close(false)">
            {{ text.cancel }}
          </button>
          <button
            wd-button
            wdDialogAction
            variant="primary"
            type="button"
            (click)="ref.close(true)"
          >
            {{ text.confirm }}
          </button>
        </wd-dialog>
      }
    }
  `,
})
export class DevDemoDialogComponent {
  protected readonly kind = inject<DevDialogKind>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<DevDialogResult>>(DialogRef);
  protected readonly text = DEV_STRINGS.dialogs;
}
