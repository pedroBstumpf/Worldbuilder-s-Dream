import { polygonCenter } from '@domain/geometry';
import type { MapLink } from '@domain/models';
import { Container, Graphics, Polygon } from 'pixi.js';
import type { EnginePalette } from '../render/engine-palette';

/** Raio da lupa na tela, em px. */
const LENS_RADIUS = 14;

/**
 * Regiões de link (docs/06 §8): polígono dourado translúcido no mapa-pai e uma lupa no
 * centro. Clicar na lupa (ou dar duplo clique na região) abre o mapa-filho.
 */
export class LinkLayer {
  /** Polígonos, na camada de regiões. */
  readonly regions = new Container({ label: 'link-regions' });
  /** Lupas, na camada de rótulos (escala inversa ao zoom). */
  readonly lenses = new Container({ label: 'link-lenses' });
  private links: readonly MapLink[] = [];
  private zoom = 1;
  private interactive = true;

  constructor(
    private readonly palette: EnginePalette,
    private readonly onOpen: (link: MapLink) => void,
  ) {}

  setLinks(links: readonly MapLink[]): void {
    this.links = links;
    this.redraw();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.redraw();
  }

  /** Durante o desenho de um link ou a calibração, as regiões não capturam o ponteiro. */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    this.redraw();
  }

  destroy(): void {
    this.regions.destroy({ children: true });
    this.lenses.destroy({ children: true });
  }

  private redraw(): void {
    for (const child of this.regions.removeChildren()) child.destroy();
    for (const child of this.lenses.removeChildren()) child.destroy();
    const line = 2 / this.zoom;
    for (const link of this.links) {
      const flat = link.polygon.flat();
      const region = new Graphics({ label: `link:${link.id}` })
        .poly(flat)
        .fill({ color: this.palette.gold, alpha: 0.12 })
        .stroke({ width: line, color: this.palette.goldDark, alpha: 0.9 });
      region.hitArea = new Polygon(flat);
      region.eventMode = this.interactive ? 'static' : 'none';
      region.cursor = 'zoom-in';
      this.regions.addChild(region);

      const center = polygonCenter(link.polygon);
      const lens = new Graphics({ label: `lens:${link.id}` })
        .circle(0, 0, LENS_RADIUS)
        .fill({ color: this.palette.leather, alpha: 0.92 })
        .stroke({ width: 2, color: this.palette.gold })
        .circle(-2, -2, 6)
        .stroke({ width: 2, color: this.palette.goldLight })
        .moveTo(2.5, 2.5)
        .lineTo(7, 7)
        .stroke({ width: 2.5, color: this.palette.goldLight, cap: 'round' });
      lens.position.set(center.x, center.y);
      lens.scale.set(1 / this.zoom);
      lens.eventMode = this.interactive ? 'static' : 'none';
      lens.cursor = 'zoom-in';
      lens.on('pointertap', () => this.onOpen(link));
      this.lenses.addChild(lens);
    }
  }
}
