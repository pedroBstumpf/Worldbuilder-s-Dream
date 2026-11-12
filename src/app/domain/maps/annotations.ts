import { ENTITY_INK_COLORS } from '../entities/colors';
import { distance, polygonArea, polygonCenter, type Point } from '../geometry';
import type { MapAnnotation } from '../models/annotation';
import type { HexColor, Json, JsonObject, Tick } from '../models/common';
import type { PolygonVertex } from '../models/map';

/**
 * Anotações do mapa (docs/06 §5): pinos, traços do pincel, regiões, rótulos e medições.
 * `geometry` e `style` são `jsonb`; aqui fica o formato de cada tipo, a leitura tolerante
 * (dados de outra versão não derrubam o mapa) e a geometria das ferramentas.
 */

/**
 * Tintas das anotações: as cinco "tintas antigas" das entidades, mais nanquim (escuro) e
 * giz (claro), para contrastar com qualquer imagem. São dados gravados em `style.color`.
 */
export const ANNOTATION_INK_COLORS = [
  ...ENTITY_INK_COLORS,
  { id: 'nanquim', hex: '#1f140d' },
  { id: 'giz', hex: '#f4ead3' },
] as const satisfies readonly { id: string; hex: HexColor }[];

export type AnnotationInkId = (typeof ANNOTATION_INK_COLORS)[number]['id'];

/** Ícones do pino (Material Symbols); o primeiro é o padrão. */
export const PIN_ICONS = [
  'location_on',
  'castle',
  'home',
  'flag',
  'star',
  'swords',
  'skull',
  'anchor',
  'landscape',
  'forest',
  'water_drop',
  'local_fire_department',
  'diamond',
  'help',
] as const;
export type PinIcon = (typeof PIN_ICONS)[number];

/** Espessuras do pincel, em px de tela no momento do traço. */
export const BRUSH_WIDTHS = [2, 4, 8, 14] as const;
export type LabelSize = 'sm' | 'md' | 'lg';
export const LABEL_SIZES: readonly LabelSize[] = ['sm', 'md', 'lg'];

/** Estilo do pincel escolhido na barra de opções (vale para os próximos traços). */
export interface BrushStyle {
  color: HexColor;
  /** Em px de tela; o traço grava em px do mapa (`width / zoom`). */
  width: number;
  /** 0,1 a 1. */
  opacity: number;
  dashed: boolean;
}

export const DEFAULT_COLOR: HexColor = ANNOTATION_INK_COLORS[0].hex;
export const DEFAULT_BRUSH: BrushStyle = {
  color: ANNOTATION_INK_COLORS[1].hex,
  width: 4,
  opacity: 1,
  dashed: false,
};
export const DEFAULT_REGION_OPACITY = 0.3;

/** Teto de pontos de um traço (o `geometry` precisa ficar abaixo de 256 KB). */
export const MAX_STROKE_POINTS = 4000;

export type AnnotationShape =
  | { kind: 'pin'; at: Point; color: HexColor; icon: PinIcon }
  | { kind: 'label'; at: Point; color: HexColor; size: LabelSize }
  | {
      kind: 'stroke';
      points: Point[];
      color: HexColor;
      /** Em px do mapa. */
      width: number;
      opacity: number;
      dashed: boolean;
    }
  | { kind: 'region'; polygon: PolygonVertex[]; color: HexColor; opacity: number }
  | { kind: 'measure'; points: Point[] };

const HEX = /^#[0-9a-f]{6}$/i;

function num(value: Json | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function color(value: Json | undefined, fallback: HexColor = DEFAULT_COLOR): HexColor {
  return typeof value === 'string' && HEX.test(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readPoint(geometry: JsonObject): Point | null {
  const { x, y } = geometry;
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x + y) ? { x, y } : null;
}

function readPairs(value: Json | undefined): PolygonVertex[] {
  if (!Array.isArray(value)) return [];
  const pairs: PolygonVertex[] = [];
  for (const item of value) {
    if (!Array.isArray(item)) continue;
    const [x, y] = item;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x + y)) {
      pairs.push([x, y]);
    }
  }
  return pairs;
}

const toPoints = (pairs: PolygonVertex[]): Point[] => pairs.map(([x, y]) => ({ x, y }));
const round1 = (n: number) => Math.round(n * 10) / 10;
const toPairs = (points: readonly Point[]): Json[] => points.map((p) => [round1(p.x), round1(p.y)]);

