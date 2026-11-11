import { AriaDescriber, FocusMonitor } from '@angular/cdk/a11y';
import { hasModifierKey } from '@angular/cdk/keycodes';
import {
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy,
  type ConnectedPosition,
  type FlexibleConnectedPositionStrategy,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  afterRenderEffect,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  Injector,
  input,
  type ComponentRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TooltipPanelComponent } from './tooltip-panel.component';

export type TooltipPosition = 'above' | 'below' | 'left' | 'right';

/** Atraso para abrir com o ponteiro; o foco por teclado abre na hora. */
export const TOOLTIP_SHOW_DELAY_MS = 400;
/** Tempo para o ponteiro ir do controle até o balão sem que ele feche (WCAG 1.4.13). */
export const TOOLTIP_HIDE_DELAY_MS = 120;

const GAP_PX = 8;

const POSITIONS: Record<TooltipPosition, ConnectedPosition> = {
  above: {
    originX: 'center',
    originY: 'top',
    overlayX: 'center',
    overlayY: 'bottom',
    offsetY: -GAP_PX,
  },
  below: {
    originX: 'center',
    originY: 'bottom',
    overlayX: 'center',
    overlayY: 'top',
    offsetY: GAP_PX,
  },
  left: {
    originX: 'start',
    originY: 'center',
    overlayX: 'end',
    overlayY: 'center',
    offsetX: -GAP_PX,
  },
  right: {
    originX: 'end',
    originY: 'center',
    overlayX: 'start',
    overlayY: 'center',
    offsetX: GAP_PX,
  },
};

const FALLBACK: Record<TooltipPosition, TooltipPosition> = {
  above: 'below',
  below: 'above',
  left: 'right',
  right: 'left',
};

/**
 * Tooltip sobre CDK Overlay: `<button wdTooltip="Régua" wdTooltipPosition="right">`.
 * Abre com o ponteiro (após atraso) ou com foco de teclado; fecha com Esc, ao sair
 * ou ao perder o foco. O texto vira descrição acessível, salvo se já for o aria-label.
 */
@Directive({
  selector: '[wdTooltip]',
  exportAs: 'wdTooltip',
  host: {
    '(pointerenter)': 'onPointerEnter($event)',
    '(pointerleave)': 'scheduleHide()',
  },
})
export class TooltipDirective {
  readonly message = input.required<string>({ alias: 'wdTooltip' });
  readonly position = input<TooltipPosition>('above', { alias: 'wdTooltipPosition' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly ariaDescriber = inject(AriaDescriber);

  private overlayRef: OverlayRef | null = null;
  private positionStrategy: FlexibleConnectedPositionStrategy | null = null;
  private panelRef: ComponentRef<TooltipPanelComponent> | null = null;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private describedMessage = '';

  constructor() {
    const element = this.host.nativeElement;

    // Depois da renderização, para o aria-label do host (se houver) já estar aplicado.
    afterRenderEffect(() => {
      const message = this.message().trim();
      if (message === this.describedMessage) return;
      this.ariaDescriber.removeDescription(element, this.describedMessage);
      this.ariaDescriber.describe(element, message);
      this.describedMessage = message;
      this.panelRef?.setInput('message', message);
    });

    const focusMonitor = inject(FocusMonitor);
    focusMonitor
      .monitor(element)
      .pipe(takeUntilDestroyed())
      .subscribe((origin) => {
        if (origin === 'keyboard') this.show();
        else if (origin === null) this.hide();
      });

    inject(DestroyRef).onDestroy(() => {
      this.clearTimers();
      focusMonitor.stopMonitoring(element);
      this.ariaDescriber.removeDescription(element, this.describedMessage);
      this.overlayRef?.dispose();
    });
  }

  /** Mostra o balão imediatamente. */
  show(): void {
    this.clearTimers();
    const message = this.message().trim();
    if (!message) return;

    const overlayRef = (this.overlayRef ??= this.createOverlay());
    const position = this.position();
    this.positionStrategy?.withPositions([POSITIONS[position], POSITIONS[FALLBACK[position]]]);
    if (overlayRef.hasAttached()) {
      overlayRef.updatePosition();
      return;
    }
    this.panelRef = overlayRef.attach(new ComponentPortal(TooltipPanelComponent));
    this.panelRef.setInput('message', message);
  }

  /** Esconde o balão imediatamente. */
  hide(): void {
    this.clearTimers();
    if (this.overlayRef?.hasAttached()) this.overlayRef.detach();
    this.panelRef = null;
  }

  /** Se o balão está na tela. */
  isOpen(): boolean {
    return this.overlayRef?.hasAttached() ?? false;
  }

  protected onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    clearTimeout(this.hideTimer);
    if (this.isOpen()) return;
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => this.show(), TOOLTIP_SHOW_DELAY_MS);
  }

  protected scheduleHide(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), TOOLTIP_HIDE_DELAY_MS);
  }

  private createOverlay(): OverlayRef {
    this.positionStrategy = createFlexibleConnectedPositionStrategy(this.injector, this.host)
      .withFlexibleDimensions(false)
      .withViewportMargin(GAP_PX)
      .withPush(false);

    const overlayRef = createOverlayRef(this.injector, {
      positionStrategy: this.positionStrategy,
      scrollStrategy: createRepositionScrollStrategy(this.injector, { scrollThrottle: 20 }),
      panelClass: 'wd-tooltip-pane',
    });

    // Esc fecha o balão sem mover foco nem ponteiro (WCAG 1.4.13); dentro de um
    // diálogo, só o tooltip fecha, porque ele é o overlay do topo.
    overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape' && !hasModifierKey(event)) {
        event.preventDefault();
        this.hide();
      }
    });

    // O ponteiro pode passar por cima do balão sem fechá-lo.
    const pane = overlayRef.overlayElement;
    pane.addEventListener('pointerenter', () => clearTimeout(this.hideTimer));
    pane.addEventListener('pointerleave', () => this.scheduleHide());

    return overlayRef;
  }

  private clearTimers(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
  }
}
