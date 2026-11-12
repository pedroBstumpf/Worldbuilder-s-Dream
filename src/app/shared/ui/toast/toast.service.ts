import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  createGlobalPositionStrategy,
  createOverlayRef,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { inject, Injectable, Injector, signal } from '@angular/core';
import { ToastHostComponent } from './toast-host.component';
import type { Toast, ToastController, ToastOptions } from './toast.model';

export const TOAST_DURATION_MS = 5000;
export const TOAST_WITH_ACTION_DURATION_MS = 8000;
export const TOAST_MAX_VISIBLE = 3;

interface Countdown {
  remaining: number;
  startedAt: number;
  handle: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Avisos curtos no rodapé (substitui o snackbar, docs/04). Anuncia pelo LiveAnnouncer
 * (erro como `assertive`), some sozinho e pausa enquanto o ponteiro ou o foco estão
 * na pilha (WCAG 2.2.1). Mostra no máximo três; o mais antigo sai primeiro.
 */
@Injectable({ providedIn: 'root' })
export class ToastService implements ToastController {
  private readonly injector = inject(Injector);
  private readonly announcer = inject(LiveAnnouncer);

  private readonly list = signal<readonly Toast[]>([]);
  readonly toasts = this.list.asReadonly();

  private readonly countdowns = new Map<number, Countdown>();
  private paused = false;
  private overlayRef: OverlayRef | null = null;
  private nextId = 1;

  /** Mostra um aviso e devolve o id (para dispensar antes do tempo). */
  show(options: ToastOptions): number {
    const toast: Toast = {
      id: this.nextId++,
      message: options.message,
      kind: options.kind ?? 'info',
      action: options.action ?? null,
    };
    const duration =
      options.durationMs ?? (toast.action ? TOAST_WITH_ACTION_DURATION_MS : TOAST_DURATION_MS);

    this.list.update((list) => [...list, toast]);
    for (const old of this.list().slice(0, -TOAST_MAX_VISIBLE)) this.dismiss(old.id);

    this.countdowns.set(toast.id, { remaining: duration, startedAt: 0, handle: undefined });
    if (!this.paused) this.startCountdown(toast.id);

    void this.announcer.announce(toast.message, toast.kind === 'error' ? 'assertive' : 'polite');
    this.attachHost();
    return toast.id;
  }

  dismiss(id: number): void {
    clearTimeout(this.countdowns.get(id)?.handle);
    this.countdowns.delete(id);
    this.list.update((list) => list.filter((toast) => toast.id !== id));
    // A pilha some sem disparar mouseleave/focusout; a pausa não pode ficar presa.
    if (this.list().length === 0) this.paused = false;
  }

  runAction(id: number): void {
    const action = this.list().find((toast) => toast.id === id)?.action;
    this.dismiss(id);
    action?.run();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    const now = Date.now();
    for (const countdown of this.countdowns.values()) {
      clearTimeout(countdown.handle);
      countdown.remaining = Math.max(0, countdown.remaining - (now - countdown.startedAt));
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const id of this.countdowns.keys()) this.startCountdown(id);
  }

  private startCountdown(id: number): void {
    const countdown = this.countdowns.get(id);
    if (!countdown) return;
    countdown.startedAt = Date.now();
    countdown.handle = setTimeout(() => this.dismiss(id), countdown.remaining);
  }

  private attachHost(): void {
    if (this.overlayRef) {
      // Mantém a pilha acima de overlays abertos depois dela.
      const host = this.overlayRef.hostElement;
      if (host.nextElementSibling) host.parentElement?.append(host);
      return;
    }
    this.overlayRef = createOverlayRef(this.injector, {
      positionStrategy: createGlobalPositionStrategy(this.injector)
        .centerHorizontally()
        // Telas com barra inferior (linha do tempo) definem --wd-toast-offset na raiz.
        .bottom('calc(var(--wd-toast-offset, 0px) + 1.5rem)'),
      panelClass: 'wd-toast-pane',
    });
    const hostRef = this.overlayRef.attach(new ComponentPortal(ToastHostComponent));
    hostRef.setInput('controller', this);
  }
}
