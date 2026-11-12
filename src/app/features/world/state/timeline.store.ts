import { computed, inject } from '@angular/core';
import type { Tick } from '@domain/models';
import {
  clampTick,
  clampView,
  eventWindow,
  fullView,
  panView,
  precisionFor,
  revealTick,
  stepTick,
  ticksPerSecond,
  zoomView,
  type PlaySpeed,
  type TimelineView,
} from '@domain/timeline';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { WorldStore } from './world.store';

interface TimelineState {
  readonly currentTick: Tick;
  readonly view: TimelineView;
  /** Largura do trilho em px (define a precisão e a janela dos eventos). */
  readonly width: number;
  readonly isPlaying: boolean;
  readonly speed: PlaySpeed;
  readonly loop: boolean;
}

/** Quadro mais longo considerado no play (aba em segundo plano, depurador…). */
const MAX_FRAME_MS = 100;

/**
 * Linha do tempo do mundo aberto (docs/06 §7): instante atual, faixa visível, zoom, play
 * e velocidade. O calendário e a faixa do mundo vêm da `WorldStore`. O play usa
 * `requestAnimationFrame` e avança `currentTick` pelo tempo real × velocidade.
 */
export const TimelineStore = signalStore(
  withState<TimelineState>({
    currentTick: 0,
    view: { start: 0, end: 1 },
    width: 800,
    isPlaying: false,
    speed: { amount: 1, unit: 'year' },
    loop: false,
  }),
  withComputed(({ view, width }, world = inject(WorldStore)) => {
    const ticksPerPixel = computed(() => (view().end - view().start) / Math.max(width(), 1));
    return {
      calendar: world.calendar,
      range: world.range,
      ticksPerPixel,
      /** Unidade do cursor (passo do teclado, snap e etiqueta de data). */
      precision: computed(() => precisionFor(world.calendar(), ticksPerPixel())),
      /** Quanto um evento pontual continua visível depois do início. */
      eventWindow: computed(() => eventWindow(world.calendar(), view(), width())),
    };
  }),
  withComputed(({ calendar, currentTick, precision }) => ({
    /** Data do cursor no calendário do mundo, na precisão do zoom. */
    label: computed(() => calendar().format(currentTick(), precision())),
  })),
  withMethods((store) => {
    let frame = 0;
    let last = 0;

    const setTick = (tick: Tick) =>
      patchState(store, { currentTick: clampTick(tick, store.range()) });

    const stop = () => {
      cancelAnimationFrame(frame);
      patchState(store, { isPlaying: false });
    };

    /** Avança o play por `ms` de tempo real. */
    const advance = (ms: number) => {
      const range = store.range();
      const delta =
        (Math.min(ms, MAX_FRAME_MS) / 1000) * ticksPerSecond(store.calendar(), store.speed());
      let next = store.currentTick() + Math.max(1, Math.round(delta));
      if (next >= range.end) {
        if (store.loop()) {
          next = range.start;
        } else {
          next = range.end;
          stop();
        }
      }
      patchState(store, {
        currentTick: next,
        view: revealTick(store.view(), next, range, store.calendar()),
      });
    };

    const loop = (now: number) => {
      if (!store.isPlaying()) return;
      advance(now - last);
      last = now;
      if (store.isPlaying()) frame = requestAnimationFrame(loop);
    };

    const play = () => {
      if (store.isPlaying()) return;
      const range = store.range();
      if (store.currentTick() >= range.end) setTick(range.start);
      patchState(store, { isPlaying: true });
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };

    return {
      advance,

      /** Instante inicial: `?t=` da URL, o "agora da narrativa" ou o início do mundo. */
      init(tick: Tick | null, nowTick: Tick | null): void {
        const range = store.range();
        patchState(store, {
          currentTick: clampTick(tick ?? nowTick ?? range.start, range),
          view: fullView(range, store.calendar()),
        });
      },

      /** A faixa do mundo mudou: mantém o cursor e a faixa visível dentro dela. */
      syncRange(): void {
        const range = store.range();
        patchState(store, {
          currentTick: clampTick(store.currentTick(), range),
          view: clampView(store.view(), range, store.calendar()),
        });
      },

      setWidth(width: number): void {
        if (width > 0 && width !== store.width()) patchState(store, { width });
      },

      setTick,

      /** Move o cursor e desloca a faixa visível, se preciso, para mostrá-lo. */
      seek(tick: Tick): void {
        setTick(tick);
        patchState(store, {
          view: revealTick(store.view(), store.currentTick(), store.range(), store.calendar()),
        });
      },

      /** Passo do teclado (setas; Shift: passo grande). */
      step(direction: 1 | -1, big = false): void {
        const next = stepTick(
          store.calendar(),
          store.currentTick(),
          store.precision(),
          direction,
          big,
        );
        setTick(next);
        patchState(store, {
          view: revealTick(store.view(), store.currentTick(), store.range(), store.calendar()),
        });
      },

      /** Zoom em torno de `anchor` (padrão: o cursor). `factor > 1` afasta. */
      zoom(factor: number, anchor: Tick = store.currentTick()): void {
        patchState(store, {
          view: zoomView(store.view(), factor, anchor, store.range(), store.calendar()),
        });
      },

      pan(delta: number): void {
        patchState(store, { view: panView(store.view(), delta, store.range(), store.calendar()) });
      },

      /** Mostra a faixa do mundo inteira. */
      showAll(): void {
        patchState(store, { view: fullView(store.range(), store.calendar()) });
      },

      play,

      pause: stop,

      toggle(): void {
        if (store.isPlaying()) stop();
        else play();
      },

      setSpeed(speed: PlaySpeed): void {
        patchState(store, { speed });
      },

      setLoop(loop: boolean): void {
        patchState(store, { loop });
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store.pause();
    },
  }),
);
