import { imageVersionIndexAt } from '@domain/maps';
import type { Tick } from '@domain/models';
import { Container, ImageSource, Sprite, Texture } from 'pixi.js';
import type { ImageVersionInput } from '../map-engine';
import { loadBitmap } from './token-faces';

/** Fade cruzado entre versões da imagem (docs/06 › Versões da imagem no tempo). */
export const IMAGE_FADE_MS = 300;

/** Chave da imagem inicial do mapa (`maps.image_asset_id`). */
export const BASE_IMAGE = 'base';

/**
 * Qual imagem mostrar no instante e qual pré-carregar: a seguinte no sentido do movimento
 * (`direction` 1 = para a frente). `null` = nada a pré-carregar.
 */
export function planBackground(
  versions: readonly Pick<ImageVersionInput, 'id' | 'tickStart'>[],
  tick: Tick,
  direction: 1 | -1,
): { current: string; preload: string | null } {
  const index = imageVersionIndexAt(versions, tick);
  const keyAt = (i: number) => (i < 0 ? BASE_IMAGE : (versions[i]?.id ?? null));
  const next = index + direction;
  const preload = next < -1 || next >= versions.length ? null : keyAt(next);
  return { current: keyAt(index) ?? BASE_IMAGE, preload };
}

interface Loaded {
  sprite: Sprite;
  /** URL de onde veio; mudou (imagem substituída), recarrega. */
  url: string | null;
}

/**
 * Camada Background: a imagem do mapa e as versões dela no tempo. Toda imagem é esticada
 * para `maps.width × maps.height` (mesmo espaço de coordenadas). Para caber na memória da
 * GPU, ficam carregadas no máximo duas texturas: a atual e a seguinte no sentido do
 * movimento (ou a anterior, durante o fade). A imagem inicial recém-importada (bitmap sem
 * URL) não tem como ser recarregada e fica sempre carregada.
 */
export class BackgroundLayer {
  readonly container = new Container({ label: 'background-images' });

  private size = { width: 1, height: 1 };
  /** URL da imagem inicial; `null` = veio como bitmap e não pode ser liberada. */
  private baseUrl: string | null = null;
  private versions: ImageVersionInput[] = [];
  private readonly loaded = new Map<string, Loaded>();
  private readonly pending = new Map<string, Promise<Loaded | null>>();
  private shown: string | null = null;
  private wanted: string = BASE_IMAGE;
  private tick: Tick = 0;
  private direction: 1 | -1 = 1;
  private fade: { incoming: Sprite; outgoing: Sprite; elapsed: number } | null = null;
  /** Invalida carregamentos de uma cena anterior. */
  private generation = 0;

  constructor(private readonly reducedMotion: boolean) {}

  /** Nova cena: descarta tudo e mostra a imagem inicial já decodificada (se houver). */
  setBase(bitmap: ImageBitmap | null, url: string | null, size: { width: number; height: number }) {
    this.clear();
    this.size = size;
    this.baseUrl = bitmap ? url : null;
    this.versions = [];
    this.wanted = BASE_IMAGE;
    if (!bitmap) return;
    const sprite = this.createSprite(bitmap);
    this.loaded.set(BASE_IMAGE, { sprite, url });
    this.reveal(BASE_IMAGE, true);
  }

  /** Versões do mapa com a URL de cada imagem (em qualquer ordem). */
  setVersions(versions: readonly ImageVersionInput[], instant: boolean): void {
    this.versions = [...versions].sort((a, b) => a.tickStart - b.tickStart);
    const urls = new Map(this.versions.map((v) => [v.id, v.url]));
    for (const [key, entry] of this.loaded) {
      if (key === BASE_IMAGE) continue;
      const url = urls.get(key);
      // Versão removida ou com a imagem trocada: a textura antiga sai (a atual fica até a
      // nova chegar).
      if (url === undefined || url !== entry.url) {
        if (key === this.shown) entry.url = null;
        else this.release(key);
      }
    }
    this.update(instant);
  }

  setTime(tick: Tick, instant: boolean): void {
    if (tick !== this.tick) this.direction = tick > this.tick ? 1 : -1;
    this.tick = tick;
    this.update(instant);
  }

  /** Avança o fade (chamado pelo ticker do Pixi). */
  animate(deltaMs: number): void {
    const fade = this.fade;
    if (!fade) return;
    fade.elapsed += deltaMs;
    fade.incoming.alpha = Math.min(1, fade.elapsed / IMAGE_FADE_MS);
    if (fade.elapsed >= IMAGE_FADE_MS) this.finishFade();
  }

  destroy(): void {
    this.clear();
    this.container.destroy({ children: true });
  }

  private update(instant: boolean): void {
    const { current, preload } = planBackground(this.versions, this.tick, this.direction);
    this.wanted = current;
    const ready = this.loaded.get(current);
    if (ready && ready.url === this.urlOf(current)) {
      this.reveal(current, instant);
      this.trim(preload);
      return;
    }
    // A anterior continua à mostra até a nova chegar.
    void this.ensure(current).then((entry) => {
      if (!entry || this.wanted !== current) return;
      this.reveal(current, instant);
      this.trim(planBackground(this.versions, this.tick, this.direction).preload);
    });
  }

