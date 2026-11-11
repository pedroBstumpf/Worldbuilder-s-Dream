/**
 * Orquestrador da prova de conceito do livro (F0-07, ADR-0011). Cada etapa
 * devolve uma Promise e pode ser pulada. Só anima `transform` e `opacity`,
 * com Web Animations API e `will-change` apenas durante a animação.
 * O `BookAnimator` definitivo (F0-08/F1-12) parte deste rascunho.
 */

export type BookState =
  'closed' | 'authenticating' | 'unclasping' | 'opening' | 'open' | 'turning' | 'turned';

/** completas / curtas / fade (movimento reduzido) / desligadas. */
export type MotionMode = 'full' | 'short' | 'fade' | 'off';

/** Virada rígida (um plano) ou curvada (faixas encadeadas). */
export type FlipVariant = 'rigid' | 'curl';

export type BookPhase = 'unclasping' | 'opening' | 'turning' | 'fade';

export interface BookParts {
  readonly scene: HTMLElement;
  readonly book: HTMLElement;
  readonly cover: HTMLElement;
  readonly rose: Element;
  readonly clasp: HTMLElement;
  readonly leaf: HTMLElement;
  readonly leafShade: HTMLElement;
  readonly underShade: HTMLElement;
  readonly leftShade: HTMLElement;
  /** Faixas da virada curvada, da lombada para a borda (cada uma filha da anterior). */
  readonly strips: readonly HTMLElement[];
  readonly stripShades: readonly HTMLElement[];
}

export interface BookTimings {
  readonly cover: number;
  readonly coverShort: number;
  readonly page: number;
  readonly clasp: number;
  readonly fade: number;
  readonly easePage: string;
}

/** Executa uma etapa; a página usa este gancho para medir os quadros. */
export type PhaseRunner = (phase: BookPhase, work: () => Promise<void>) => Promise<void>;

const CLOSED_BOOK = 'translateX(-25%)';
const OPEN_BOOK = 'translateX(0)';
const CLASP_REST = 'translateY(-50%) translateZ(4px)';
/** Curvatura máxima entre faixas vizinhas, em graus. */
const CURL_DEG = 7;

export class BookAnimator {
  private readonly running = new Set<Animation>();
  private skipping = false;
  private spin: Animation | null = null;

  constructor(
    private readonly parts: BookParts,
    private readonly timings: BookTimings,
    private readonly runPhase: PhaseRunner,
  ) {}

  /** Leva todas as animações em curso (e as próximas da sequência) ao estado final. */
  skip(): void {
    this.skipping = true;
    for (const animation of this.running) animation.finish();
  }

  /** Gira a rosa dos ventos enquanto a sessão é finalizada. */
  async authenticate(login: () => Promise<void>, mode: MotionMode): Promise<void> {
    if (mode === 'full' || mode === 'short') {
      this.spin = this.parts.rose.animate(
        [{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }],
        { duration: 2400, iterations: Infinity },
      );
    }
    try {
      await login();
    } finally {
      // Para onde está, sem voltar ao ângulo inicial.
      this.spin?.pause();
      this.spin?.commitStyles();
      this.spin?.cancel();
      this.spin = null;
    }
  }

