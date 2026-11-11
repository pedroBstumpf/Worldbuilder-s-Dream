import { LiveAnnouncer } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SessionStore } from '@core/auth/session.store';
import { type BookMotion, BookMotionService } from '@core/motion/book-motion.service';
import { BookTransitions } from '@core/motion/book-transitions.service';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import { WorldPrefetch } from '@core/world/world-prefetch.service';
import type { Uuid } from '@domain/models';
import { isAppError } from '@domain/ports';
import {
  BookAnimator,
  type BookParts,
  readBookTimings,
  usesCurl,
} from '@shared/motion/book-animator';
import { watchLowFps } from '@shared/motion/low-fps';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { ToastService } from '@shared/ui/toast/toast.service';
import { type CoverError, CoverPlaqueComponent } from './cover/cover-plaque.component';
import { CreateWorldDialogComponent } from './library/create-world-dialog.component';
import { LibraryContentsComponent } from './library/library-contents.component';
import { LibraryStore, type WorldDraftInput } from './library/library.store';
import { WorldFrontispieceComponent } from './library/world-frontispiece.component';

/** Faixas da virada curvada (ADR-0011 › Decisões, item 1). */
const STRIPS = 8;

/**
 * Estados do livro. Em repouso: `closed` (capa), `open` (biblioteca), `turned` (página do
 * mapa, só durante a passagem para o mapa). Os demais são transições.
 */
type ShellState =
  'closed' | 'signing-in' | 'opening' | 'open' | 'closing' | 'turning' | 'turned' | 'returning';

/** Página do livro: `/` (capa) ou `/biblioteca`. */
type BookPage = 'cover' | 'library';

const BUSY: ReadonlySet<ShellState> = new Set([
  'signing-in',
  'opening',
  'closing',
  'turning',
  'returning',
]);
const COVER_CLOSED: ReadonlySet<ShellState> = new Set(['closed', 'signing-in', 'opening']);
const LEAF_TURNED: ReadonlySet<ShellState> = new Set(['turned', 'returning']);
const SKIP_KEYS = new Set(['Escape', 'Enter']);

/**
 * O livro (ADR-0011): um único objeto 3D persistente entre a capa (`/`) e a biblioteca
 * (`/biblioteca`). As rotas-filhas só escolhem a página; as transições (abrir,
 * fechar, virar a página) acontecem aqui, e a passagem para o mapa termina com a View
 * Transition `wd-world-map`. Rotas acessadas diretamente abrem sem animação.
 */
