import type { MapAnnotation } from '../models/annotation';
import type { Uuid } from '../models/common';
import type { MapLink } from '../models/map';
import type { MapToken, TokenKeyframe } from '../models/token';

/**
 * Uma edição do mapa como conjunto de gravações (docs/04 › Estado): o que é posto
 * (criado ou substituído) e o que é removido. Remover um token remove os keyframes dele.
 * A inversa (`invertSceneChange`) é a edição que desfaz esta.
 */
export interface SceneChange {
  readonly putTokens?: readonly MapToken[];
  readonly removeTokens?: readonly Uuid[];
  readonly putKeyframes?: readonly TokenKeyframe[];
  readonly removeKeyframes?: readonly Uuid[];
  readonly putLinks?: readonly MapLink[];
  readonly removeLinks?: readonly Uuid[];
  readonly putAnnotations?: readonly MapAnnotation[];
  readonly removeAnnotations?: readonly Uuid[];
}

/** A parte da cena (`MapScene`) que as edições tocam. */
export interface SceneContent {
  readonly tokens: readonly MapToken[];
  readonly keyframes: readonly TokenKeyframe[];
  readonly links: readonly MapLink[];
  readonly annotations: readonly MapAnnotation[];
}

/** Keyframe que `put` substitui: mesmo id ou mesmo `(tokenId, tick)` (upsert do banco). */
function replacedKeyframe(
  keyframes: readonly TokenKeyframe[],
  keyframe: TokenKeyframe,
): TokenKeyframe | undefined {
  return keyframes.find(
    (k) => k.id === keyframe.id || (k.tokenId === keyframe.tokenId && k.tick === keyframe.tick),
  );
}

function upsert<T extends { id: Uuid }>(list: readonly T[], items: readonly T[]): T[] {
  const ids = new Set(items.map((item) => item.id));
  return [...list.filter((item) => !ids.has(item.id)), ...items];
}

/** Aplica a edição ao conteúdo da cena; keyframes ficam em ordem crescente de tick. */
export function applySceneChange<T extends SceneContent>(scene: T, change: SceneChange): T {
  const removedTokens = new Set(change.removeTokens ?? []);
  const removedKeyframes = new Set(change.removeKeyframes ?? []);
  const removedLinks = new Set(change.removeLinks ?? []);
  const put = change.putKeyframes ?? [];

  const tokens = upsert(
    scene.tokens.filter((t) => !removedTokens.has(t.id)),
    change.putTokens ?? [],
  );
  const kept = scene.keyframes.filter(
    (k) =>
      !removedKeyframes.has(k.id) &&
      !removedTokens.has(k.tokenId) &&
      !put.some((p) => p.id === k.id || (p.tokenId === k.tokenId && p.tick === k.tick)),
  );
  const keyframes = [...kept, ...put.filter((k) => !removedKeyframes.has(k.id))].sort(
    (a, b) => a.tick - b.tick,
  );
  const links = upsert(
    scene.links.filter((l) => !removedLinks.has(l.id)),
    change.putLinks ?? [],
  );
  const removedAnnotations = new Set(change.removeAnnotations ?? []);
  const annotations = upsert(
    scene.annotations.filter((a) => !removedAnnotations.has(a.id)),
    change.putAnnotations ?? [],
  );
  return { ...scene, tokens, keyframes, links, annotations };
}

/** Edição que desfaz `change`, calculada a partir da cena **antes** de aplicá-la. */
export function invertSceneChange(scene: SceneContent, change: SceneChange): SceneChange {
  const putTokens: MapToken[] = [];
  const removeTokens: Uuid[] = [];
  const putKeyframes = new Map<Uuid, TokenKeyframe>();
  const removeKeyframes: Uuid[] = [];
  const putLinks: MapLink[] = [];
  const removeLinks: Uuid[] = [];
  const putAnnotations: MapAnnotation[] = [];
  const removeAnnotations: Uuid[] = [];

  for (const token of change.putTokens ?? []) {
    const old = scene.tokens.find((t) => t.id === token.id);
    if (old) putTokens.push(old);
    else removeTokens.push(token.id);
  }
  for (const id of change.removeTokens ?? []) {
    const old = scene.tokens.find((t) => t.id === id);
    if (!old) continue;
    putTokens.push(old);
    for (const k of scene.keyframes) if (k.tokenId === id) putKeyframes.set(k.id, k);
  }
  for (const keyframe of change.putKeyframes ?? []) {
    const old = replacedKeyframe(scene.keyframes, keyframe);
    if (old) putKeyframes.set(old.id, old);
    else removeKeyframes.push(keyframe.id);
  }
  for (const id of change.removeKeyframes ?? []) {
    const old = scene.keyframes.find((k) => k.id === id);
    if (old) putKeyframes.set(old.id, old);
  }
  for (const link of change.putLinks ?? []) {
    const old = scene.links.find((l) => l.id === link.id);
    if (old) putLinks.push(old);
    else removeLinks.push(link.id);
  }
  for (const id of change.removeLinks ?? []) {
    const old = scene.links.find((l) => l.id === id);
    if (old) putLinks.push(old);
  }
  for (const annotation of change.putAnnotations ?? []) {
    const old = scene.annotations.find((a) => a.id === annotation.id);
    if (old) putAnnotations.push(old);
    else removeAnnotations.push(annotation.id);
  }
  for (const id of change.removeAnnotations ?? []) {
    const old = scene.annotations.find((a) => a.id === id);
    if (old) putAnnotations.push(old);
  }

  return {
    putTokens,
    removeTokens,
    putKeyframes: [...putKeyframes.values()],
    removeKeyframes,
    putLinks,
    removeLinks,
    putAnnotations,
    removeAnnotations,
  };
}

/** A edição não grava nada. */
export function isEmptySceneChange(change: SceneChange): boolean {
  return Object.values(change).every((list: readonly unknown[] | undefined) => !list?.length);
}