  /** Fecho solta (só nas completas) e a capa abre girando em torno da lombada. */
  async open(mode: MotionMode, onState: (state: BookState) => void): Promise<void> {
    const { cover, book, clasp } = this.parts;
    const { easePage } = this.timings;
    const instant = mode === 'off' || mode === 'fade';
    const work = async () => {
      onState('unclasping');
      const claspMs = mode === 'full' ? this.timings.clasp : 0;
      await this.runPhaseUnless(instant || claspMs === 0, 'unclasping', () =>
        this.play(
          clasp,
          [
            { transform: CLASP_REST, opacity: 1 },
            { transform: `${CLASP_REST} translateX(28px) rotate(10deg)`, opacity: 0 },
          ],
          { duration: claspMs, easing: 'ease-in' },
        ),
      );
      onState('opening');
      const coverMs = mode === 'full' ? this.timings.cover : this.timings.coverShort;
      await this.runPhaseUnless(instant, 'opening', async () => {
        await Promise.all([
          this.play(cover, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], {
            duration: coverMs,
            easing: easePage,
          }),
          this.play(book, [{ transform: CLOSED_BOOK }, { transform: OPEN_BOOK }], {
            duration: coverMs,
            easing: easePage,
          }),
        ]);
      });
    };
    await this.sequence(mode, work);
    onState('open');
  }

  /** A página direita vira para a esquerda, revelando o mapa. */
  async turn(mode: MotionMode, variant: FlipVariant, onState: (s: BookState) => void) {
    const instant = mode === 'off' || mode === 'fade';
    await this.sequence(mode, async () => {
      onState('turning');
      await this.runPhaseUnless(instant, 'turning', () =>
        variant === 'curl' ? this.turnCurl() : this.turnRigid(),
      );
      // Ao fim, a folha "de verdade" fica virada e as faixas somem.
      await this.play(this.parts.leaf, [{ transform: 'rotateY(-180deg)' }], { duration: 0 });
    });
    onState('turned');
  }

  /** Volta ao livro fechado, sem animação. */
  reset(): void {
    for (const animation of this.running) animation.cancel();
    this.running.clear();
    this.spin?.cancel();
    this.spin = null;
    this.skipping = false;
    const { strips, stripShades, ...single } = this.parts;
    for (const el of [...Object.values(single), ...strips, ...stripShades]) {
      if (el instanceof HTMLElement || el instanceof SVGElement) {
        el.style.removeProperty('transform');
        el.style.removeProperty('opacity');
        el.style.removeProperty('will-change');
      }
    }
  }

  private turnRigid(): Promise<void> {
    const { leaf, leafShade, underShade, leftShade } = this.parts;
    const options = { duration: this.timings.page, easing: this.timings.easePage };
    return this.all([
      this.play(leaf, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], options),
      ...this.shades(leafShade, underShade, leftShade),
    ]);
  }

  private turnCurl(): Promise<void> {
    const { strips, stripShades, underShade, leftShade } = this.parts;
    const { page, easePage } = this.timings;
    const [spine, ...rest] = strips;
    if (!spine) return Promise.resolve();
    return this.all([
      this.play(spine, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], {
        duration: page,
        easing: easePage,
      }),
      // Cada faixa dobra um pouco em relação à anterior: a borda lidera na subida
      // e fica para trás na descida; no fim, a curvatura volta a zero.
      ...rest.map((strip) =>
        this.play(
          strip,
          [
            { transform: 'rotateY(0deg)', offset: 0 },
            { transform: `rotateY(${-CURL_DEG}deg)`, offset: 0.35 },
            { transform: `rotateY(${CURL_DEG * 0.5}deg)`, offset: 0.75 },
            { transform: 'rotateY(0deg)', offset: 1 },
          ],
          { duration: page, easing: 'ease-in-out' },
        ),
      ),
      ...stripShades.map((shade, i) =>
        this.play(
          shade,
          [
            { opacity: 0, offset: 0 },
            { opacity: 0.1 + (0.35 * i) / stripShades.length, offset: 0.45 },
            { opacity: 0, offset: 1 },
          ],
          { duration: page, easing: 'linear' },
        ),
      ),
      ...this.shades(null, underShade, leftShade),
    ]);
  }

  /** Sombra na folha, na página revelada e na página onde a folha pousa. */
  private shades(leaf: HTMLElement | null, under: HTMLElement, left: HTMLElement) {
    const options = { duration: this.timings.page, easing: 'linear' };
    return [
      leaf
        ? this.play(leaf, [{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }], options)
        : Promise.resolve(),
      this.play(under, [{ opacity: 0.7 }, { opacity: 0 }], options),
      this.play(
        left,
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.5 },
          { opacity: 0.5, offset: 0.8 },
          { opacity: 0, offset: 1 },
        ],
        options,
      ),
    ];
  }

  /** Fade: troca de estado escondida sob um fade cruzado curto. */
  private async sequence(mode: MotionMode, work: () => Promise<void>): Promise<void> {
    // Um pulo pedido durante o login vale para a sequência inteira.
    this.skipping ||= mode === 'off' || mode === 'fade';
    try {
      if (mode !== 'fade') {
        await work();
        return;
      }
      const half = { duration: this.timings.fade / 2, easing: 'linear' };
      const { scene } = this.parts;
      await this.runPhase('fade', async () => {
        this.skipping = false;
        await this.play(scene, [{ opacity: 1 }, { opacity: 0 }], half);
        this.skipping = true;
        await work();
        this.skipping = false;
        await this.play(scene, [{ opacity: 0 }, { opacity: 1 }], half);
      });
    } finally {
      this.skipping = false;
    }
  }

  private runPhaseUnless(skip: boolean, phase: BookPhase, work: () => Promise<void>) {
    return skip ? work() : this.runPhase(phase, work);
  }

  private async all(promises: Promise<void>[]): Promise<void> {
    await Promise.all(promises);
  }

  /** Toca keyframes e grava o estado final como estilo inline (sem `fill` acumulado). */
  private async play(
    el: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ): Promise<void> {
    const style = (el as HTMLElement).style;
    const animation = el.animate(keyframes, { ...options, fill: 'forwards' });
    this.running.add(animation);
    // Só a propriedade animada: `will-change: opacity` achata o preserve-3d
    // (o verso das faixas some e a frente aparece espelhada).
    style.willChange = keyframes.some((frame) => 'transform' in frame) ? 'transform' : 'opacity';
    if (this.skipping) animation.finish();
    try {
      await animation.finished;
      animation.commitStyles();
      animation.cancel();
    } catch {
      // Cancelada por reset(): o estado é limpo lá.
    } finally {
      this.running.delete(animation);
      style.removeProperty('will-change');
    }
  }
}
