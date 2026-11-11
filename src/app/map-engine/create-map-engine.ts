import type { MapEngineFactory } from './map-engine';

/** Fábrica padrão: carrega o PixiJS sob demanda (chunk próprio, docs/04 › Desempenho). */
export const createPixiMapEngine: MapEngineFactory = async (options) => {
  const { PixiMapEngine } = await import('./render/pixi-map-engine');
  return new PixiMapEngine(options);
};
