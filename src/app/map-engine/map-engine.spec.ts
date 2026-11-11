import { EngineEventBus, type EngineEvent } from './map-engine';

describe('EngineEventBus', () => {
  it('delivers typed events and unsubscribes', () => {
    const bus = new EngineEventBus();
    const all: EngineEvent[] = [];
    const opened: string[] = [];
    const stopAll = bus.subscribe((event) => all.push(event));
    bus.on('link:open', (event) => opened.push(event.targetMapId));

    bus.emit({ type: 'link:open', linkId: 'l', targetMapId: 'm2' });
    bus.emit({ type: 'camera', center: { x: 1, y: 2 }, zoom: 3 });
    stopAll();
    bus.emit({ type: 'link:open', linkId: 'l', targetMapId: 'm3' });

    expect(all.map((e) => e.type)).toEqual(['link:open', 'camera']);
    expect(opened).toEqual(['m2', 'm3']);

    bus.clear();
    bus.emit({ type: 'link:open', linkId: 'l', targetMapId: 'm4' });
    expect(opened).toEqual(['m2', 'm3']);
  });
});
