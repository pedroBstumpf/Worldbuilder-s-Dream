/**
 * Animações do livro (ADR-0011, docs/05 › Transições do livro), a partir da prova de
 * conceito da F0-07. Cada etapa devolve uma Promise e pode ser pulada (`skip()`).
 * Só anima `transform` e `opacity`, com a Web Animations API; `will-change` só durante
 * a animação e só na propriedade animada (`will-change: opacity` achata o preserve-3d).
 *
 * O estado em repouso (capa fechada ou aberta, folha virada ou não) vem do CSS do
 * componente; o animador grava o estado final como estilo inline (`commitStyles`) e,
 * depois que o componente pinta o novo estado, `clear()` devolve o controle ao CSS.
 * O zoom até o mapa não passa por aqui: é a View Transition `wd-world-map`.
 */

/** completas / curtas (fps baixo) / fade cruzado (movimento reduzido). */
export type BookMotion = 'full' | 'short' | 'fade';

export type TurnDirection = 'forward' | 'back';

export interface BookParts {
  /** Cena inteira: some e volta no fade cruzado. */
  readonly scene: HTMLElement;
  readonly book: HTMLElement;
  readonly cover: HTMLElement;
  /** Rosa dos ventos da capa: gira enquanto o login termina. */
  readonly rose: Element;
  readonly clasp: HTMLElement;
  /** Folha direita (frontispício), interativa. */
  readonly leaf: HTMLElement;
  readonly leafShade: HTMLElement;
  /** Sombra sobre a página revelada pela folha. */
  readonly underShade: HTMLElement;
  /** Sombra sobre a página esquerda, onde a folha pousa. */
  readonly leftShade: HTMLElement;
  /** Faixas da virada curvada, da lombada para a borda (cada uma filha da anterior). */
  readonly strips: readonly HTMLElement[];
  readonly stripShades: readonly HTMLElement[];
}

export interface BookTimings {
  readonly cover: number;
  readonly coverShort: number;
  readonly page: number;
  readonly pageShort: number;
  readonly clasp: number;
  readonly fade: number;
  readonly easePage: string;
}

/** Virada curvada nas completas; a rígida (um plano só) fica para a versão curta. */
export function usesCurl(motion: BookMotion): boolean {
  return motion === 'full';
}

/** Lê os tokens de movimento (`--wd-dur-*`, `--wd-ease-page`) do documento. */
export function readBookTimings(root: Element = document.documentElement): BookTimings {
  const styles = getComputedStyle(root);
  const ms = (name: string, fallback: number) => {
    const value = Number.parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    cover: ms('--wd-dur-cover', 1200),
    coverShort: ms('--wd-dur-cover-short', 500),
    page: ms('--wd-dur-page', 900),
    pageShort: ms('--wd-dur-page-short', 450),
    clasp: ms('--wd-dur-clasp', 350),
    fade: ms('--wd-dur-fade', 150),
    easePage: styles.getPropertyValue('--wd-ease-page').trim() || 'ease-in-out',
  };
}

const CLOSED_BOOK = 'translateX(-25%)';
const OPEN_BOOK = 'translateX(0)';
const CLASP_REST = 'translateY(-50%) translateZ(4px)';
const CLASP_LOOSE = `${CLASP_REST} translateX(28px) rotate(10deg)`;
const FLAT = 'rotateY(0deg)';
const TURNED = 'rotateY(-180deg)';
/** Curvatura máxima entre faixas vizinhas, em graus. */
const CURL_DEG = 7;

export class BookAnimator {
  private readonly running = new Set<Animation>();
  private skipping = false;
  private spin: Animation | null = null;

  /**
   * @param onAnimate chamado no início de cada etapa realmente animada (não pulada);
   *   o livro usa para observar os primeiros quadros (detecção de fps baixo).
   */
  constructor(
    private readonly parts: BookParts,
    private readonly timings: BookTimings,
    private readonly onAnimate: () => void = () => undefined,
  ) {}