@Component({
  selector: 'wd-book-shell',
  imports: [
    CoverPlaqueComponent,
    IconButtonComponent,
    LibraryContentsComponent,
    NgTemplateOutlet,
    WorldFrontispieceComponent,
  ],
  providers: [LibraryStore],
  templateUrl: './book-shell.component.html',
  styleUrl: './book-shell.component.css',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export default class BookShellComponent {
  protected readonly text = BOOK_STRINGS;
  protected readonly library = inject(LibraryStore);
  /** Miniatura do mapa do mundo escolhido (frontispício e página do mapa). */
  protected readonly selectedCover = computed(() => {
    const world = this.library.selected();
    return world ? (this.library.coverUrls()[world.id] ?? null) : null;
  });
  protected readonly session = inject(SessionStore);
  protected readonly stripIndexes = Array.from({ length: STRIPS }, (_, i) => i);

  protected readonly state = signal<ShellState>('closed');
  protected readonly coverError = signal<CoverError | null>(null);
  /** Movimento da transição em curso (a virada curvada só existe nas completas). */
  private readonly runningMotion = signal<BookMotion>('full');

  protected readonly busy = computed(() => BUSY.has(this.state()));
  protected readonly coverOpen = computed(() => !COVER_CLOSED.has(this.state()));
  protected readonly leafTurned = computed(() => LEAF_TURNED.has(this.state()));
  protected readonly showStrips = computed(
    () =>
      (this.state() === 'turning' || this.state() === 'returning') &&
      usesCurl(this.runningMotion()),
  );
  protected readonly ownerName = computed(() => this.session.user()?.displayName ?? '');

  private readonly scene = viewChild.required<ElementRef<HTMLElement>>('scene');
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly motion = inject(BookMotionService);
  private readonly transitions = inject(BookTransitions);
  private readonly prefetch = inject(WorldPrefetch);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly announcer = inject(LiveAnnouncer);
  private animator: BookAnimator | null = null;
  /** Uma ação do próprio livro está em curso: a troca de rota que ela causa não é "externa". */
  private acting = false;

  constructor() {
    const arrival = this.transitions.arrival();
    const page = this.page();
    if (page === 'library') {
      void this.library.load();
      if (arrival?.kind === 'zoom-out') {
        this.library.select(arrival.worldId);
        this.state.set('turned');
      } else if (arrival?.kind !== 'resume') {
        this.state.set('open');
      }
    }

    afterNextRender(() => {
      this.animator = new BookAnimator(this.parts(), readBookTimings(), () => this.watchFps());
      if (page === 'library' && arrival?.kind === 'resume') void this.resume();
      else if (arrival?.kind === 'zoom-out') void this.returnFromMap();
    });

    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd && !this.acting) this.syncWithRoute();
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.animator?.cancel();
    });
  }

  protected async signIn(): Promise<void> {
    if (!this.animator || this.state() !== 'closed') return;
    const motion = this.startAction();
    this.coverError.set(null);
    this.state.set('signing-in');
    try {
      await this.animator.spinRose(() => this.session.signIn(), motion);
    } catch (error) {
      this.coverError.set(isAppError(error, 'not_allowed') ? 'not_allowed' : 'failed');
      this.state.set('closed');
      this.acting = false;
      return;
    }
    void this.library.load();
    this.state.set('opening');
    await this.animator.open(motion);
    await this.settle('open');
    await this.router.navigateByUrl('/biblioteca');
    this.finishAction('library');
  }

  protected async signOut(): Promise<void> {
    if (!this.animator || this.state() !== 'open') return;
    const motion = this.startAction();
    this.state.set('closing');
    await this.animator.close(motion);
    await this.session.signOut();
    await this.settle('closed');
    await this.router.navigateByUrl('/');
    this.finishAction('cover');
  }

  /** "Abrir mundo": carrega já, vira a página e dá o zoom até o mapa. */
  protected async openWorld(id: Uuid): Promise<void> {
    if (!this.animator || this.state() !== 'open') return;
    this.prefetch.prefetch(id).catch(() => undefined);
    this.library.select(id);
    const motion = this.startAction();
    this.state.set('turning');
    await this.animator.turnPage('forward', motion);
    await this.settle('turned');
    this.transitions.expect({ kind: 'zoom-in', worldId: id });
    const navigated = await this.router.navigate(['/w', id]);
    // Navegação recusada (ex.: sessão expirou): o livro volta a ficar aberto.
    if (!navigated) {
      await this.settle('open');
      this.acting = false;
    }
  }

  protected async createWorld(): Promise<void> {
    if (this.state() !== 'open') return;
    const ref = this.dialogs.open<CreateWorldDialogComponent, unknown, WorldDraftInput>(
      CreateWorldDialogComponent,
      { autoFocus: 'first-tabbable' },
    );
    const draft = await new Promise<WorldDraftInput | undefined>((resolve) =>
      ref.closed.subscribe(resolve),
    );
    if (!draft) return;
    try {
      const world = await this.library.create(draft);
      await this.openWorld(world.id);
    } catch {
      this.toasts.show({ message: this.text.createWorld.failed, kind: 'error' });
    }
  }

  /** Clique ou toque na cena pula a animação (menos o clique que a iniciou). */
  protected onSceneClick(event: MouseEvent): void {
    if (!this.busy()) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    this.animator?.skip();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.busy() || !SKIP_KEYS.has(event.key)) return;
    event.preventDefault();
    this.animator?.skip();
  }

  /** Sessão válida ao abrir "/": abertura curta, sem o fecho (docs/05 › Regras). */
  private async resume(): Promise<void> {
    if (!this.animator) return;
    const motion = this.startAction();
    this.state.set('opening');
    await this.animator.open(motion === 'fade' ? 'fade' : 'short', { clasp: false });
    await this.settle('open');
    this.finishAction('library');
  }

  /** Volta do mapa: espera o zoom de saída e desvira a página. */
  private async returnFromMap(): Promise<void> {
    if (!this.animator) return;
    const motion = this.startAction();
    await this.transitions.viewTransition()?.finished.catch(() => undefined);
    this.state.set('returning');
    await this.animator.turnPage('back', motion);
    await this.settle('open');
    this.finishAction('library');
  }

  /** Troca de rota que não veio do livro (botão voltar, guard): sem animação. */
  private syncWithRoute(): void {
    const page = this.page();
    if (page === 'library' && this.state() === 'closed') {
      void this.library.load();
      void this.settle('open');
    } else if (page === 'cover' && this.state() !== 'closed') {
      this.coverError.set(null);
      void this.settle('closed');
    }
  }

  /** Página da URL de destino (durante a navegação, `router.url` ainda é a anterior). */
  private page(): BookPage {
    const target = this.router.currentNavigation()?.finalUrl;
    const url = target ? this.router.serializeUrl(target) : this.router.url;
    return url.startsWith('/biblioteca') ? 'library' : 'cover';
  }

  private startAction(): BookMotion {
    this.acting = true;
    const motion = this.motion.motion();
    this.runningMotion.set(motion);
    return motion;
  }

  /** Fim de uma transição: foco no título da nova tela e anúncio (docs/05 › Regras). */
  private finishAction(page: BookPage): void {
    this.acting = false;
    const id = page === 'library' ? 'wd-library-title' : 'wd-cover-title';
    void this.announcer.announce(
      page === 'library' ? this.text.announce.library : this.text.announce.cover,
    );
    // O `inert` da nova página só sai no ciclo de renderização seguinte.
    afterNextRender(
      () => this.scene().nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus(),
      { injector: this.injector },
    );
  }

  /** Muda o estado em repouso; depois que o CSS o pinta, tira os estilos inline. */
  private settle(state: ShellState): Promise<void> {
    this.state.set(state);
    return new Promise((resolve) =>
      afterNextRender(
        () => {
          this.animator?.clear();
          resolve();
        },
        { injector: this.injector },
      ),
    );
  }

  private watchFps(): void {
    void watchLowFps().then((low) => {
      if (low) this.motion.reportLowFps();
    });
  }

  private parts(): BookParts {
    const scene = this.scene().nativeElement;
    const one = <T extends Element>(selector: string): T => {
      const el = scene.querySelector<T>(selector);
      if (!el) throw new Error(`book-shell: ${selector} não encontrado`);
      return el;
    };
    const all = (selector: string) => Array.from(scene.querySelectorAll<HTMLElement>(selector));
    return {
      scene,
      book: one('.book'),
      cover: one('.cover'),
      rose: one('.rose'),
      clasp: one('.clasp'),
      leaf: one('.leaf'),
      leafShade: one('.leaf .shade'),
      underShade: one('.map-page .shade'),
      leftShade: one('.cover > .face-back .shade'),
      strips: all('.strip'),
      stripShades: all('.strip > .face-front .shade'),
    };
  }
}
