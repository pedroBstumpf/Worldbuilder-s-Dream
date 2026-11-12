import { distance, lerpPoint, type Point } from '@domain/geometry';
import { getStroke } from 'perfect-freehand';

/**
 * Contorno do traço contínuo do pincel (docs/06 §5: `perfect-freehand`), como lista plana
 * `[x0, y0, x1, y1, …]` para `Graphics.poly`. `width` em px do mapa.
 */
export function strokeOutline(points: readonly Point[], width: number, last = true): number[] {
  const outline = getStroke(
    points.map((p) => [p.x, p.y]),
    { size: width, thinning: 0.35, smoothing: 0.6, streamline: 0.45, simulatePressure: true, last },
  );
  return outline.flat();
}

/**
 * Traço pontilhado: pedaços de `dash` separados por `gap` ao longo da linha (px do mapa).
 * Cada pedaço é desenhado como uma linha com pontas redondas.
 */
export function dashSegments(points: readonly Point[], dash: number, gap: number): Point[][] {
  const first = points[0];
  if (!first || dash <= 0) return [];
  if (points.length === 1) return [[first]];
  const segments: Point[][] = [];
  let drawing = true;
  let left = dash;
  let current: Point[] = [first];
  for (let i = 1; i < points.length; i++) {
    let from = points[i - 1] as Point;
    const to = points[i] as Point;
    let length = distance(from, to);
    while (length > 0) {
      if (length < left) {
        left -= length;
        if (drawing) current.push(to);
        break;
      }
      const cut = lerpPoint(from, to, left / length);
      if (drawing) {
        current.push(cut);
        segments.push(current);
      } else {
        current = [cut];
      }
      length -= left;
      from = cut;
      drawing = !drawing;
      left = drawing ? dash : gap;
    }
  }
  if (drawing && current.length > 1) segments.push(current);
  return segments;
}
