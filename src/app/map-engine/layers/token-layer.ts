import { evaluateKeyframes, sortKeyframes, type KeyframeSample } from '@domain/timeline';
import type { MapToken, Tick, TokenKeyframe, Uuid } from '@domain/models';
import { Container, Graphics, Sprite, type Renderer, type Texture } from 'pixi.js';
import type { EnginePalette } from '../render/engine-palette';

/** Diâmetro do token na tela, em px, com `size = 1` (fica constante no zoom). */
const TOKEN_SCREEN_SIZE = 32;

interface TokenSprite {
  token: MapToken;
  keyframes: KeyframeSample[];
  sprite: Sprite;
}

/**
 * Camada de tokens. No M1 o token é um disco com anel dourado; retratos, formas por tipo
 * e arraste chegam no M4. Sprites são reaproveitados (pool) entre recargas e o
 * `CullerPlugin` esconde os que estão fora da tela.
 */
export class TokenLayer {
  readonly container = new Container({ label: 'tokens', cullableChildren: true });
  private readonly sprites = new Map<Uuid, TokenSprite>();
  private readonly pool: Sprite[] = [];
  private texture: Texture | null = null;
  private selectedTexture: Texture | null = null;
  private selection = new Set<Uuid>();
  private tick: Tick = 0;
  private zoom = 1;

  constructor(
    private readonly renderer: Renderer,
    private readonly palette: EnginePalette,
  ) {}

  setTokens(tokens: readonly MapToken[], keyframes: readonly TokenKeyframe[]): void {
    const byToken = new Map<Uuid, TokenKeyframe[]>();
    for (const keyframe of keyframes) {
      const list = byToken.get(keyframe.tokenId) ?? [];
      list.push(keyframe);
      byToken.set(keyframe.tokenId, list);
    }
    for (const [id, entry] of this.sprites) {
      if (!tokens.some((token) => token.id === id)) this.release(id, entry);
    }
    for (const token of tokens) {
      const entry = this.sprites.get(token.id) ?? { token, keyframes: [], sprite: this.acquire() };
      entry.token = token;
      entry.keyframes = sortKeyframes(byToken.get(token.id) ?? []);
      this.sprites.set(token.id, entry);
    }
    this.update();
  }

  setTime(tick: Tick): void {
    this.tick = tick;
    this.update();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    for (const entry of this.sprites.values()) this.applyScale(entry);
  }

  setSelection(ids: readonly Uuid[]): void {
    this.selection = new Set(ids);
    for (const [id, entry] of this.sprites) {
      entry.sprite.texture = this.textureFor(this.selection.has(id));
    }
  }

  get size(): number {
    return this.sprites.size;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.texture?.destroy(true);
    this.selectedTexture?.destroy(true);
  }

  /** Reavalia a posição de cada token no instante atual (O(log n) por token). */
  private update(): void {
    for (const entry of this.sprites.values()) {
      const position = evaluateKeyframes(entry.keyframes, this.tick);
      entry.sprite.visible = position !== null;
      if (position) entry.sprite.position.set(position.x, position.y);
      this.applyScale(entry);
    }
  }

  private applyScale(entry: TokenSprite): void {
    const size = (TOKEN_SCREEN_SIZE * entry.token.size) / this.zoom;
    entry.sprite.setSize(size, size);
  }

  private acquire(): Sprite {
    const sprite = this.pool.pop() ?? new Sprite({ anchor: 0.5, cullable: true });
    sprite.texture = this.textureFor(false);
    this.container.addChild(sprite);
    return sprite;
  }

  private release(id: Uuid, entry: TokenSprite): void {
    this.container.removeChild(entry.sprite);
    this.pool.push(entry.sprite);
    this.sprites.delete(id);
  }

  /** Texturas geradas uma vez e compartilhadas por todos os tokens. */
  private textureFor(selected: boolean): Texture {
    if (selected) return (this.selectedTexture ??= this.draw(true));
    return (this.texture ??= this.draw(false));
  }

  private draw(selected: boolean): Texture {
    const radius = TOKEN_SCREEN_SIZE;
    const disc = new Graphics()
      .circle(0, 0, radius)
      .fill(this.palette.leather)
      .stroke({
        width: selected ? 6 : 4,
        color: selected ? this.palette.goldLight : this.palette.gold,
      });
    const texture = this.renderer.generateTexture({ target: disc, resolution: 2, antialias: true });
    disc.destroy();
    return texture;
  }
}
