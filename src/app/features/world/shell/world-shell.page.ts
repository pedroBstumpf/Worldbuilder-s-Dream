import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  afterNextRender,
  Component,
  type ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { DEMO_MODE } from '@core/data-source/demo-mode';
import { BookMotionService } from '@core/motion/book-motion.service';
import { BookTransitions } from '@core/motion/book-transitions.service';
import { DEMO_STRINGS } from '@core/strings/demo.strings';
import { WORLD_STRINGS } from '@core/strings/world.strings';
import { WorldPrefetch } from '@core/world/world-prefetch.service';
import type { World } from '@domain/models';
import { DemoBadgeComponent } from '@shared/ui/demo-badge/demo-badge.component';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { ToastService } from '@shared/ui/toast/toast.service';

/** Como a tela chegou: zoom vindo do livro, fade (movimento reduzido) ou direto. */
type Entrance = 'zoom' | 'fade' | 'none';

/**
 * Shell do mapa (docs/04 › Layout VTT). Por enquanto: barra superior (livro, nome do
 * mundo) e a folha do mundo sem mapa no lugar do canvas; o `MapEngine` e a importação
 * entram no M1. O host do mapa compartilha `view-transition-name: wd-world-map` com a
 * página do livro, o que cria o zoom contínuo (ADR-0011).
 */
@Component({
  selector: 'wd-world-shell-page',
  imports: [DemoBadgeComponent, IconButtonComponent],
  template: `
    <main
      class="map-host"
      aria-labelledby="wd-world-title"
      [attr.aria-busy]="world() === null"
      [attr.data-entrance]="entrance"
    >
      <div class="sheet wd-page">
        <svg class="sheet-rose" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
          <circle r="40" />
          <path d="M0 -46 L6 0 L0 46 L-6 0 Z" />
          <path d="M-46 0 L0 -6 L46 0 L0 6 Z" />
        </svg>
        <p class="text-center font-book text-2xl text-couro-900">{{ text.noMap }}</p>
        <p class="text-center font-book text-lg text-couro-600 italic">{{ text.noMapHint }}</p>
      </div>
    </main>

    <header class="top-bar" [attr.data-entrance]="entrance">
      <button
        wd-icon-button
        type="button"
        icon="menu_book"
        tooltipPosition="below"
        [label]="text.backToLibrary"
        (click)="backToLibrary()"
      ></button>
      <h1
        #title
        id="wd-world-title"
        class="wd-inscription truncate text-center text-lg text-ouro-400"
        tabindex="-1"
      >
        {{ world()?.name ?? text.loading }}
      </h1>
      <div class="flex justify-end">
        @if (demoMode) {
          <wd-demo-badge inline [label]="demoStrings.badge" [detail]="demoStrings.badgeDetail" />
        }
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }

    .map-host {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 72px 24px 24px;
      background-color: var(--wd-bg-backdrop);
      view-transition-name: wd-world-map;
    }

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
    }

    .sheet-rose {
      inline-size: 96px;
      fill: none;
      stroke: var(--ouro-700);
      stroke-width: 1;
    }

    /* Barra superior: 48 px, couro 95%, filete dourado inferior (docs/05). */
    .top-bar {
      position: fixed;
      inset: 0 0 auto;
      display: grid;
      grid-template-columns: 1fr minmax(0, 2fr) 1fr;
      gap: 12px;
      align-items: center;
      block-size: 48px;
      padding-inline: 4px 12px;
      color: var(--wd-text-on-surface);
      background-color: color-mix(in oklab, var(--wd-surface) 95%, transparent);
      background-image: var(--wd-texture-leather);
      border-block-end: 1px solid var(--wd-rule-strong);
      box-shadow: var(--wd-shadow-panel);
    }

    .top-bar > :first-child {
      justify-self: start;
      inline-size: 44px;
      block-size: 44px;
    }

    /* Depois do zoom, a barra entra deslizando do topo (docs/05 › Virada de página, 5). */
    .top-bar[data-entrance='zoom'] {
      animation: bar-in var(--wd-dur-base) var(--wd-ease-out) var(--wd-dur-zoom) backwards;
    }

    :host-context([data-book-zoom='short']) .top-bar[data-entrance='zoom'] {
      animation-delay: var(--wd-dur-zoom-short);
    }

    /* Movimento reduzido: fade cruzado curto no lugar do zoom. */
    [data-entrance='fade'] {
      animation: fade-in var(--wd-dur-fade) linear;
    }

    @keyframes bar-in {
      from {
        transform: translateY(-100%);
      }
    }

    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }
  `,
})
export default class WorldShellPage {
  /** `:worldId` da rota (withComponentInputBinding). */
  readonly worldId = input.required<string>();

  protected readonly text = WORLD_STRINGS;
  protected readonly demoMode = inject(DEMO_MODE);
  protected readonly demoStrings = DEMO_STRINGS;
  protected readonly world = signal<World | null>(null);
  protected readonly entrance: Entrance;

  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly router = inject(Router);
  private readonly transitions = inject(BookTransitions);
  private readonly prefetch = inject(WorldPrefetch);
  private readonly toasts = inject(ToastService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);

  constructor() {
    const fromBook = this.transitions.arrival()?.kind === 'zoom-in';
    const motion = inject(BookMotionService).motion();
    this.entrance = !fromBook ? 'none' : motion === 'fade' ? 'fade' : 'zoom';
    afterNextRender(() => void this.load());
  }

  /** Ícone do livro: o mapa encolhe de volta à página e a página desvira (docs/05 › 4). */
  protected backToLibrary(): void {
    this.transitions.expect({ kind: 'zoom-out', worldId: this.worldId() });
    void this.router.navigateByUrl('/biblioteca');
  }

  private async load(): Promise<void> {
    let world: World | null;
    try {
      world = await this.prefetch.take(this.worldId());
    } catch {
      this.leave(this.text.loadFailed);
      return;
    }
    if (!world) {
      this.leave(this.text.notFound);
      return;
    }
    this.world.set(world);
    await this.transitions.viewTransition()?.finished.catch(() => undefined);
    // Fim da transição: foco no título e anúncio (docs/05 › Regras).
    void this.announcer.announce(this.text.announce(world.name));
    afterNextRender(() => this.title().nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }

  private leave(message: string): void {
    this.toasts.show({ message, kind: 'error' });
    void this.router.navigateByUrl('/biblioteca');
  }
}
