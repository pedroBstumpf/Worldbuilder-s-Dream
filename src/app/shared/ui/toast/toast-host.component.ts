import { Component, inject, input } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { IconButtonComponent } from '../icon-button/icon-button.component';
import { IconComponent } from '../icon/icon.component';
import { WD_UI_STRINGS } from '../ui-strings';
import type { ToastController, ToastKind } from './toast.model';

const KIND_ICONS: Record<ToastKind, string> = {
  info: 'info',
  success: 'check_circle',
  error: 'error',
};

/**
 * Pilha de avisos, montada pelo ToastService num overlay no rodapé da tela.
 * Não é região aria-live: o anúncio sai pelo LiveAnnouncer, uma vez só.
 */
@Component({
  selector: 'wd-toast-host',
  imports: [ButtonComponent, IconButtonComponent, IconComponent],
  template: `
    @let state = controller();
    @if (state.toasts().length > 0) {
      <ol
        class="flex w-md max-w-[calc(100vw-2rem)] flex-col gap-2"
        (mouseenter)="state.pause()"
        (mouseleave)="state.resume()"
        (focusin)="state.pause()"
        (focusout)="onFocusOut($event, state)"
      >
        @for (toast of state.toasts(); track toast.id) {
          <li
            class="toast wd-panel flex items-center gap-3 py-2 pr-2 pl-4"
            [attr.data-kind]="toast.kind"
          >
            <wd-icon class="kind-icon" [name]="icons[toast.kind]" />
            <p class="flex-1 font-sans text-sm">{{ toast.message }}</p>
            @if (toast.action; as action) {
              <button
                wd-button
                variant="ghost"
                size="sm"
                type="button"
                (click)="state.runAction(toast.id)"
              >
                {{ action.label }}
              </button>
            }
            <button
              wd-icon-button
              type="button"
              icon="close"
              size="sm"
              [label]="strings.dismissToast"
              (click)="state.dismiss(toast.id)"
            ></button>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .toast {
      animation: toast-in var(--wd-dur-base) var(--wd-ease-out);
    }

    .toast[data-kind='info'] .kind-icon {
      color: var(--wd-info);
    }

    .toast[data-kind='success'] .kind-icon {
      color: var(--wd-success);
    }

    .toast[data-kind='error'] .kind-icon {
      color: var(--wd-danger);
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast {
        animation: none;
      }
    }
  `,
})
export class ToastHostComponent {
  readonly controller = input.required<ToastController>();

  protected readonly icons = KIND_ICONS;
  protected readonly strings = inject(WD_UI_STRINGS);

  protected onFocusOut(event: FocusEvent, state: ToastController): void {
    const list = event.currentTarget as HTMLElement;
    if (!list.contains(event.relatedTarget as Node | null)) state.resume();
  }
}