/** Lê geometria e estilo gravados; `null` se a geometria não serve para o tipo. */
export function readAnnotation(
  annotation: Pick<MapAnnotation, 'kind' | 'geometry' | 'style'>,
): AnnotationShape | null {
  const { geometry, style } = annotation;
  let shape: AnnotationShape | null = null;
  switch (annotation.kind) {
    case 'pin': {
      const at = readPoint(geometry);
      const icon = PIN_ICONS.find((i) => i === style['icon']) ?? PIN_ICONS[0];
      shape = at ? { kind: 'pin', at, color: color(style['color']), icon } : null;
      break;
    }
    case 'label': {
      const at = readPoint(geometry);
      const size = LABEL_SIZES.find((s) => s === style['size']) ?? 'md';
      shape = at ? { kind: 'label', at, color: color(style['color'], '#f4ead3'), size } : null;
      break;
    }
    case 'stroke': {
      const points = toPoints(readPairs(geometry['points']));
      shape =
        points.length > 0
          ? {
              kind: 'stroke',
              points,
              color: color(style['color']),
              width: Math.max(0.1, num(style['width'], 4)),
              opacity: clamp(num(style['opacity'], 1), 0.1, 1),
              dashed: style['dashed'] === true,
            }
          : null;
      break;
    }
    case 'region': {
      const polygon = readPairs(geometry['polygon']);
      shape =
        polygon.length >= 3
          ? {
              kind: 'region',
              polygon,
              color: color(style['color']),
              opacity: clamp(num(style['opacity'], DEFAULT_REGION_OPACITY), 0.05, 1),
            }
          : null;
      break;
    }
    case 'measure': {
      const points = toPoints(readPairs(geometry['points']));
      shape = points.length >= 2 ? { kind: 'measure', points } : null;
      break;
    }
  }
  return shape;
}

/** Geometria e estilo a gravar para a forma. */
export function writeAnnotation(shape: AnnotationShape): {
  geometry: JsonObject;
  style: JsonObject;
} {
  switch (shape.kind) {
    case 'pin':
      return {
        geometry: { x: round1(shape.at.x), y: round1(shape.at.y) },
        style: { color: shape.color, icon: shape.icon },
      };
    case 'label':
      return {
        geometry: { x: round1(shape.at.x), y: round1(shape.at.y) },
        style: { color: shape.color, size: shape.size },
      };
    case 'stroke':
      return {
        geometry: { points: toPairs(shape.points) },
        style: {
          color: shape.color,
          width: Math.round(shape.width * 100) / 100,
          opacity: shape.opacity,
          dashed: shape.dashed,
        },
      };
    case 'region':
      return {
        geometry: { polygon: shape.polygon.map(([x, y]) => [Math.round(x), Math.round(y)]) },
        style: { color: shape.color, opacity: shape.opacity },
      };
    case 'measure':
      return { geometry: { points: toPairs(shape.points) }, style: {} };
  }
}

/** Visível no instante: `tickStart`/`tickEnd` nulos não limitam (docs/06 §5). */
export function isAnnotationVisible(
  annotation: Pick<MapAnnotation, 'tickStart' | 'tickEnd'>,
  tick: Tick,
): boolean {
  return (
    (annotation.tickStart === null || annotation.tickStart <= tick) &&
    (annotation.tickEnd === null || tick <= annotation.tickEnd)
  );
}

/** Ponto onde a anotação "mora" (âncora do editor e foco da câmera). */
export function annotationAnchor(shape: AnnotationShape): Point {
  switch (shape.kind) {
    case 'pin':
    case 'label':
      return shape.at;
    case 'region':
      return polygonCenter(shape.polygon);
    case 'stroke':
    case 'measure':
      return shape.points[Math.floor((shape.points.length - 1) / 2)] ?? { x: 0, y: 0 };
  }
}

/** Comprimento de uma linha de vários segmentos, em px do mapa. */
export function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1] as Point, points[i] as Point);
  }
  return total;
}

/** Distância do ponto `p` ao segmento `ab`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return distance(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / length2, 0, 1);
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Menor distância entre os segmentos `ab` e `cd` (zero se eles se cruzam). */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return 0;
  }
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}

/**
 * A borracha, indo de `from` a `to` com raio `radius` (px do mapa), toca o traço? Conta a
 * espessura do traço. Testa segmento contra segmento: um movimento rápido não pula o traço.
 */
export function eraserTouches(
  stroke: { points: readonly Point[]; width: number },
  from: Point,
  to: Point,
  radius: number,
): boolean {
  const reach = radius + stroke.width / 2;
  const { points } = stroke;
  if (points.length === 1) return distanceToSegment(points[0] as Point, from, to) <= reach;
  for (let i = 1; i < points.length; i++) {
    if (segmentDistance(points[i - 1] as Point, points[i] as Point, from, to) <= reach) {
      return true;
    }
  }
  return false;
}

/**
 * Descarta pontos a menos de `minDistance` do último guardado (o ponteiro gera dezenas por
 * segundo) e mantém o último ponto. Acima de `MAX_STROKE_POINTS`, só os primeiros ficam.
 */
export function simplifyStroke(points: readonly Point[], minDistance: number): Point[] {
  const kept: Point[] = [];
  for (const p of points) {
    const last = kept.at(-1);
    if (!last || distance(last, p) >= minDistance) kept.push(p);
  }
  const end = points.at(-1);
  if (end && kept.length > 1 && kept.at(-1) !== end) kept[kept.length - 1] = end;
  return kept.slice(0, MAX_STROKE_POINTS);
}

/** Polígono de região pronto para gravar (≥ 3 vértices e área) ou `null`. */
export function validRegion(points: readonly Point[]): PolygonVertex[] | null {
  const polygon = points.map((p): PolygonVertex => [Math.round(p.x), Math.round(p.y)]);
  return polygon.length >= 3 && polygonArea(polygon) > 1 ? polygon : null;
}
