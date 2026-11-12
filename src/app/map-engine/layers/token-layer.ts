import type { Point } from '@domain/geometry';
import type { MapToken, Tick, TokenKeyframe, Uuid } from '@domain/models';
import { evaluateKeyframes, sortKeyframes, type KeyframeSample } from '@domain/timeline';
import {
  Container,
  Graphics,
  Sprite,
  Text,
  type FederatedPointerEvent,
  type Renderer,
} from 'pixi.js';
import type { TokenLook } from '../map-engine';
import type { EnginePalette } from '../render/engine-palette';
import { FACE_SIZE, TokenFaces } from './token-faces';

/** Diâmetro do token na tela, em px, com `size = 1` (fica constante no zoom). */
const TOKEN_SCREEN_SIZE = 32;
/** A partir deste zoom os nomes aparecem sempre; abaixo, só no hover e na seleção. */
const LABEL_MIN_ZOOM = 0.35;
/** Movimento mínimo, em px de tela, para um clique virar arraste. */
const DRAG_SLOP = 4;
/** Intervalo máximo entre dois cliques para abrir a ficha. */
const DOUBLE_CLICK_MS = 350;
const GHOST_ALPHA = 0.6;

/** O que a camada avisa ao motor. */
export interface TokenLayerHandlers {
  /** Fim do arraste: novo ponto do token; `alt` corrige o keyframe anterior. */
  onMoved(tokenId: Uuid, to: Point, alt: boolean): void;
  /** Clique: `additive` (Shift) soma ou tira da seleção. */
  onSelect(tokenId: Uuid, additive: boolean): void;
  onOpen(tokenId: Uuid): void;
  /** Botão direito; `screen` em coordenadas do canvas. */
  onMenu(tokenId: Uuid, screen: Point): void;
  /** Conversão do ponteiro para coordenadas do mapa. */
  toWorld(screen: Point): Point;
}

interface TokenEntry {
  token: MapToken;
  keyframes: KeyframeSample[];
  sprite: Sprite;
  label: Container;
  labelText: Text;
}

interface Drag {
  tokenId: Uuid;
  start: Point;
  /** Distância do ponteiro ao centro do token, em coordenadas do mapa. */
  offset: Point;
  moved: boolean;
}

/**
 * Camada de tokens de entidade (docs/05 › Token de personagem): forma do tipo com retrato,
 * inicial ou ícone, anel na cor da entidade, nome num rótulo de pergaminho e halo de
 * seleção. Arrastar move o token (o motor grava o keyframe), clique seleciona, duplo
 * clique abre a ficha e o botão direito abre o menu. Sprites são reaproveitados (pool) e
 * o `CullerPlugin` esconde os que estão fora da tela.
 */
export class TokenLayer {
  readonly container = new Container({ label: 'tokens', cullableChildren: true });
  /** Nomes, na camada de rótulos (acima de tudo, docs/06 › Camadas). */
  readonly labels = new Container({ label: 'token-labels', cullableChildren: true });
  private readonly ghost = new Sprite({ anchor: 0.5, alpha: GHOST_ALPHA, visible: false });
  private readonly entries = new Map<Uuid, TokenEntry>();
  private readonly pool: Sprite[] = [];
  private readonly faces: TokenFaces;
  private looks = new Map<Uuid, TokenLook>();
  private selection = new Set<Uuid>();
  private hovered: Uuid | null = null;
  /** Entidade sendo arrastada do Explorar: destaca o token dela, se já houver. */
  private dropEntity: Uuid | null = null;
  private interactive = true;
  private drag: Drag | null = null;
  private lastClick: { tokenId: Uuid; at: number } | null = null;
  private tick: Tick = 0;
  private zoom = 1;

  constructor(
    renderer: Renderer,
    private readonly palette: EnginePalette,
    private readonly handlers: TokenLayerHandlers,
  ) {
    this.faces = new TokenFaces(renderer, palette, () => this.refreshFaces());
    this.labels.addChild(this.ghost);
  }

  setTokens(tokens: readonly MapToken[], keyframes: readonly TokenKeyframe[]): void {
    const byToken = new Map<Uuid, TokenKeyframe[]>();
    for (const keyframe of keyframes) {
      const list = byToken.get(keyframe.tokenId) ?? [];
      list.push(keyframe);
      byToken.set(keyframe.tokenId, list);
    }
    const ids = new Set(tokens.map((token) => token.id));
    for (const [id, entry] of this.entries) if (!ids.has(id)) this.release(id, entry);
    for (const token of tokens) {
      const entry = this.entries.get(token.id) ?? this.acquire(token);
      entry.token = token;
      entry.keyframes = sortKeyframes(byToken.get(token.id) ?? []);
      this.entries.set(token.id, entry);
      this.applyLook(entry);
    }
    this.update();
  }

