import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { WorldMap } from '@domain/models';
import type { MapScene } from '@domain/ports';
import type { LayerId, ToolId } from '@engine/map-engine';
import { fakeMapEngineFactory } from '@engine/testing/fake-map-engine';
import { MapCanvasComponent, type CameraChange } from './map-canvas.component';
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
  return { map, tokens: [], keyframes: [], annotations: [], links };
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
      (cameraChange)="cameras.push($event)"
      (openMap)="opened.push($event)"
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
}

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
    expect(engine.patches.at(-1)).toMatchObject({ type: 'links' });
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
});
