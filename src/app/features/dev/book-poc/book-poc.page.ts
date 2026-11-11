import { JsonPipe, NgTemplateOutlet } from '@angular/common';
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
import { BOOK_POC_STRINGS } from '@core/strings/book-poc.strings';
import { buttonClasses } from '@shared/ui/button/button-styles';
import { ButtonComponent } from '@shared/ui/button/button.component';
import {
  BookAnimator,
  type BookParts,
  type BookPhase,
  type BookState,
  type BookTimings,
  type FlipVariant,
  type MotionMode,
} from './book-animator';
import { type FrameStats, measureFrames } from './frame-stats';

/** Faixas da virada curvada. */
const STRIPS = 8;
/** Latência simulada do retorno do Google. */
const LOGIN_MS = 900;

interface PhaseResult {
  readonly phase: BookPhase;
  readonly variant: FlipVariant;
  readonly mode: MotionMode;
  readonly stats: FrameStats;
}

const ANIMATING: ReadonlySet<BookState> = new Set([
  'authenticating',
  'unclasping',
  'opening',
  'turning',
]);

/** Lê um token de duração (`--wd-dur-*`) em ms. */
function tokenMs(styles: CSSStyleDeclaration, name: string, fallback: number): number {
  const value = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Prova de conceito do livro (F0-07, ADR-0011): capa → abertura → virada de
 * página, com medição de quadros por etapa. Só existe em desenvolvimento.
 */
@Component({
  selector: 'wd-book-poc-page',
  imports: [ButtonComponent, JsonPipe, NgTemplateOutlet],
  templateUrl: './book-poc.page.html',
  styleUrl: './book-poc.page.css',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export default class BookPocPage {
  protected readonly text = BOOK_POC_STRINGS;
  protected readonly copyButtonClasses = buttonClasses('primary', 'md');
  protected readonly stripIndexes = Array.from({ length: STRIPS }, (_, i) => i);
  protected readonly variants = ['rigid', 'curl'] as const satisfies readonly FlipVariant[];
  protected readonly modes = [
    'full',
    'short',
    'fade',
    'off',
  ] as const satisfies readonly MotionMode[];

  protected readonly state = signal<BookState>('closed');
  protected readonly variant = signal<FlipVariant>('curl');
  protected readonly mode = signal<MotionMode>('full');
  protected readonly results = signal<readonly PhaseResult[]>([]);
  protected readonly announcement = signal('');

  protected readonly busy = computed(() => ANIMATING.has(this.state()));
  protected readonly isOpen = computed(() => this.state() === 'open');
  protected readonly isTurned = computed(() => this.state() === 'turned');
  protected readonly showStrips = computed(
    () => this.variant() === 'curl' && this.state() === 'turning',
  );

  private readonly scene = viewChild.required<ElementRef<HTMLElement>>('scene');
  private readonly libraryHeading = viewChild.required<ElementRef<HTMLElement>>('libraryHeading');
  private readonly mapHeading = viewChild.required<ElementRef<HTMLElement>>('mapHeading');
  private readonly injector = inject(Injector);
  private animator: BookAnimator | null = null;

  constructor() {
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduce?.matches) this.mode.set('fade');

    afterNextRender(() => {
      const scene = this.scene().nativeElement;
      const styles = getComputedStyle(document.documentElement);
      const timings: BookTimings = {
        cover: tokenMs(styles, '--wd-dur-cover', 1200),
        coverShort: 500,
        page: tokenMs(styles, '--wd-dur-page', 900),
        clasp: 350,
        fade: 150,
        easePage: styles.getPropertyValue('--wd-ease-page').trim() || 'ease-in-out',
      };
      this.animator = new BookAnimator(this.parts(scene), timings, (phase, work) =>
        this.measure(phase, work),
      );
    });
    inject(DestroyRef).onDestroy(() => this.animator?.reset());
  }

  protected async signIn(): Promise<void> {
    if (!this.animator || this.state() !== 'closed') return;
    const mode = this.mode();
    this.state.set('authenticating');
    await this.animator.authenticate(
      () => new Promise((resolve) => setTimeout(resolve, LOGIN_MS)),
      mode,
    );
    await this.animator.open(mode, (state) => this.state.set(state));
    this.arrive(this.libraryHeading(), this.text.announce.library);
  }

  protected async openWorld(): Promise<void> {
    if (!this.animator || this.state() !== 'open') return;
    await this.animator.turn(this.mode(), this.variant(), (state) => this.state.set(state));
    this.arrive(this.mapHeading(), this.text.announce.map);
  }

  protected restart(): void {
    this.animator?.reset();
    this.state.set('closed');
    this.announcement.set('');
  }

  /** Clique na cena pula a animação (exceto o próprio clique que a iniciou). */
  protected onSceneClick(event: MouseEvent): void {
    if (!this.busy()) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    this.animator?.skip();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.busy() || (event.key !== 'Escape' && event.key !== 'Enter')) return;
    event.preventDefault();
    this.animator?.skip();
  }

  protected setVariant(variant: FlipVariant): void {
    this.variant.set(variant);
  }

  protected setMode(mode: MotionMode): void {
    this.mode.set(mode);
  }

  /** Ao fim de cada transição: foco no título da nova tela e anúncio (docs/05 › Regras). */
  private arrive(heading: ElementRef<HTMLElement>, message: string): void {
    this.announcement.set(message);
    // Espera o DOM tirar o `inert` da nova página antes de focar.
    afterNextRender(() => heading.nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }

  private async measure(phase: BookPhase, work: () => Promise<void>): Promise<void> {
    const { stats } = await measureFrames(work);
    const result: PhaseResult = { phase, variant: this.variant(), mode: this.mode(), stats };
    this.results.update((results) => [...results, result]);
  }

  private parts(scene: HTMLElement): BookParts {
    const one = <T extends Element>(selector: string): T => {
      const el = scene.querySelector<T>(selector);
      if (!el) throw new Error(`book-poc: ${selector} não encontrado`);
      return el;
    };
    const all = (selector: string) => Array.from(scene.querySelectorAll<HTMLElement>(selector));
    return {
      scene,
      book: one('.poc-book'),
      cover: one('.poc-cover'),
      rose: one('.poc-rose'),
      clasp: one('.poc-clasp'),
      leaf: one('.poc-leaf'),
      leafShade: one('.poc-leaf .poc-shade'),
      underShade: one('.poc-map-page .poc-shade'),
      leftShade: one('.poc-cover .poc-face-back .poc-shade'),
      strips: all('.poc-strip'),
      stripShades: all('.poc-strip > .poc-face-front .poc-shade'),
    };
  }
}
