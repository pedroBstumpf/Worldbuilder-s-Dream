import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { WorldMap } from '@domain/models';
import type { MapScene } from '@domain/ports';
import type { Point } from '@domain/geometry';
import type { EventMarkerInput, ImageVersionInput, LayerId, ToolId } from '@engine/map-engine';
import { fakeMapEngineFactory } from '@engine/testing/fake-map-engine';
import { MapCanvasComponent, type CameraChange } from './map-canvas.component';
import { ENTITY_DRAG_TYPE, EntityDrag } from './entity-drag';
import { MAP_ENGINE_FACTORY } from './map-engine.token';

const map: WorldMap = {
  id: 'm1',
  worldId: 'w',
  parentMapId: null,
  name: 'Valmora',
  imageAssetId: null,
  width: 1000,
  height: 500,
  scaleValue: null,
  scaleUnit: null,
  scaleLabel: null,
  sortOrder: 0,
  version: 1,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
};

function scene(links: MapScene['links'] = []): MapScene {
  return { map, tokens: [], keyframes: [], annotations: [], links, imageVersions: [] };
}

@Component({
  imports: [MapCanvasComponent],
  template: `
    <wd-map-canvas
      [scene]="scene()"
      [image]="image()"
      [tool]="tool()"
      [hiddenLayers]="hidden()"
      [savedCamera]="saved"
      [mapNames]="{ m2: 'Porto' }"
      [time]="time()"
      [instantTime]="instant()"
      [imageVersions]="versions()"
      [events]="events()"
      [eventWindow]="0"
      (cameraChange)="cameras.push($event)"
      (openMap)="opened.push($event)"
      (pointPicked)="picked.push($event)"
      (openEvent)="openedEvents.push($event)"
      [selection]="selection()"
      (tokenMoved)="moved.push($event)"
      (tokenSelected)="selected.push($event)"
      (tokenOpen)="openedTokens.push($event)"
      (tokenMenu)="menus.push($event)"
      (entityDropped)="dropped.push($event)"
      [activeAnnotation]="active()"
      (annotationCreated)="created.push($event)"
      (annotationChanged)="changed.push($event)"
      (annotationErased)="erased.push($event)"
      (annotationPicked)="pickedAnnotations.push($event)"
    />
  `,
})
class HostComponent {
  readonly scene = signal<MapScene | null>(scene());
  readonly image = signal<string | null>('blob:a');
  readonly tool = signal<ToolId>('pan');
  readonly hidden = signal<readonly LayerId[]>([]);
  readonly saved = (id: string) => (id === 'm1' ? { x: 10, y: 20, zoom: 2 } : null);
  readonly cameras: CameraChange[] = [];
  readonly opened: string[] = [];
  readonly time = signal(0);
  readonly instant = signal(false);
  readonly versions = signal<ImageVersionInput[]>([]);
  readonly events = signal<EventMarkerInput[]>([]);
  readonly picked: Point[] = [];
  readonly openedEvents: string[] = [];
  readonly selection = signal<readonly string[]>([]);
  readonly moved: unknown[] = [];
  readonly selected: string[][] = [];
  readonly openedTokens: string[] = [];
  readonly menus: unknown[] = [];
  readonly dropped: { entityId: string; point: Point }[] = [];
  readonly active = signal<string | null>(null);
  readonly created: unknown[] = [];
  readonly changed: unknown[] = [];
  readonly erased: string[][] = [];
  readonly pickedAnnotations: { id: string; anchor: Point; fromList: boolean }[] = [];
}

/** O jsdom não cria `DragEvent` com `dataTransfer`: monta um evento com os dados do arraste. */
function dragEvent(type: string, data: Record<string, string>, x = 0, y = 0): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y, relatedTarget: null });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: Object.keys(data), getData: (t: string) => data[t] ?? '', dropEffect: 'none' },
  });
  return event;
}

const battle: EventMarkerInput = {
  id: 'e1',
  title: 'Batalha do Vau',
  tickStart: 100,
  tickEnd: 200,
  color: null,
  locationEntityId: null,
};

