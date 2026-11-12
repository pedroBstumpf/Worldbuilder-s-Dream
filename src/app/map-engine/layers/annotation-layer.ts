import { pointInPolygon, type Point } from '@domain/geometry';
import {
  eraserTouches,
  isAnnotationVisible,
  polylineLength,
  readAnnotation,
  type AnnotationShape,
} from '@domain/maps';
import type { MapAnnotation, Tick, Uuid } from '@domain/models';
import { Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import type { EnginePalette } from '../render/engine-palette';
import { dashSegments, strokeOutline } from '../tools/freehand';

const ICON_FONT = 'Material Symbols Rounded';
/** Movimento mínimo, em px de tela, para um clique num pino virar arraste. */
const DRAG_SLOP = 4;
/** Tamanho dos rótulos na tela, em px (ficam constantes no zoom). */
const LABEL_FONT_SIZES = { sm: 14, md: 19, lg: 27 } as const;
/** Alcance do clique num traço ou numa medição, em px de tela. */
const PICK_SLOP = 6;
const ERASED_ALPHA = 0.2;

/** O que a camada avisa ao motor. */
export interface AnnotationLayerHandlers {
  /** Clique num pino ou rótulo; `screen` em coordenadas do canvas. */
  onPicked(id: Uuid, screen: Point): void;
  /** Fim do arraste de um pino ou rótulo. */
  onMoved(id: Uuid, shape: AnnotationShape): void;
  toWorld(screen: Point): Point;
}

interface Entry {
  annotation: MapAnnotation;
  shape: AnnotationShape;
  /** Na camada de regiões (traço, região) ou de rótulos (pino, rótulo, medição). */
  node: Container;
}

interface Drag {
  id: Uuid;
  start: Point;
  offset: Point;
  moved: boolean;
}

/**
 * Anotações do mapa (docs/06 §5). Traços e regiões ficam na camada de regiões, desenhados
 * em px do mapa; pinos, rótulos e medições ficam na de rótulos, com tamanho constante na
 * tela (escala inversa ao zoom). Cada uma aparece só dentro da validade (`tickStart`,
 * `tickEnd`). Pinos e rótulos podem ser arrastados; o clique abre o editor.
 */
export class AnnotationLayer {
  readonly shapes = new Container({ label: 'annotation-shapes', cullableChildren: true });
  readonly marks = new Container({ label: 'annotation-marks', cullableChildren: true });
  private readonly entries = new Map<Uuid, Entry>();
  private readonly erased = new Set<Uuid>();
  private tick: Tick = 0;
  private zoom = 1;
  private active: Uuid | null = null;
  private interactive = true;
  private format: (pixels: number) => string = (px) => `${Math.round(px)} px`;
  private fontsReady = false;
  private drag: Drag | null = null;
  private destroyed = false;

  constructor(
    private readonly palette: EnginePalette,
    private readonly handlers: AnnotationLayerHandlers,
  ) {
    const fonts = globalThis.document?.fonts;
    if (!fonts) return;
    void Promise.all([
      fonts.load(`300 24px "${ICON_FONT}"`),
      fonts.load(`20px ${palette.fontBook}`),
    ])
      .catch(() => undefined)
      .then(() => {
        if (this.destroyed) return;
        this.fontsReady = true;
        this.redrawAll();
      });
  }

  setAnnotations(annotations: readonly MapAnnotation[]): void {
    const ids = new Set(annotations.map((a) => a.id));
    for (const [id, entry] of this.entries) {
      if (!ids.has(id)) {
        entry.node.destroy({ children: true });
        this.entries.delete(id);
        this.erased.delete(id);
      }
    }
    for (const annotation of annotations) {
      const entry = this.entries.get(annotation.id);
      if (entry?.annotation === annotation) continue;
      const shape = readAnnotation(annotation);
      entry?.node.destroy({ children: true });
      this.entries.delete(annotation.id);
      if (!shape) continue;
      this.entries.set(annotation.id, this.create(annotation, shape));
    }
    this.update();
  }

  setTime(tick: Tick): void {
    this.tick = tick;
    this.update();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    for (const entry of this.entries.values()) {
      if (entry.shape.kind === 'pin' || entry.shape.kind === 'label') {
        entry.node.scale.set(1 / zoom);
      } else if (entry.shape.kind !== 'stroke' || entry.annotation.id === this.active) {
        this.draw(entry);
      }
    }
  }

  setActive(id: Uuid | null): void {
    const previous = this.active;
    this.active = id;
    for (const key of [previous, id]) {
      const entry = key ? this.entries.get(key) : undefined;
      if (entry) this.draw(entry);
    }
  }

  setFormat(format: ((pixels: number) => string) | null): void {
    this.format = format ?? ((px) => `${Math.round(px)} px`);
    for (const entry of this.entries.values()) if (entry.shape.kind === 'measure') this.draw(entry);
  }

  /** Durante as ferramentas de desenho, pinos e rótulos não respondem ao ponteiro. */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    for (const entry of this.entries.values()) {
      if (entry.shape.kind === 'pin' || entry.shape.kind === 'label') {
        entry.node.eventMode = interactive ? 'static' : 'none';
      }
    }
  }

  isDragging(): boolean {
    return this.drag !== null;
  }

  /** Traço, região ou medição sob o ponto (Selecionar); a de cima ganha. */
  shapeAt(world: Point): Uuid | null {
    const slop = PICK_SLOP / this.zoom;
    const visible = [...this.entries.values()].filter((e) => e.node.visible).reverse();
    for (const { annotation, shape } of visible) {
      if (shape.kind === 'stroke' || shape.kind === 'measure') {
        const width = shape.kind === 'stroke' ? shape.width : 0;
        if (eraserTouches({ points: shape.points, width }, world, world, slop)) {
          return annotation.id;
        }
      }
    }
    for (const { annotation, shape } of visible) {
      if (shape.kind === 'region' && pointInPolygon(world, shape.polygon)) return annotation.id;
    }
    return null;
  }

  /**
   * Passada da borracha de `from` a `to` (raio em px do mapa): esmaece os traços visíveis
   * que ela toca e devolve os novos.
   */
  eraseAlong(from: Point, to: Point, radius: number): Uuid[] {
    const touched: Uuid[] = [];
    for (const { annotation, shape, node } of this.entries.values()) {
      if (shape.kind !== 'stroke' || !node.visible || this.erased.has(annotation.id)) continue;
      if (eraserTouches(shape, from, to, radius)) {
        this.erased.add(annotation.id);
        node.alpha = ERASED_ALPHA * shape.opacity;
        touched.push(annotation.id);
      }
    }
    return touched;
  }

  /** Esc no meio da passada: os traços voltam. */
  restoreErased(): void {
    for (const id of this.erased) {
      const entry = this.entries.get(id);
      if (entry) this.draw(entry);
    }
    this.erased.clear();
  }

  /** Fim da passada: o motor avisa o app e os traços saem com a próxima cena. */
  takeErased(): Uuid[] {
    const ids = [...this.erased];
    this.erased.clear();
    return ids;
  }

  destroy(): void {
    this.destroyed = true;
    this.shapes.destroy({ children: true });
    this.marks.destroy({ children: true });
    this.entries.clear();
  }

  private create(annotation: MapAnnotation, shape: AnnotationShape): Entry {
    const marked = shape.kind === 'pin' || shape.kind === 'label' || shape.kind === 'measure';
    const node = marked ? new Container({ cullable: true }) : new Graphics();
    (marked ? this.marks : this.shapes).addChild(node);
    const entry: Entry = { annotation, shape, node };
    if (shape.kind === 'pin' || shape.kind === 'label') {
      node.eventMode = this.interactive ? 'static' : 'none';
      node.cursor = 'pointer';
      node.on('pointerdown', (event) => this.onPointerDown(annotation.id, event));
    }
    this.draw(entry);
    return entry;
  }

  private update(): void {
    for (const entry of this.entries.values()) {
      entry.node.visible = isAnnotationVisible(entry.annotation, this.tick);
    }
  }

  private redrawAll(): void {
    for (const entry of this.entries.values()) this.draw(entry);
  }

  private draw(entry: Entry): void {
    const { shape, node } = entry;
    const active = entry.annotation.id === this.active;
    node.alpha = 1;
    switch (shape.kind) {
      case 'stroke':
        this.drawStroke(node as Graphics, shape, active);
        break;
      case 'region':
        this.drawRegion(node as Graphics, shape, active);
        break;
      case 'pin':
        this.drawPin(node, shape, entry.annotation.title, active);
        break;
      case 'label':
        this.drawLabel(node, shape, entry.annotation.title, active);
        break;
      case 'measure':
        this.drawMeasure(node, shape, active);
        break;
    }
  }

  private drawStroke(
    g: Graphics,
    shape: Extract<AnnotationShape, { kind: 'stroke' }>,
    active: boolean,
  ): void {
    g.clear();
    g.alpha = shape.opacity;
    if (active) {
      // Halo dourado em volta do traço (largura de tela constante).
      g.moveTo(shape.points[0]?.x ?? 0, shape.points[0]?.y ?? 0);
      for (const p of shape.points.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({
        width: shape.width + 6 / this.zoom,
        color: this.palette.goldLight,
        alpha: 0.6,
        cap: 'round',
        join: 'round',
      });
    }
    drawStrokeBody(g, shape.points, shape.width, shape.color, shape.dashed);
  }

  private drawRegion(
    g: Graphics,
    shape: Extract<AnnotationShape, { kind: 'region' }>,
    active: boolean,
  ): void {
    const flat = shape.polygon.flat();
    g.clear()
      .poly(flat, true)
      .fill({ color: shape.color, alpha: shape.opacity })
      .poly(flat, true)
      .stroke({
        width: (active ? 3 : 2) / this.zoom,
        color: active ? this.palette.goldLight : shape.color,
        alpha: active ? 1 : 0.9,
        join: 'round',
      });
  }

  /** Gota na cor do pino com o ícone; título num rótulo de pergaminho embaixo. */
  private drawPin(
    node: Container,
    shape: Extract<AnnotationShape, { kind: 'pin' }>,
    title: string | null,
    active: boolean,
  ): void {
    node.removeChildren().forEach((child) => child.destroy());
    node.position.set(shape.at.x, shape.at.y);
    node.scale.set(1 / this.zoom);
    const g = new Graphics();
    if (active) g.circle(0, -22, 17).fill({ color: this.palette.goldLight, alpha: 0.45 });
    g.moveTo(0, 0)
      .bezierCurveTo(-4, -8, -13, -12, -13, -22)
      .arc(0, -22, 13, Math.PI, 0)
      .bezierCurveTo(13, -12, 4, -8, 0, 0)
      .closePath()
      .fill(shape.color)
      .stroke({
        width: active ? 2.5 : 1.5,
        color: active ? this.palette.gold : this.palette.backdrop,
      });
    node.addChild(g);
    if (this.fontsReady) {
      const icon = new Text({
        text: shape.icon,
        style: {
          fontFamily: ICON_FONT,
          fontWeight: '300',
          fontSize: 17,
          fill: this.palette.parchment,
        },
        resolution: 2,
      });
      icon.anchor.set(0.5);
      icon.position.set(0, -22);
      node.addChild(icon);
    }
    if (title) node.addChild(this.parchmentLabel(title, 6));
    node.hitArea = { contains: (x: number, y: number) => x * x + (y + 18) ** 2 <= 18 * 18 };
  }

  /** Texto livre com contorno escuro, legível sobre qualquer imagem (docs/05). */
  private drawLabel(
    node: Container,
    shape: Extract<AnnotationShape, { kind: 'label' }>,
    title: string | null,
    active: boolean,
  ): void {
    node.removeChildren().forEach((child) => child.destroy());
    node.position.set(shape.at.x, shape.at.y);
    node.scale.set(1 / this.zoom);
    const text = new Text({
      text: title?.trim() || '…',
      style: {
        fontFamily: this.palette.fontBook,
        fontSize: LABEL_FONT_SIZES[shape.size],
        fill: shape.color,
        stroke: { color: this.palette.backdrop, width: 3, join: 'round' },
        letterSpacing: 0.5,
      },
      resolution: 2,
    });
    text.anchor.set(0.5);
    if (active) {
      const { width, height } = text;
      const frame = new Graphics()
        .roundRect(-width / 2 - 6, -height / 2 - 3, width + 12, height + 6, 4)
        .stroke({ width: 1.5, color: this.palette.goldLight });
      node.addChild(frame);
    }
    node.addChild(text);
  }

  /** Linha da régua fixada, com o total no fim. */
  private drawMeasure(
    node: Container,
    shape: Extract<AnnotationShape, { kind: 'measure' }>,
    active: boolean,
  ): void {
    node.removeChildren().forEach((child) => child.destroy());
    const g = new Graphics();
    drawRuler(
      g,
      shape.points,
      this.zoom,
      active ? this.palette.goldLight : this.palette.gold,
      this.palette.backdrop,
    );
    node.addChild(g);
    const end = shape.points.at(-1);
    if (!end) return;
    const label = this.parchmentLabel(this.format(polylineLength(shape.points)), 8);
    label.position.set(end.x, end.y);
    label.scale.set(1 / this.zoom);
    node.addChild(label);
  }

  private parchmentLabel(text: string, top: number): Container {
    const label = new Container();
    const body = new Text({
      text,
      style: { fontFamily: this.palette.fontBook, fontSize: 13, fill: this.palette.leatherDark },
      resolution: 2,
    });
    body.anchor.set(0.5, 0);
    body.position.set(0, top);
    const { width, height } = body;
    const background = new Graphics()
      .roundRect(-width / 2 - 6, top - 2, width + 12, height + 4, 4)
      .fill({ color: this.palette.parchment, alpha: 0.92 })
      .stroke({ width: 1, color: this.palette.goldDark });
    label.addChild(background, body);
    return label;
  }

  private onPointerDown(id: Uuid, event: FederatedPointerEvent): void {
    if (!this.interactive || event.button !== 0) return;
    // O fundo (pan, seleção por área) não recebe este ponteiro.
    event.stopPropagation();
    const entry = this.entries.get(id);
    if (!entry || (entry.shape.kind !== 'pin' && entry.shape.kind !== 'label')) return;
    const screen = { x: event.global.x, y: event.global.y };
    const world = this.handlers.toWorld(screen);
    const at = entry.shape.at;
    this.drag = {
      id,
      start: screen,
      offset: { x: at.x - world.x, y: at.y - world.y },
      moved: false,
    };
    const node = entry.node;
    const move = (e: FederatedPointerEvent) => this.onDragMove(e);
    const up = (e: FederatedPointerEvent) => {
      node.off('globalpointermove', move);
      node.off('pointerup', up);
      node.off('pointerupoutside', up);
      this.onDragEnd(e);
    };
    node.on('globalpointermove', move);
    node.on('pointerup', up);
    node.on('pointerupoutside', up);
  }

  private onDragMove(event: FederatedPointerEvent): void {
    const drag = this.drag;
    const entry = drag ? this.entries.get(drag.id) : undefined;
    if (!drag || !entry) return;
    const screen = { x: event.global.x, y: event.global.y };
    if (!drag.moved && Math.hypot(screen.x - drag.start.x, screen.y - drag.start.y) < DRAG_SLOP) {
      return;
    }
    drag.moved = true;
    const world = this.handlers.toWorld(screen);
    entry.node.position.set(world.x + drag.offset.x, world.y + drag.offset.y);
  }

  private onDragEnd(event: FederatedPointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    const entry = drag ? this.entries.get(drag.id) : undefined;
    if (!drag || !entry) return;
    if (!drag.moved) {
      this.handlers.onPicked(drag.id, { x: event.global.x, y: event.global.y });
      return;
    }
    const { shape } = entry;
    if (shape.kind !== 'pin' && shape.kind !== 'label') return;
    this.handlers.onMoved(drag.id, { ...shape, at: { x: entry.node.x, y: entry.node.y } });
  }
}

/** Corpo do traço: contorno suavizado (contínuo) ou pedaços com pontas redondas. */
export function drawStrokeBody(
  g: Graphics,
  points: readonly Point[],
  width: number,
  color: string,
  dashed: boolean,
): void {
  if (!dashed) {
    const outline = strokeOutline(points, width);
    if (outline.length >= 6) g.poly(outline, true).fill(color);
    return;
  }
  for (const dash of dashSegments(points, width * 2.2, width * 1.8)) {
    const [first, ...rest] = dash;
    if (!first) continue;
    if (rest.length === 0) {
      g.circle(first.x, first.y, width / 2).fill(color);
      continue;
    }
    g.moveTo(first.x, first.y);
    for (const p of rest) g.lineTo(p.x, p.y);
    g.stroke({ width, color, cap: 'round', join: 'round' });
  }
}

/** Linha da régua (largura de tela constante) com os vértices marcados. */
export function drawRuler(
  g: Graphics,
  points: readonly Point[],
  zoom: number,
  color: string,
  backdrop: string,
): void {
  const [first, ...rest] = points;
  if (!first) return;
  const width = 2 / zoom;
  g.moveTo(first.x, first.y);
  for (const p of rest) g.lineTo(p.x, p.y);
  g.stroke({ width: width + 2 / zoom, color: backdrop, alpha: 0.6, cap: 'round', join: 'round' });
  g.moveTo(first.x, first.y);
  for (const p of rest) g.lineTo(p.x, p.y);
  g.stroke({ width, color, cap: 'round', join: 'round' });
  for (const p of points) {
    g.circle(p.x, p.y, 3.5 / zoom)
      .fill(backdrop)
      .stroke({ width, color });
  }
}
