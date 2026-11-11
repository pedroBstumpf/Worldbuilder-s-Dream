import { InjectionToken } from '@angular/core';
import { createPixiMapEngine } from '@engine/create-map-engine';
import type { MapEngineFactory } from '@engine/map-engine';

/** Fábrica do motor; os testes fornecem `fakeMapEngineFactory()`. */
export const MAP_ENGINE_FACTORY = new InjectionToken<MapEngineFactory>('MAP_ENGINE_FACTORY', {
  providedIn: 'root',
  factory: () => createPixiMapEngine,
});
