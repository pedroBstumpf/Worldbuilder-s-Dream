import type { MapToken, TokenKeyframe } from '@domain/models';
import type { EventMarkerInput } from '../map-engine';
import type { EnginePalette } from '../render/engine-palette';
import { EventLayer } from './event-layer';

const PALETTE: EnginePalette = {
  backdrop: '#1f140d',
  gold: '#d9b25f',
  goldLight: '#e8c97a',
  goldDark: '#b8903f',
  leather: '#3a2618',
  leatherDark: '#2b1c12',
  parchment: '#f4ead3',
  parchmentDark: '#c9b48e',
  danger: '#e07a5f',
  bronze: '#9c7a4e',
  copper: '#8c5a3c',
  brass: '#b5a27a',
  fontBook: 'serif',
};

function event(
  id: string,
  tickStart: number,
  tickEnd: number | null,
  location: string | null = null,
): EventMarkerInput {
  return { id, title: id, tickStart, tickEnd, color: null, locationEntityId: location };
}

function token(id: string, eventId: string): MapToken {
  return {
    id,
    worldId: 'w',
    mapId: 'm',
    entityId: null,
    eventId,
    size: 1,
    style: {},
    createdAt: '',
  };
}

function keyframe(tokenId: string, x: number, y: number): TokenKeyframe {
  return {
    id: `kf-${tokenId}`,
    worldId: 'w',
    tokenId,
    tick: 0,
    x,
    y,
    visible: true,
    interpolation: 'step',
    note: null,
    updatedAt: '',
  };
}

describe('EventLayer', () => {
  const opened: string[] = [];
  const locations = new Map<string, { x: number; y: number }>();
  let layer: EventLayer;

  beforeEach(() => {
    opened.length = 0;
    locations.clear();
    layer = new EventLayer(PALETTE, true, {
      locationOf: (id) => locations.get(id) ?? null,
      onOpen: (id) => opened.push(id),
      onHover: () => undefined,
    });
  });

  afterEach(() => layer.destroy());

  it('mostra o evento só durante as datas, no ponto do token', () => {
    layer.setEvents([event('batalha', 100, 200)], 0);
    layer.setTokens([token('t1', 'batalha')], [keyframe('t1', 40, 60)]);
    layer.setTime(50);
    expect(layer.visibleIds()).toEqual([]);
    layer.setTime(150);
    expect(layer.visibleIds()).toEqual(['batalha']);
    expect(layer.pointOf('batalha')).toEqual({ x: 40, y: 60 });
    layer.setTime(201);
    expect(layer.visibleIds()).toEqual([]);
  });

  it('estende os eventos pontuais pela janela', () => {
    layer.setEvents([event('eclipse', 100, null)], 30);
    layer.setTokens([token('t1', 'eclipse')], [keyframe('t1', 1, 1)]);
    layer.setTime(120);
    expect(layer.visibleIds()).toEqual(['eclipse']);
    layer.setTime(131);
    expect(layer.visibleIds()).toEqual([]);
  });

  it('usa o token do local quando o evento não tem ponto próprio', () => {
    layer.setEvents([event('feira', 0, 10, 'cidade')], 0);
    layer.setTime(5);
    expect(layer.visibleIds()).toEqual([]);
    locations.set('cidade', { x: 7, y: 8 });
    layer.update();
    expect(layer.visibleIds()).toEqual(['feira']);
    expect(layer.pointOf('feira')).toEqual({ x: 7, y: 8 });
  });

  it('remove marcadores de eventos que saíram da lista', () => {
    layer.setEvents([event('a', 0, 10), event('b', 0, 10)], 0);
    layer.setTokens(
      [token('ta', 'a'), token('tb', 'b')],
      [keyframe('ta', 1, 1), keyframe('tb', 2, 2)],
    );
    layer.setTime(5);
    expect(layer.visibleIds().sort()).toEqual(['a', 'b']);
    layer.setEvents([event('b', 0, 10)], 0);
    expect(layer.visibleIds()).toEqual(['b']);
  });
});
