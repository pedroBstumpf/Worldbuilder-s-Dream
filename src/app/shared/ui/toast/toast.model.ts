import type { Signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  /** Rótulo do botão, ex.: "Desfazer" (de core/strings). */
  readonly label: string;
  readonly run: () => void;
}

export interface ToastOptions {
  readonly message: string;
  readonly kind?: ToastKind;
  readonly action?: ToastAction;
  /** Tempo na tela; padrão 5 s, ou 8 s quando há ação. */
  readonly durationMs?: number;
}

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly kind: ToastKind;
  readonly action: ToastAction | null;
}

/** O que a pilha de avisos precisa do serviço (evita import circular). */
export interface ToastController {
  readonly toasts: Signal<readonly Toast[]>;
  dismiss(id: number): void;
  runAction(id: number): void;
  pause(): void;
  resume(): void;
}
