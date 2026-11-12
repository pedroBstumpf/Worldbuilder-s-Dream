import type { EntityKind } from '@domain/models';
import { Container, Graphics, ImageSource, Sprite, Text, Texture, type Renderer } from 'pixi.js';
import type { TokenLook } from '../map-engine';
import type { EnginePalette } from '../render/engine-palette';

/** Lado da textura do token, em px (docs/06 › Desempenho: tamanho fixo de 96 px). */
export const FACE_SIZE = 96;
/** Espessura do anel (2 px num token de 32 px). */
const RING = 6;
/** Margem do halo do token selecionado, de cada lado. */
const HALO = 12;
const ICON_FONT = 'Material Symbols Rounded';

/** Ícone de cada tipo sem retrato (os mesmos de `wd-entity-avatar`); personagem usa a inicial. */
const KIND_ICONS: Record<EntityKind, string> = {
  character: 'person',
  location: 'location_on',
  faction: 'shield',
  item: 'swords',
  note: 'sticky_note_2',
};

/** Contornos por tipo, no quadrado 0..1 (os mesmos `clip-path` de `wd-entity-avatar`). */
const POLYGONS: Partial<Record<EntityKind, readonly [number, number][]>> = {
  faction: [
    [0.5, 0],
    [1, 0.1],
    [1, 0.52],
    [0.5, 1],
    [0, 0.52],
    [0, 0.1],
  ],
  item: [
    [0.25, 0.04],
    [0.75, 0.04],
    [1, 0.5],
    [0.75, 0.96],
    [0.25, 0.96],
    [0, 0.5],
  ],
  note: [
    [0, 0],
    [0.72, 0],
    [1, 0.28],
    [1, 1],
    [0, 1],
  ],
};

/** Desenha a forma do tipo com lado `side`, centrada na origem (só o caminho). */
function shapePath(g: Graphics, kind: EntityKind, side: number): Graphics {
  const half = side / 2;
  if (kind === 'character') return g.circle(0, 0, half);
  if (kind === 'location') return g.roundRect(-half, -half, side, side, side * 0.22);
  const points = (POLYGONS[kind] ?? []).flatMap(([x, y]) => [x * side - half, y * side - half]);
  return g.poly(points, true);
}

function ringColor(kind: EntityKind, palette: EnginePalette): string {
  const colors: Record<EntityKind, string> = {
    character: palette.gold,
    location: palette.bronze,
    faction: palette.copper,
    item: palette.brass,
    note: palette.parchmentDark,
  };
  return colors[kind];
}

/** Primeira letra do nome, como no avatar do Explorar. */
function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?';
}

type PortraitState = ImageBitmap | 'loading' | 'failed';

/**
 * Fábrica e cache das texturas dos tokens (forma do tipo, anel, retrato, inicial ou ícone,
 * halo de seleção). Tokens com a mesma aparência dividem a textura. Retratos e fontes
 * chegam depois: até lá o token mostra a forma vazia, e `onChange` avisa para redesenhar.
 */