  private urlOf(key: string): string | null {
    if (key === BASE_IMAGE) return this.loaded.get(BASE_IMAGE)?.url ?? this.baseUrl;
    return this.versions.find((v) => v.id === key)?.url ?? null;
  }

  /** Carrega a imagem da chave (uma vez só, mesmo com pedidos repetidos). */
  private ensure(key: string): Promise<Loaded | null> {
    const url = this.urlOf(key);
    const existing = this.loaded.get(key);
    if (existing && existing.url === url) return Promise.resolve(existing);
    const pendingKey = `${key}|${url}`;
    const pending = this.pending.get(pendingKey);
    if (pending) return pending;
    if (!url) return Promise.resolve(null);
    const generation = this.generation;
    const load = loadBitmap(url).then(
      (bitmap) => {
        this.pending.delete(pendingKey);
        if (generation !== this.generation || this.urlOf(key) !== url) {
          bitmap.close();
          return null;
        }
        if (this.loaded.has(key) && key !== this.shown) this.release(key);
        const entry: Loaded = { sprite: this.createSprite(bitmap), url };
        if (key === this.shown) {
          // Imagem substituída da versão à mostra: troca no lugar.
          const old = this.loaded.get(key);
          this.loaded.set(key, entry);
          entry.sprite.visible = true;
          if (old) this.destroySprite(old.sprite);
          this.shown = null;
          this.reveal(key, true);
        } else {
          this.loaded.set(key, entry);
        }
        return entry;
      },
      () => {
        this.pending.delete(pendingKey);
        return null;
      },
    );
    this.pending.set(pendingKey, load);
    return load;
  }

  /** Mostra a chave já carregada, com fade cruzado sobre a anterior. */
  private reveal(key: string, instant: boolean): void {
    const entry = this.loaded.get(key);
    if (!entry || key === this.shown) return;
    // Sem `trim`: ele ainda não sabe que `key` vai ser a atual.
    this.completeFade();
    const outgoing = this.shown ? this.loaded.get(this.shown)?.sprite : undefined;
    this.shown = key;
    const { sprite } = entry;
    this.container.addChild(sprite);
    sprite.visible = true;
    if (instant || this.reducedMotion || !outgoing) {
      sprite.alpha = 1;
      if (outgoing) outgoing.visible = false;
      return;
    }
    sprite.alpha = 0;
    this.fade = { incoming: sprite, outgoing, elapsed: 0 };
  }

  private finishFade(): void {
    if (!this.completeFade()) return;
    this.trim(planBackground(this.versions, this.tick, this.direction).preload);
  }

  /** Leva o fade em curso ao fim; `false` se não havia fade. */
  private completeFade(): boolean {
    const fade = this.fade;
    if (!fade) return false;
    this.fade = null;
    fade.incoming.alpha = 1;
    fade.outgoing.visible = false;
    return true;
  }

  /**
   * Libera o que não é a atual nem a pré-carregada e pré-carrega a seguinte se couber
   * (no máximo duas texturas; durante o fade, a que sai conta como a segunda).
   */
  private trim(preload: string | null): void {
    if (this.fade) return;
    for (const key of [...this.loaded.keys()]) {
      if (key === this.shown || key === preload) continue;
      if (key === BASE_IMAGE && this.baseUrl === null) continue;
      this.release(key);
    }
    if (preload && this.loaded.size < 2) {
      void this.ensure(preload).then((entry) => {
        const now = planBackground(this.versions, this.tick, this.direction);
        if (entry && preload !== now.current && preload !== now.preload && !this.fade) {
          this.release(preload);
        }
      });
    }
  }

  private createSprite(bitmap: ImageBitmap): Sprite {
    const source = new ImageSource({
      resource: bitmap,
      autoGenerateMipmaps: true,
      scaleMode: 'linear',
    });
    const sprite = new Sprite({ texture: new Texture({ source }), label: 'map-image' });
    // Toda versão é esticada para as dimensões do mapa.
    sprite.setSize(this.size.width, this.size.height);
    sprite.visible = false;
    this.container.addChildAt(sprite, 0);
    return sprite;
  }

  private release(key: string): void {
    const entry = this.loaded.get(key);
    if (!entry) return;
    this.loaded.delete(key);
    if (this.shown === key) this.shown = null;
    this.destroySprite(entry.sprite);
  }

  private destroySprite(sprite: Sprite): void {
    const resource: unknown = sprite.texture.source.resource;
    sprite.destroy({ texture: true, textureSource: true });
    if (resource instanceof ImageBitmap) resource.close();
  }

  private clear(): void {
    this.generation++;
    this.fade = null;
    this.pending.clear();
    for (const key of [...this.loaded.keys()]) this.release(key);
    this.shown = null;
  }
}