  /** Leva a animação em curso (e o resto da sequência) ao estado final. */
  skip(): void {
    this.skipping = true;
    for (const animation of this.running) animation.finish();
  }

  /** Gira a rosa dos ventos enquanto `work` (o login) não termina. */
  async spinRose<T>(work: () => Promise<T>, motion: BookMotion): Promise<T> {
    if (motion !== 'fade') {
      this.spin = this.parts.rose.animate(
        [{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }],
        { duration: 2400, iterations: Infinity },
      );
    }
    try {
      return await work();
    } finally {
      // A rosa volta ao ângulo inicial sem salto visível: some sob a capa que abre.
      this.spin?.cancel();
      this.spin = null;
    }
  }

  /** Fecho solta (completas, se `clasp`) e a capa abre girando em torno da lombada. */
  open(motion: BookMotion, { clasp = true } = {}): Promise<void> {
    const { cover, book } = this.parts;
    return this.sequence(motion, async () => {
      await this.moveClasp(motion === 'full' && clasp, 'loose');
      const options = this.coverOptions(motion);
      await this.phase(motion === 'fade', () =>
        Promise.all([
          this.play(cover, [{ transform: FLAT }, { transform: TURNED }], options),
          this.play(book, [{ transform: CLOSED_BOOK }, { transform: OPEN_BOOK }], options),
        ]),
      );
    });
  }

  /** A capa gira de volta e o fecho prende (o livro fecha). */
  close(motion: BookMotion): Promise<void> {
    const { cover, book } = this.parts;
    return this.sequence(motion, async () => {
      const options = this.coverOptions(motion);
      await this.phase(motion === 'fade', () =>
        Promise.all([
          this.play(cover, [{ transform: TURNED }, { transform: FLAT }], options),
          this.play(book, [{ transform: OPEN_BOOK }, { transform: CLOSED_BOOK }], options),
        ]),
      );
      await this.moveClasp(motion === 'full', 'rest');
    });
  }

  /**
   * A folha direita vira para a esquerda (`forward`) ou volta (`back`).
   * Na virada curvada o componente mostra as faixas e esconde a folha enquanto ela dura.
   */
  turnPage(direction: TurnDirection, motion: BookMotion): Promise<void> {
    const curl = usesCurl(motion);
    return this.sequence(motion, async () => {
      await this.phase(motion === 'fade', () =>
        curl ? this.turnCurl(direction) : this.turnRigid(direction),
      );
      // A folha "de verdade" assume a posição final; as faixas somem.
      await this.set(this.parts.leaf, { transform: direction === 'forward' ? TURNED : FLAT });
    });
  }

  /** Devolve o estado em repouso ao CSS (depois de o componente pintar o novo estado). */
  clear(): void {
    for (const el of this.elements()) {
      el.style.removeProperty('transform');
      el.style.removeProperty('opacity');
      el.style.removeProperty('will-change');
    }
  }

  /** Interrompe tudo (componente destruído). */
  cancel(): void {
    for (const animation of this.running) animation.cancel();
    this.running.clear();
    this.spin?.cancel();
    this.spin = null;
    this.skipping = false;
  }

  private coverOptions(motion: BookMotion): KeyframeAnimationOptions {
    const duration = motion === 'full' ? this.timings.cover : this.timings.coverShort;
    return { duration, easing: this.timings.easePage };
  }

  private moveClasp(animate: boolean, to: 'loose' | 'rest'): Promise<void> {
    const rest = { transform: CLASP_REST, opacity: 1 };
    const loose = { transform: CLASP_LOOSE, opacity: 0 };
    const [from, target] = to === 'loose' ? [rest, loose] : [loose, rest];
    const frames = [from, target];
    if (!animate) return this.set(this.parts.clasp, target);
    return this.phase(false, () =>
      this.play(this.parts.clasp, frames, {
        duration: this.timings.clasp,
        easing: to === 'loose' ? 'ease-in' : 'ease-out',
      }),
    );
  }

