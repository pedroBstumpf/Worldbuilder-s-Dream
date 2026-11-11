import { Component, inject, signal } from '@angular/core';
import { DEV_STRINGS } from '@core/strings/dev.strings';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { ToastService } from '@shared/ui/toast/toast.service';
import type { ToastKind } from '@shared/ui/toast/toast.model';
import { TooltipDirective, type TooltipPosition } from '@shared/ui/tooltip/tooltip.directive';
import {
  DevDemoDialogComponent,
  type DevDialogKind,
  type DevDialogResult,
} from './dev-demo-dialog.component';

type ToolId = keyof typeof DEV_STRINGS.iconButtons.tools;

const TOOLS: readonly { readonly id: ToolId; readonly icon: string }[] = [
  { id: 'select', icon: 'near_me' },
  { id: 'pan', icon: 'pan_tool' },
  { id: 'pin', icon: 'location_on' },
  { id: 'ruler', icon: 'straighten' },
  { id: 'brush', icon: 'brush' },
  { id: 'label', icon: 'title' },
];

const TOOLTIP_POSITIONS: readonly TooltipPosition[] = ['above', 'below', 'left', 'right'];

/**
 * Vitrine interna dos componentes de shared/ui (F0-04). Só é registrada em
 * desenvolvimento (canMatch com isDevMode, em app.routes.ts).
 */
@Component({
  selector: 'wd-dev-page',
  imports: [ButtonComponent, IconButtonComponent, IconComponent, TooltipDirective],
  templateUrl: './dev.page.html',
})
export default class DevPage {
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);

  protected readonly text = DEV_STRINGS;
  protected readonly tools = TOOLS;
  protected readonly tooltipPositions = TOOLTIP_POSITIONS;
  protected readonly activeTool = signal<ToolId>('select');

  protected openDialog(kind: DevDialogKind): void {
    const ref = this.dialogs.open<DevDemoDialogComponent, DevDialogKind, DevDialogResult>(
      DevDemoDialogComponent,
      { data: kind },
    );
    if (kind !== 'danger') return;
    ref.closed.subscribe((confirmed) => {
      if (confirmed) this.showUndoToast(this.text.dialogs.deleted);
    });
  }

  protected showToast(kind: ToastKind): void {
    const messages = {
      info: this.text.toasts.infoMessage,
      success: this.text.toasts.successMessage,
      error: this.text.toasts.errorMessage,
    } satisfies Record<ToastKind, string>;
    this.toasts.show({ message: messages[kind], kind });
  }

  protected showUndoToast(message: string = this.text.toasts.undoMessage): void {
    this.toasts.show({
      message,
      action: {
        label: this.text.toasts.undo,
        run: () => this.toasts.show({ message: this.text.toasts.undone, kind: 'success' }),
      },
    });
  }
}
