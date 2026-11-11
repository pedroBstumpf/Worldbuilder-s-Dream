import type { Json, JsonObject, Uuid } from '@domain/models';

/** Estado das barras do mapa (docs/04 › Layout VTT). */
export interface BarPrefs {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Largura da barra direita (Explorar), em px. */
  rightWidth: number;
}

export const EXPLORER_WIDTH = { min: 260, default: 320, max: 520 } as const;

export const DEFAULT_BAR_PREFS: BarPrefs = {
  leftCollapsed: false,
  rightCollapsed: false,
  rightWidth: EXPLORER_WIDTH.default,
};

/** Câmera salva por mapa (`ui_prefs.cameras[mapId]`). */
export interface SavedCamera {
  x: number;
  y: number;
  zoom: number;
}

/** Quantas câmeras guardar (as mais antigas saem, para caber nos 16 kB de `ui_prefs`). */
export const MAX_SAVED_CAMERAS = 60;

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: Json | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function clampExplorerWidth(width: number): number {
  return Math.round(Math.min(EXPLORER_WIDTH.max, Math.max(EXPLORER_WIDTH.min, width)));
}

/** Lê `ui_prefs.bars`, tolerante a valores ausentes ou de versões antigas. */
export function readBarPrefs(prefs: JsonObject): BarPrefs {
  const bars = prefs['bars'];
  if (!isObject(bars)) return DEFAULT_BAR_PREFS;
  const width = finite(bars['rightWidth']);
  return {
    leftCollapsed: bars['leftCollapsed'] === true,
    rightCollapsed: bars['rightCollapsed'] === true,
    rightWidth: width === null ? EXPLORER_WIDTH.default : clampExplorerWidth(width),
  };
}

export function writeBarPrefs(bars: BarPrefs): JsonObject {
  return { ...bars };
}

export function readCamera(prefs: JsonObject, mapId: Uuid): SavedCamera | null {
  const cameras = prefs['cameras'];
  if (!isObject(cameras)) return null;
  const camera = cameras[mapId];
  if (!isObject(camera)) return null;
  const x = finite(camera['x']);
  const y = finite(camera['y']);
  const zoom = finite(camera['zoom']);
  return x === null || y === null || zoom === null || zoom <= 0 ? null : { x, y, zoom };
}

/**
 * Novo `ui_prefs.cameras` com a câmera do mapa no fim (a mais recente); acima de
 * `MAX_SAVED_CAMERAS`, as primeiras (mais antigas) saem.
 */
export function writeCamera(prefs: JsonObject, mapId: Uuid, camera: SavedCamera): JsonObject {
  const current = isObject(prefs['cameras']) ? prefs['cameras'] : {};
  const entries = Object.entries(current).filter(([id]) => id !== mapId);
  const rounded = {
    x: Math.round(camera.x * 10) / 10,
    y: Math.round(camera.y * 10) / 10,
    zoom: Math.round(camera.zoom * 10000) / 10000,
  };
  entries.push([mapId, rounded]);
  return Object.fromEntries(entries.slice(-MAX_SAVED_CAMERAS));
}