export class TokenFaces {
  private readonly cache = new Map<string, Texture>();
  private readonly portraits = new Map<string, PortraitState>();
  private fontsReady = false;
  private destroyed = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly palette: EnginePalette,
    private readonly onChange: () => void,
  ) {
    const fonts = globalThis.document?.fonts;
    if (!fonts) return;
    void Promise.all([
      fonts.load(`48px ${palette.fontBook}`),
      fonts.load(`300 48px "${ICON_FONT}"`),
    ])
      .catch(() => undefined)
      .then(() => {
        if (this.destroyed) return;
        this.fontsReady = true;
        this.invalidate((key) => !key.includes('|portrait|'));
      });
  }

  /** Textura do token; a do selecionado é maior (inclui o halo). */
  face(look: TokenLook | undefined, selected: boolean): Texture {
    const kind = look?.kind ?? 'character';
    const ring = look?.color ?? ringColor(kind, this.palette);
    const portrait = look?.portraitUrl ? this.portrait(look.portraitUrl) : null;
    const content = portrait
      ? `portrait|${look?.portraitUrl}`
      : kind === 'character'
        ? `initial|${initialOf(look?.name ?? '')}`
        : `icon|${KIND_ICONS[kind]}`;
    const key = `${kind}|${ring}|${content}|${selected}|${this.fontsReady}`;
    let texture = this.cache.get(key);
    if (!texture) {
      texture = this.draw(kind, ring, look?.name ?? '', portrait, selected);
      this.cache.set(key, texture);
    }
    return texture;
  }

  destroy(): void {
    this.destroyed = true;
    for (const texture of this.cache.values()) texture.destroy(true);
    this.cache.clear();
    for (const state of this.portraits.values()) if (state instanceof ImageBitmap) state.close();
    this.portraits.clear();
  }

  /** Retrato decodificado, ou `null` enquanto carrega (ou se falhou). */
  private portrait(url: string): ImageBitmap | null {
    const state = this.portraits.get(url);
    if (state instanceof ImageBitmap) return state;
    if (!state) {
      this.portraits.set(url, 'loading');
      void loadBitmap(url)
        .then((bitmap) => {
          if (this.destroyed) {
            bitmap.close();
            return;
          }
          this.portraits.set(url, bitmap);
          this.onChange();
        })
        .catch(() => this.portraits.set(url, 'failed'));
    }
    return null;
  }

  private invalidate(match: (key: string) => boolean): void {
    for (const [key, texture] of this.cache) {
      if (!match(key)) continue;
      texture.destroy(true);
      this.cache.delete(key);
    }
    this.onChange();
  }

  private draw(
    kind: EntityKind,
    ring: string,
    name: string,
    portrait: ImageBitmap | null,
    selected: boolean,
  ): Texture {
    const root = new Container();
    if (selected) {
      // Anel duplo ouro-300 com brilho (docs/05 › Token de personagem).
      root.addChild(
        shapePath(new Graphics(), kind, FACE_SIZE + HALO * 1.6).stroke({
          width: 8,
          color: this.palette.goldLight,
          alpha: 0.35,
        }),
        shapePath(new Graphics(), kind, FACE_SIZE + HALO * 0.8).stroke({
          width: 3,
          color: this.palette.goldLight,
        }),
      );
    }
    root.addChild(shapePath(new Graphics(), kind, FACE_SIZE).fill(ring));
    const inner = FACE_SIZE - 2 * (kind === 'character' || kind === 'location' ? RING : RING * 1.5);
    root.addChild(shapePath(new Graphics(), kind, inner).fill(this.palette.leather));

    const content = this.content(kind, ring, name, portrait, inner);
    if (content) root.addChild(content);

    const texture = this.renderer.generateTexture({
      target: root,
      resolution: 1,
      antialias: true,
    });
    // A textura do retrato era só para compor; o bitmap fica no cache para outras faces.
    const portraitTexture = content instanceof Container ? findPortrait(content) : null;
    root.destroy({ children: true });
    portraitTexture?.destroy(true);
    return texture;
  }

  private content(
    kind: EntityKind,
    ring: string,
    name: string,
    portrait: ImageBitmap | null,
    inner: number,
  ): Container | null {
    if (portrait) {
      const sprite = new Sprite({
        texture: new Texture({ source: new ImageSource({ resource: portrait }) }),
        anchor: 0.5,
      });
      // Cobre o miolo (object-fit: cover) e recorta na forma do tipo.
      const scale = inner / Math.min(portrait.width, portrait.height);
      sprite.scale.set(scale);
      const mask = shapePath(new Graphics(), kind, inner).fill(0xffffff);
      const holder = new Container();
      holder.addChild(sprite, mask);
      sprite.mask = mask;
      return holder;
    }
    if (!this.fontsReady) return null;
    const text =
      kind === 'character'
        ? new Text({
            text: initialOf(name),
            style: {
              fontFamily: this.palette.fontBook,
              fontSize: inner * 0.55,
              fill: this.palette.parchment,
            },
          })
        : new Text({
            text: KIND_ICONS[kind],
            style: { fontFamily: ICON_FONT, fontWeight: '300', fontSize: inner * 0.6, fill: ring },
          });
    text.anchor.set(0.5);
    return text;
  }
}

function findPortrait(container: Container): Texture | null {
  const sprite = container.children.find((child) => child instanceof Sprite);
  return sprite instanceof Sprite ? sprite.texture : null;
}

/** Baixa e decodifica uma imagem (object URL local ou URL assinada). */
export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`imagem indisponível (${response.status})`);
  return createImageBitmap(await response.blob());
}