describe('MapCanvasComponent', () => {
  async function setUp() {
    const { engine, factory } = fakeMapEngineFactory();
    TestBed.configureTestingModule({
      providers: [{ provide: MAP_ENGINE_FACTORY, useValue: factory }],
    });
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    // O motor monta depois da primeira renderização.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    return { engine, fixture, host: fixture.componentInstance };
  }

  it('loads the scene and restores the saved camera', async () => {
    const { engine } = await setUp();

    expect(engine.host).not.toBeNull();
    expect(engine.scene?.map.id).toBe('m1');
    expect(engine.image).toBe('blob:a');
    expect(engine.camera).toEqual({ center: { x: 10, y: 20 }, zoom: 2 });
  });

  it('patches links without reloading and forwards tool and layers', async () => {
    const { engine, fixture, host } = await setUp();
    const fits = engine.fits;
    host.scene.set(scene([{ id: 'l', worldId: 'w', mapId: 'm1', targetMapId: 'm2', polygon: [] }]));
    host.tool.set('link');
    host.hidden.set(['tokens']);
    await fixture.whenStable();

    expect(engine.fits).toBe(fits);
    expect(engine.patches.map((p) => p.type).slice(-3)).toEqual(['links', 'tokens', 'annotations']);
    expect(engine.tool).toBe('link');
    expect([...engine.hiddenLayers]).toEqual(['tokens']);
    const button = fixture.nativeElement.querySelector('nav button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Abrir mapa: Porto');
    button.click();
    expect(host.opened).toEqual(['m2']);
  });

  it('turns engine events into outputs and handles the keyboard', async () => {
    const { engine, fixture, host } = await setUp();
    engine.events.emit({ type: 'camera', center: { x: 1, y: 2 }, zoom: 3 });
    engine.events.emit({ type: 'link:open', linkId: 'l', targetMapId: 'm9' });

    expect(host.cameras).toEqual([
      { mapId: 'm1', camera: { type: 'camera', center: { x: 1, y: 2 }, zoom: 3 } },
    ]);
    expect(host.opened).toEqual(['m9']);

    const canvas = fixture.nativeElement.querySelector('[role="application"]') as HTMLElement;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    expect(engine.camera.zoom).toBe(2.5);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(engine.camera.center.x).toBe(10 + 80 / 2.5);
  });

  it('destroys the engine with the component', async () => {
    const { engine, fixture } = await setUp();
    fixture.destroy();
    expect(engine.destroyed).toBe(true);
  });

  it('passes the time and the events to the engine', async () => {
    const { engine, fixture, host } = await setUp();
    host.time.set(150);
    host.events.set([battle]);
    await fixture.whenStable();
    expect(engine.tick).toBe(150);
    expect(engine.patches.at(-1)).toEqual({ type: 'events', events: [battle], window: 0 });
  });

  it('sends the image versions of the scene map and asks for instant swaps', async () => {
    const { engine, fixture, host } = await setUp();
    const versions = [{ id: 'v1', tickStart: 50, url: 'blob:v1' }];
    host.versions.set(versions);
    await fixture.whenStable();
    expect(engine.patches).toContainEqual({ type: 'imageVersions', mapId: 'm1', versions });

    host.instant.set(true);
    host.time.set(90);
    await fixture.whenStable();
    expect(engine.tick).toBe(90);
    expect(engine.instantTime).toBe(true);
  });

  it('turns picked points and marker clicks into outputs', async () => {
    const { engine, host } = await setUp();
    engine.events.emit({ type: 'point:picked', point: { x: 3, y: 4 } });
    engine.events.emit({ type: 'event:open', eventId: 'e1' });
    expect(host.picked).toEqual([{ x: 3, y: 4 }]);
    expect(host.openedEvents).toEqual(['e1']);
  });

  it('lists the events visible on this map as buttons', async () => {
    const { fixture, host } = await setUp();
    const placed: MapScene = {
      ...scene(),
      tokens: [
        {
          id: 't1',
          worldId: 'w',
          mapId: 'm1',
          entityId: null,
          eventId: 'e1',
          size: 1,
          style: {},
          createdAt: '',
        },
      ],
    };
    host.scene.set(placed);
    host.events.set([battle]);
    host.time.set(50);
    await fixture.whenStable();
    const buttons = () =>
      Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>).map(
        (b) => b.textContent?.trim(),
      );
    expect(buttons()).not.toContain('Abrir evento: Batalha do Vau');
    host.time.set(150);
    await fixture.whenStable();
    expect(buttons()).toContain('Abrir evento: Batalha do Vau');
    (
      fixture.nativeElement.querySelector(
        'nav[aria-label="Eventos visíveis no mapa"] button',
      ) as HTMLButtonElement
    ).click();
    expect(host.openedEvents).toEqual(['e1']);
  });

  it('turns token events into outputs and passes the selection', async () => {
    const { engine, fixture, host } = await setUp();
    engine.events.emit({
      type: 'token:moved',
      tokenId: 't1',
      to: { x: 5, y: 6 },
      tick: 0,
      correctPrevious: true,
    });
    engine.events.emit({ type: 'token:selected', ids: ['t1', 't2'] });
    engine.events.emit({ type: 'token:open', tokenId: 't1' });
    engine.events.emit({ type: 'token:menu', tokenId: 't1', anchor: { x: 1, y: 2 } });
    // O menu espera o `contextmenu` nativo (que o CDK fecharia como clique fora).
    expect(host.menus).toEqual([]);
    const canvas = fixture.nativeElement.querySelector('[role="application"]') as HTMLElement;
    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);
    await new Promise((resolve) => setTimeout(resolve));
    expect(host.moved).toEqual([{ tokenId: 't1', to: { x: 5, y: 6 }, correctPrevious: true }]);
    expect(host.selected).toEqual([['t1', 't2']]);
    expect(host.openedTokens).toEqual(['t1']);
    expect(host.menus).toEqual([{ tokenId: 't1', anchor: { x: 1, y: 2 } }]);

    host.selection.set(['t2']);
    await fixture.whenStable();
    expect(engine.selection).toEqual(['t2']);
  });

  it('previews and drops an entity dragged from the explorer', async () => {
    const { engine, fixture, host } = await setUp();
    TestBed.inject(EntityDrag).entityId.set('e7');
    const canvas = fixture.nativeElement.querySelector('[role="application"]') as HTMLElement;

    const over = dragEvent('dragover', { [ENTITY_DRAG_TYPE]: '' }, 40, 50);
    canvas.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(engine.drop).toEqual({ entityId: 'e7', clientX: 40, clientY: 50 });

    canvas.dispatchEvent(dragEvent('drop', { [ENTITY_DRAG_TYPE]: 'e7' }, 2000, 50));
    expect(engine.drop).toBeNull();
    // Fora do mapa (1000 × 500), o ponto fica na borda.
    expect(host.dropped).toEqual([{ entityId: 'e7', point: { x: 1000, y: 50 } }]);
    expect(TestBed.inject(EntityDrag).entityId()).toBeNull();
  });

  it('ignores drags that are not entities', async () => {
    const { engine, fixture } = await setUp();
    const canvas = fixture.nativeElement.querySelector('[role="application"]') as HTMLElement;
    const over = dragEvent('dragover', { Files: '' });
    canvas.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    expect(engine.drop).toBeNull();
  });

  it('turns annotation events into outputs and lists the visible annotations', async () => {
    const { engine, fixture, host } = await setUp();
    const pin = { kind: 'pin', at: { x: 5, y: 6 }, color: '#a33a2a', icon: 'castle' } as const;
    engine.events.emit({ type: 'annotation:created', draft: pin });
    engine.events.emit({ type: 'annotation:changed', id: 'a1', shape: pin });
    engine.events.emit({ type: 'annotation:erased', ids: ['a2'] });
    engine.events.emit({ type: 'annotation:picked', id: 'a1', anchor: { x: 1, y: 2 } });
    expect(host.created).toEqual([pin]);
    expect(host.changed).toEqual([{ id: 'a1', shape: pin }]);
    expect(host.erased).toEqual([['a2']]);
    expect(host.pickedAnnotations).toEqual([{ id: 'a1', anchor: { x: 1, y: 2 }, fromList: false }]);

    const base = {
      worldId: 'w',
      mapId: 'm1',
      style: {},
      entityId: null,
      eventId: null,
      zIndex: 0,
      version: 1,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
    };
    host.scene.set({
      ...scene(),
      annotations: [
        {
          ...base,
          id: 'a1',
          kind: 'pin',
          geometry: { x: 5, y: 6 },
          title: 'Forte',
          tickStart: null,
          tickEnd: null,
        },
        {
          ...base,
          id: 'a2',
          kind: 'label',
          geometry: { x: 1, y: 1 },
          title: 'Reino',
          tickStart: 300,
          tickEnd: 450,
        },
      ],
    });
    host.active.set('a1');
    await fixture.whenStable();
    expect(engine.patches.at(-1)).toEqual(expect.objectContaining({ type: 'annotations' }));
    expect(engine.activeAnnotation).toBe('a1');
    const items = () =>
      [...fixture.nativeElement.querySelectorAll('[data-annotation]')].map((b: HTMLElement) =>
        b.textContent?.trim(),
      );
    expect(items()).toEqual(['Pino: Forte']);
    host.time.set(400);
    await fixture.whenStable();
    expect(items()).toEqual(['Pino: Forte', 'Rótulo: Reino']);

    (fixture.nativeElement.querySelector('[data-annotation="a1"]') as HTMLButtonElement).click();
    expect(host.pickedAnnotations.at(-1)).toEqual({
      id: 'a1',
      anchor: { x: 5, y: 6 },
      fromList: true,
    });
  });
});