  setLooks(looks: readonly TokenLook[]): void {
    this.looks = new Map(looks.map((look) => [look.entityId, look]));
    for (const entry of this.entries.values()) this.applyLook(entry);
    this.update();
  }

  setTime(tick: Tick): void {
    this.tick = tick;
    this.update();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    for (const entry of this.entries.values()) this.place(entry);
    this.placeGhost();
  }

  setSelection(ids: readonly Uuid[]): void {
    this.selection = new Set(ids);
    for (const entry of this.entries.values()) this.applyLook(entry);
    this.update();
  }

  /** Ferramentas de desenho desligam a interação com os tokens. */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    for (const entry of this.entries.values()) {
      entry.sprite.eventMode = interactive ? 'static' : 'none';
    }
  }

  /** Fantasma do token durante o arraste do Explorar (`null` encerra). */
  previewDrop(drop: { entityId: Uuid; at: Point } | null): void {
    const previous = this.dropEntity;
    this.dropEntity = drop?.entityId ?? null;
    this.ghost.visible = drop !== null;
    if (drop) {
      this.ghost.texture = this.faces.face(this.looks.get(drop.entityId), false);
      this.ghost.position.set(drop.at.x, drop.at.y);
      this.placeGhost();
    }
    if (previous !== this.dropEntity) {
      for (const entry of this.entries.values()) this.applyLook(entry);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /** Posição atual do token da entidade neste mapa (`null` se não houver ou estiver oculto). */
  positionOfEntity(entityId: Uuid): Point | null {
    for (const entry of this.entries.values()) {
      if (entry.token.entityId !== entityId) continue;
      return entry.sprite.visible ? { x: entry.sprite.x, y: entry.sprite.y } : null;
    }
    return null;
  }

  /** Posição atual do token (`null` se oculto). */
  positionOf(tokenId: Uuid): Point | null {
    const sprite = this.entries.get(tokenId)?.sprite;
    return sprite?.visible ? { x: sprite.x, y: sprite.y } : null;
  }

  /** Tokens visíveis dentro do retângulo (seleção por área), em coordenadas do mapa. */
  tokensIn(a: Point, b: Point): Uuid[] {
    const [minX, maxX] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [minY, maxY] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    const ids: Uuid[] = [];
    for (const [id, { sprite }] of this.entries) {
      const inside = sprite.x >= minX && sprite.x <= maxX && sprite.y >= minY && sprite.y <= maxY;
      if (sprite.visible && inside) ids.push(id);
    }
    return ids;
  }

  /** Um token está sendo arrastado. */
  get isDragging(): boolean {
    return this.drag !== null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.labels.destroy({ children: true });
    for (const sprite of this.pool) sprite.destroy();
    this.faces.destroy();
  }

  /** Reavalia a posição de cada token no instante atual (O(log n) por token). */
  private update(): void {
    for (const [id, entry] of this.entries) {
      if (this.drag?.tokenId === id) continue;
      const position = evaluateKeyframes(entry.keyframes, this.tick);
      entry.sprite.visible = position !== null;
      if (position) entry.sprite.position.set(position.x, position.y);
      this.place(entry);
    }
  }

  /** Tamanho constante na tela e rótulo embaixo do token. */
  private place(entry: TokenEntry): void {
    const { sprite, label, token } = entry;
    const scale = (TOKEN_SCREEN_SIZE * token.size) / FACE_SIZE / this.zoom;
    sprite.scale.set(scale);
    const id = token.id;
    label.visible =
      sprite.visible &&
      (this.zoom >= LABEL_MIN_ZOOM || this.hovered === id || this.selection.has(id));
    label.scale.set(1 / this.zoom);
    label.position.set(sprite.x, sprite.y + (TOKEN_SCREEN_SIZE * token.size * 0.5 + 4) / this.zoom);
  }

  private placeGhost(): void {
    this.ghost.scale.set(TOKEN_SCREEN_SIZE / FACE_SIZE / this.zoom);
  }

  private applyLook(entry: TokenEntry): void {
    const look = entry.token.entityId ? this.looks.get(entry.token.entityId) : undefined;
    const highlighted =
      this.selection.has(entry.token.id) ||
      (this.dropEntity !== null && entry.token.entityId === this.dropEntity);
    entry.sprite.texture = this.faces.face(look, highlighted);
    const name = look?.name ?? '';
    if (entry.labelText.text !== name) {
      entry.labelText.text = name;
      this.drawLabelBackground(entry);
    }
  }

  /** Retrato ou fonte chegaram: redesenha faces e rótulos (a largura do nome muda). */
  private refreshFaces(): void {
    for (const entry of this.entries.values()) {
      this.applyLook(entry);
      this.drawLabelBackground(entry);
    }
  }

  private acquire(token: MapToken): TokenEntry {
    const sprite = this.pool.pop() ?? new Sprite({ anchor: 0.5, cullable: true });
    sprite.eventMode = this.interactive ? 'static' : 'none';
    sprite.cursor = 'grab';
    sprite.removeAllListeners();
    sprite.on('pointerdown', (event) => this.onPointerDown(token.id, event));
    sprite.on('pointerover', () => this.setHovered(token.id));
    sprite.on('pointerout', () => this.setHovered(null));
    this.container.addChild(sprite);

    const labelText = new Text({
      text: '',
      style: { fontFamily: this.palette.fontBook, fontSize: 13, fill: this.palette.leatherDark },
      resolution: 2,
    });
    labelText.anchor.set(0.5, 0);
    const label = new Container({ cullable: true });
    label.addChild(new Graphics(), labelText);
    this.labels.addChild(label);
    return { token, keyframes: [], sprite, label, labelText };
  }

  private release(id: Uuid, entry: TokenEntry): void {
    if (this.drag?.tokenId === id) this.drag = null;
    if (this.hovered === id) this.hovered = null;
    entry.sprite.removeAllListeners();
    this.container.removeChild(entry.sprite);
    this.pool.push(entry.sprite);
    entry.label.destroy({ children: true });
    this.entries.delete(id);
  }

  /** Rótulo de pergaminho com o nome (docs/05). */
  private drawLabelBackground(entry: TokenEntry): void {
    const background = entry.label.children[0];
    if (!(background instanceof Graphics)) return;
    const { width, height } = entry.labelText;
    background
      .clear()
      .roundRect(-width / 2 - 6, -2, width + 12, height + 4, 4)
      .fill({ color: this.palette.parchment, alpha: 0.92 })
      .stroke({ width: 1, color: this.palette.goldDark });
  }

  private setHovered(id: Uuid | null): void {
    if (this.drag) return;
    const previous = this.hovered;
    this.hovered = id;
    for (const tokenId of [previous, id]) {
      const entry = tokenId ? this.entries.get(tokenId) : undefined;
      if (entry) this.place(entry);
    }
  }

  private onPointerDown(tokenId: Uuid, event: FederatedPointerEvent): void {
    if (!this.interactive) return;
    // O fundo (pan, seleção por área, cliques das ferramentas) não recebe este ponteiro.
    event.stopPropagation();
    const entry = this.entries.get(tokenId);
    if (!entry) return;
    const screen = { x: event.global.x, y: event.global.y };
    if (event.button === 2) {
      this.handlers.onMenu(tokenId, screen);
      return;
    }
    if (event.button !== 0) return;
    const world = this.handlers.toWorld(screen);
    this.drag = {
      tokenId,
      start: screen,
      offset: { x: entry.sprite.x - world.x, y: entry.sprite.y - world.y },
      moved: false,
    };
    const sprite = entry.sprite;
    sprite.cursor = 'grabbing';
    const move = (e: FederatedPointerEvent) => this.onDragMove(e);
    const up = (e: FederatedPointerEvent) => {
      sprite.off('globalpointermove', move);
      sprite.off('pointerup', up);
      sprite.off('pointerupoutside', up);
      sprite.cursor = 'grab';
      this.onDragEnd(e);
    };
    sprite.on('globalpointermove', move);
    sprite.on('pointerup', up);
    sprite.on('pointerupoutside', up);
  }

  private onDragMove(event: FederatedPointerEvent): void {
    const drag = this.drag;
    const entry = drag ? this.entries.get(drag.tokenId) : undefined;
    if (!drag || !entry) return;
    const screen = { x: event.global.x, y: event.global.y };
    if (!drag.moved && Math.hypot(screen.x - drag.start.x, screen.y - drag.start.y) < DRAG_SLOP) {
      return;
    }
    drag.moved = true;
    const world = this.handlers.toWorld(screen);
    entry.sprite.position.set(world.x + drag.offset.x, world.y + drag.offset.y);
    this.place(entry);
  }

  private onDragEnd(event: FederatedPointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    const entry = drag ? this.entries.get(drag.tokenId) : undefined;
    if (!drag || !entry) return;
    if (drag.moved) {
      this.handlers.onMoved(drag.tokenId, { x: entry.sprite.x, y: entry.sprite.y }, event.altKey);
      return;
    }
    const now = performance.now();
    const double =
      this.lastClick?.tokenId === drag.tokenId && now - this.lastClick.at < DOUBLE_CLICK_MS;
    this.lastClick = double ? null : { tokenId: drag.tokenId, at: now };
    if (double) this.handlers.onOpen(drag.tokenId);
    else this.handlers.onSelect(drag.tokenId, event.shiftKey);
  }
}