  private turnRigid(direction: TurnDirection): Promise<void> {
    const { leaf, leafShade, underShade, leftShade } = this.parts;
    const options = this.pageOptions(this.timings.pageShort, direction, this.timings.easePage);
    return this.all([
      this.play(leaf, [{ transform: FLAT }, { transform: TURNED }], options),
      ...this.shades(leafShade, underShade, leftShade, this.timings.pageShort, direction),
    ]);
  }

  private turnCurl(direction: TurnDirection): Promise<void> {
    const { strips, stripShades, underShade, leftShade } = this.parts;
    const { page, easePage } = this.timings;
    const [spine, ...rest] = strips;
    if (!spine) return Promise.resolve();
    return this.all([
      this.play(
        spine,
        [{ transform: FLAT }, { transform: TURNED }],
        this.pageOptions(page, direction, easePage),
      ),
      // Cada faixa dobra um pouco em relação à anterior: a borda lidera na subida
      // e fica para trás na descida; no fim, a curvatura volta a zero.
      ...rest.map((strip) =>
        this.play(
          strip,
          [
            { transform: FLAT, offset: 0 },
            { transform: `rotateY(${-CURL_DEG}deg)`, offset: 0.35 },
            { transform: `rotateY(${CURL_DEG * 0.5}deg)`, offset: 0.75 },
            { transform: FLAT, offset: 1 },
          ],
          this.pageOptions(page, direction, 'ease-in-out'),
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
          this.pageOptions(page, direction, 'linear'),
        ),
      ),
      ...this.shades(null, underShade, leftShade, page, direction),
    ]);
  }

  /** Sombra na folha, na página revelada e na página onde a folha pousa. */
  private shades(
    leaf: HTMLElement | null,
    under: HTMLElement,
    left: HTMLElement,
    duration: number,
    direction: TurnDirection,
  ): Promise<void>[] {
    const options = this.pageOptions(duration, direction, 'linear');
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

  /** Voltar a página é a virada tocada de trás para a frente. */
  private pageOptions(
    duration: number,
    direction: TurnDirection,
    easing: string,
  ): KeyframeAnimationOptions {
    return { duration, easing, direction: direction === 'forward' ? 'normal' : 'reverse' };
  }

  /** Fade: a troca de estado acontece, instantânea, sob um fade cruzado curto da cena. */
  private async sequence(motion: BookMotion, work: () => Promise<void>): Promise<void> {
    try {
      if (motion !== 'fade') {
        await work();
        return;
      }
      const half = { duration: this.timings.fade / 2, easing: 'linear' };
      const { scene } = this.parts;
      await this.play(scene, [{ opacity: 1 }, { opacity: 0 }], half);
      const skipping = this.skipping;
      this.skipping = true;
      await work();
      this.skipping = skipping;
      await this.play(scene, [{ opacity: 0 }, { opacity: 1 }], half);
      this.clearElement(scene);
    } finally {
      this.skipping = false;
    }
  }

  /** Etapa animada: avisa `onAnimate` (fps), a menos que seja instantânea ou pulada. */
  private async phase(instant: boolean, work: () => Promise<unknown>): Promise<void> {
    if (!instant && !this.skipping) this.onAnimate();
    await work();
  }

  private async all(promises: Promise<void>[]): Promise<void> {
    await Promise.all(promises);
  }

  private set(el: HTMLElement, frame: Keyframe): Promise<void> {
    return this.play(el, [frame], { duration: 0 });
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
      // Cancelada por cancel(): o componente foi destruído.
    } finally {
      this.running.delete(animation);
      style.removeProperty('will-change');
    }
  }

  private clearElement(el: HTMLElement): void {
    el.style.removeProperty('transform');
    el.style.removeProperty('opacity');
  }

  private elements(): HTMLElement[] {
    const { strips, stripShades, rose, ...single } = this.parts;
    const roseEl = rose instanceof HTMLElement ? [rose] : [];
    return [...Object.values(single), ...strips, ...stripShades, ...roseEl];
  }
}
