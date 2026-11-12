import type { MapLink, MapToken, TokenKeyframe } from '../models';
import {
  applySceneChange,
  invertSceneChange,
  isEmptySceneChange,
  type SceneChange,
  type SceneContent,
} from './scene-change';

function token(id: string): MapToken {
  return {
    id,
    worldId: 'w',
    mapId: 'm',
    entityId: `e-${id}`,
    eventId: null,
    size: 1,
    style: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function keyframe(id: string, tokenId: string, tick: number, x = 0): TokenKeyframe {
  return {
    id,
    worldId: 'w',
    tokenId,
    tick,
    x,
    y: 0,
    visible: true,
    interpolation: 'linear',
    note: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function link(id: string): MapLink {
  return { id, worldId: 'w', mapId: 'm', targetMapId: 'x', polygon: [] };
}

const scene: SceneContent = {
  tokens: [token('t1')],
  keyframes: [keyframe('k1', 't1', 0), keyframe('k2', 't1', 10, 5)],
  links: [link('l1')],
};

/** Aplicar e depois desfazer devolve a cena original (a menos da ordem). */
function roundTrip(change: SceneChange): void {
  const inverse = invertSceneChange(scene, change);
  const restored = applySceneChange(applySceneChange(scene, change), inverse);
  const byId = <T extends { id: string }>(list: readonly T[]) =>
    [...list].sort((a, b) => a.id.localeCompare(b.id));
  expect(byId(restored.tokens)).toEqual(byId(scene.tokens));
  expect(byId(restored.keyframes)).toEqual(byId(scene.keyframes));
  expect(byId(restored.links)).toEqual(byId(scene.links));
}

describe('applySceneChange', () => {
  it('puts a new token with its keyframe', () => {
    const next = applySceneChange(scene, {
      putTokens: [token('t2')],
      putKeyframes: [keyframe('k3', 't2', 5)],
    });
    expect(next.tokens.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(next.keyframes.map((k) => k.id)).toEqual(['k1', 'k3', 'k2']);
  });

  it('replaces a keyframe at the same tick, like the database upsert', () => {
    const next = applySceneChange(scene, { putKeyframes: [keyframe('kx', 't1', 10, 99)] });
    expect(next.keyframes.map((k) => [k.id, k.x])).toEqual([
      ['k1', 0],
      ['kx', 99],
    ]);
  });

  it('removes a token with its keyframes', () => {
    const next = applySceneChange(scene, { removeTokens: ['t1'] });
    expect(next.tokens).toEqual([]);
    expect(next.keyframes).toEqual([]);
  });

  it('puts and removes links', () => {
    const next = applySceneChange(scene, { putLinks: [link('l2')], removeLinks: ['l1'] });
    expect(next.links.map((l) => l.id)).toEqual(['l2']);
  });
});

describe('invertSceneChange', () => {
  it('undoes a new token', () => {
    roundTrip({ putTokens: [token('t2')], putKeyframes: [keyframe('k3', 't2', 5)] });
  });

  it('undoes a moved keyframe', () => {
    roundTrip({ putKeyframes: [keyframe('k2', 't1', 10, 50)] });
  });

  it('undoes a keyframe written over another at the same tick', () => {
    roundTrip({ putKeyframes: [keyframe('kx', 't1', 10, 50)] });
  });

  it('undoes a removed token, bringing its keyframes back', () => {
    const inverse = invertSceneChange(scene, { removeTokens: ['t1'] });
    expect(inverse.putKeyframes?.map((k) => k.id).sort()).toEqual(['k1', 'k2']);
    roundTrip({ removeTokens: ['t1'] });
  });

  it('undoes removed keyframes and links', () => {
    roundTrip({ removeKeyframes: ['k1'], removeLinks: ['l1'], putLinks: [link('l2')] });
  });

  it('does not restore a keyframe twice when its token is also removed', () => {
    const inverse = invertSceneChange(scene, { removeTokens: ['t1'], removeKeyframes: ['k1'] });
    expect(inverse.putKeyframes).toHaveLength(2);
  });
});

describe('isEmptySceneChange', () => {
  it('tells whether a change writes anything', () => {
    expect(isEmptySceneChange({})).toBe(true);
    expect(isEmptySceneChange({ putTokens: [], removeLinks: [] })).toBe(true);
    expect(isEmptySceneChange({ removeLinks: ['l1'] })).toBe(false);
  });
});
