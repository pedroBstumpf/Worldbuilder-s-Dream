import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Location } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  type ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { DEMO_MODE } from '@core/data-source/demo-mode';
import { BookMotionService } from '@core/motion/book-motion.service';
import { BookTransitions } from '@core/motion/book-transitions.service';
import { readCamera, writeBarPrefs, writeCamera, type BarPrefs } from '@core/prefs/ui-prefs';
import { UiPrefsStore } from '@core/prefs/ui-prefs.store';
import { ShortcutService } from '@core/shortcuts/shortcut.service';
import { DEMO_STRINGS } from '@core/strings/demo.strings';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { WORLD_STRINGS } from '@core/strings/world.strings';
import type { Point } from '@domain/geometry';
import { mapNameFromFile } from '@domain/maps';
import type { PolygonVertex, Uuid } from '@domain/models';
import { MapImageError, readMapImage, type ProcessedMapImage } from '@engine/import/read-map-image';
import type { LayerId, ToolId, ViewportInsets } from '@engine/map-engine';
import { DemoBadgeComponent } from '@shared/ui/demo-badge/demo-badge.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { ToastService } from '@shared/ui/toast/toast.service';
import { firstValueFrom } from 'rxjs';
import {
  ImportChoiceDialogComponent,
  type ImportChoice,
} from '../import/import-choice-dialog.component';
import { MapImportAreaComponent } from '../import/map-import-area.component';
import { MapImportDirective } from '../import/map-import.directive';
import { pickImageFile } from '../import/pick-image-file';
import { MapCanvasComponent, type CameraChange } from '../map/map-canvas.component';
import {
  LinkTargetDialogComponent,
  RenameMapDialogComponent,
  ScaleDialogComponent,
  type LinkTargetData,
  type ScaleDialogData,
  type ScaleDialogResult,
} from '../map/map-dialogs';
import { MapTitleComponent, type MapTitleAction } from '../map/map-title.component';
import { MapStore } from '../state/map.store';
import { WorldStore } from '../state/world.store';
import { ExplorerPanelComponent } from './explorer-panel.component';
import { LeftToolbarComponent, type ToggleableLayer } from './left-toolbar.component';

/** Como a tela chegou: zoom vindo do livro, fade (movimento reduzido) ou direto. */
type Entrance = 'zoom' | 'fade' | 'none';

/** Alturas e larguras das barras, para o motor enquadrar o mapa na área livre. */
const TOP_BAR = 48;
const LEFT_BAR = 12 + 58 + 8;
const GAP = 8;

/** Elementos onde Espaço e Enter já têm função própria. */
const INTERACTIVE = 'button, a, input, select, textarea, [role="menuitem"], [role="separator"]';

/**
 * Tela do mundo (docs/04 › Layout VTT): canvas em tela cheia (ou a área de importação,
 * se o mundo não tem mapa), barra superior com o seletor de mapas, ferramentas à esquerda
 * e Explorar à direita. O host do mapa compartilha `view-transition-name: wd-world-map`
 * com a página do livro, o que cria o zoom contínuo (ADR-0011).
 */
@Component({
  selector: 'wd-world-shell-page',
  imports: [
    DemoBadgeComponent,
    ExplorerPanelComponent,
    IconButtonComponent,
    LeftToolbarComponent,
    MapCanvasComponent,
    MapImportAreaComponent,
    MapImportDirective,
    MapTitleComponent,
  ],
  providers: [WorldStore, MapStore],
  template: `
    <main
      class="map-host"
      aria-labelledby="wd-world-title"
      [attr.aria-busy]="store.status() === 'loading'"
      [attr.data-entrance]="entrance"
      #importer="wdMapImport"
      (wdMapImport)="importFile($event)"
      [wdMapImportDisabled]="busy() || store.status() !== 'ready'"
    >
      @if (store.activeMap()) {
        <wd-map-canvas
          #canvas
          [scene]="mapStore.scene()"
          [image]="mapStore.image()"
          [tool]="effectiveTool()"
          [hiddenLayers]="hiddenLayers()"
          [insets]="insets()"
          [savedCamera]="cameraFor"
          [mapNames]="mapNames()"
          (cameraChange)="saveCamera($event)"
          (measure)="onMeasure($event)"
          (regionDrawn)="onRegionDrawn($event)"
          (openMap)="openMap($event)"
          (toolProgress)="toolPoints.set($event)"
          (loadFailed)="toasts.show({ message: mapText.canvas.loadFailed, kind: 'error' })"
        />
        @if (importer.dragState() !== 'idle' || busy()) {
          <div class="drop-veil" [attr.data-drag]="importer.dragState()" aria-hidden="true">
            <p class="font-book text-2xl">
              {{
                busy()
                  ? mapText.import.preparing
                  : importer.dragState() === 'invalid'
                    ? mapText.import.notAnImage
                    : mapText.import.dropToCreate
              }}
            </p>
          </div>
        }
      } @else if (store.status() === 'ready') {
        <wd-map-import-area
          class="import"
          [dragState]="importer.dragState()"
          [busy]="busy()"
          (fileChosen)="importFile($event)"
        />
      }
    </main>

    @if (store.activeMap()) {
      <wd-left-toolbar
        [attr.data-entrance]="entrance"
        [tool]="tool()"
        [hiddenLayers]="hiddenLayers()"
        [collapsed]="bars().leftCollapsed"
        (toolChange)="setTool($event)"
        (zoom)="zoom($event)"
        (toggleLayer)="toggleLayer($event)"
        (collapsedChange)="setBars({ leftCollapsed: $event })"
      />
      <wd-explorer-panel
        [attr.data-entrance]="entrance"
        [width]="bars().rightWidth"
        [collapsed]="bars().rightCollapsed"
        (widthChange)="setBars({ rightWidth: $event })"
        (collapsedChange)="setBars({ rightCollapsed: $event })"
      />
      @if (hint(); as text) {
        <p class="hint wd-panel" aria-live="polite">{{ text }}</p>
      }
    }

    <header class="top-bar" [attr.data-entrance]="entrance">
      <button
        wd-icon-button
        type="button"
        icon="menu_book"
        tooltipPosition="below"
        [label]="text.backToLibrary"
        (click)="backToLibrary()"
      ></button>
      <h1
        #title
        id="wd-world-title"
        class="flex max-w-full min-w-0 justify-center justify-self-center"
        tabindex="-1"
      >
        @if (store.activeMap(); as map) {
          <wd-map-title
            [title]="map.name"
            [tree]="store.tree()"
            [activeId]="map.id"
            [ancestors]="ancestors()"
            [canMoveToRoot]="map.parentMapId !== null"
            [links]="linkItems()"
            (selectMap)="openMap($event)"
            (action)="onTitleAction($event)"
            (removeLink)="removeLink($event)"
          />
        } @else {
          <span class="wd-inscription truncate text-center text-lg text-ouro-400">
            {{ store.world()?.name ?? text.loading }}
          </span>
        }
      </h1>
      <div class="flex items-center justify-end gap-2">
        @switch (store.upload()?.state) {
          @case ('saving') {
            <span class="upload" role="status">
              <svg class="ring" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <circle cx="10" cy="10" r="8" />
              </svg>
              <span class="sr-only">{{ mapText.upload.saving }}</span>
            </span>
          }
          @case ('failed') {
            <button
              wd-icon-button
              type="button"
              icon="cloud_off"
              class="text-lacre-claro"
              tooltipPosition="below"
              [label]="mapText.upload.failed + ' ' + mapText.upload.retry"
              (click)="retryUpload()"
            ></button>
          }
        }
        @if (demoMode) {
          <wd-demo-badge inline [label]="demoStrings.badge" [detail]="demoStrings.badgeDetail" />
        }
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }

    .map-host {
      position: fixed;
      inset: 0;
      background-color: var(--wd-bg-backdrop);
      view-transition-name: wd-world-map;
    }

    .import {
      position: absolute;
      inset: 48px 0 0;
    }

    .drop-veil {
      position: absolute;
      inset: 60px 12px 12px;
      display: grid;
      place-items: center;
      color: var(--wd-text-on-surface);
      pointer-events: none;
      background: color-mix(in oklab, var(--couro-950) 55%, transparent);
      border: 2px solid var(--ouro-300);
      border-radius: var(--wd-radius-panel);
      box-shadow: inset 0 0 0 4px var(--wd-accent-glow);
    }

    .drop-veil[data-drag='invalid'] {
      border-color: var(--lacre-claro);
      box-shadow: none;
    }

    .hint {
      position: fixed;
      inset-block-start: 60px;
      inset-inline-start: 50%;
      max-inline-size: min(560px, calc(100vw - 32px));
      padding: 8px 16px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      text-align: center;
      transform: translateX(-50%);
    }

    /* Barra superior: 48 px, couro 95%, filete dourado inferior (docs/05). */
    .top-bar {
      position: fixed;
      inset: 0 0 auto;
      display: grid;
      grid-template-columns: 1fr minmax(0, 2fr) 1fr;
      gap: 12px;
      align-items: center;
      block-size: 48px;
      padding-inline: 4px 12px;
      color: var(--wd-text-on-surface);
      background-color: color-mix(in oklab, var(--wd-surface) 95%, transparent);
      background-image: var(--wd-texture-leather);
      border-block-end: 1px solid var(--wd-rule-strong);
      box-shadow: var(--wd-shadow-panel);
    }

    .top-bar > :first-child {
      justify-self: start;
      inline-size: 44px;
      block-size: 44px;
    }

    .upload {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
    }

    .ring {
      inline-size: 20px;
      fill: none;
      stroke: var(--ouro-400);
      stroke-width: 2;
      stroke-dasharray: 30 50;
      stroke-linecap: round;
      animation: spin 1s linear infinite;
    }

    /* Depois do zoom, as barras entram deslizando: topo → esquerda → direita (docs/05). */
    .top-bar[data-entrance='zoom'] {
      animation: from-top var(--wd-dur-base) var(--wd-ease-out) var(--wd-dur-zoom) backwards;
    }

    wd-left-toolbar[data-entrance='zoom'] {
      animation: from-left var(--wd-dur-base) var(--wd-ease-out) calc(var(--wd-dur-zoom) + 60ms)
        backwards;
    }

    wd-explorer-panel[data-entrance='zoom'] {
      animation: from-right var(--wd-dur-base) var(--wd-ease-out) calc(var(--wd-dur-zoom) + 120ms)
        backwards;
    }

    :host-context([data-book-zoom='short']) [data-entrance='zoom'] {
      animation-delay: var(--wd-dur-zoom-short);
    }

    /* Movimento reduzido: fade cruzado curto no lugar do zoom. */
    [data-entrance='fade'] {
      animation: fade-in var(--wd-dur-fade) linear;
    }

    @keyframes from-top {
      from {
        transform: translateY(-100%);
      }
    }

    @keyframes from-left {
      from {
        transform: translateX(-120%);
      }
    }

    @keyframes from-right {
      from {
        transform: translateX(120%);
      }
    }

    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ring {
        animation: none;
      }
    }
  `,
})
export default class WorldShellPage {
  /** `:worldId` da rota (withComponentInputBinding). */
  readonly worldId = input.required<string>();
  /** `?map=` da URL: mapa a abrir (docs/04 › Rotas). */
  readonly map = input<string>();

  protected readonly store = inject(WorldStore);
  protected readonly mapStore = inject(MapStore);
  protected readonly toasts = inject(ToastService);
  protected readonly text = WORLD_STRINGS;
  protected readonly mapText = MAP_STRINGS;
  protected readonly demoMode = inject(DEMO_MODE);
  protected readonly demoStrings = DEMO_STRINGS;
  protected readonly entrance: Entrance;

  protected readonly tool = signal<ToolId>('pan');
  /** Espaço segurado: mover mapa temporariamente. */
  private readonly spaceHeld = signal(false);
  protected readonly effectiveTool = computed(() => (this.spaceHeld() ? 'pan' : this.tool()));
  protected readonly hiddenLayers = signal<readonly LayerId[]>([]);
  protected readonly toolPoints = signal(0);
  protected readonly busy = signal(false);

  private readonly prefs = inject(UiPrefsStore);
  protected readonly bars = this.prefs.bars;
  protected readonly insets = computed<ViewportInsets>(() => {
    const bars = this.bars();
    return {
      top: TOP_BAR + GAP,
      left: bars.leftCollapsed ? 0 : LEFT_BAR,
      right: bars.rightCollapsed ? 0 : bars.rightWidth + 12 + GAP,
      bottom: 0,
    };
  });

  protected readonly mapNames = computed(() =>
    Object.fromEntries(this.store.maps().map((m) => [m.id, m.name])),
  );
  protected readonly ancestors = computed(() => this.store.activePath().slice(0, -1));
  protected readonly linkItems = computed(() =>
    (this.mapStore.scene()?.links ?? []).map((link) => ({
      id: link.id,
      targetName: this.mapNames()[link.targetMapId] ?? '',
    })),
  );
  protected readonly hint = computed(() => {
    const points = this.toolPoints();
    switch (this.tool()) {
      case 'calibrate':
        return this.mapText.hints.calibrate[Math.min(points, 1)];
      case 'link':
        return points === 0
          ? this.mapText.hints.link
          : `${this.mapText.hints.link} ${this.mapText.hints.linkPoints(points)}`;
      default:
        return null;
    }
  });

  protected readonly cameraFor = (mapId: Uuid) => readCamera(this.prefs.prefs(), mapId);

  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly canvas = viewChild<MapCanvasComponent>('canvas');
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly transitions = inject(BookTransitions);
  private readonly dialogs = inject(DialogService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);

  constructor() {
    const fromBook = this.transitions.arrival()?.kind === 'zoom-in';
    const motion = inject(BookMotionService).motion();
    this.entrance = !fromBook ? 'none' : motion === 'fade' ? 'fade' : 'zoom';
    void this.prefs.load();
    afterNextRender(() => void this.load());
    this.registerShortcuts();

    // Mapa ativo: carrega a cena e reflete o id na URL.
    effect(() => {
      const id = this.store.activeMapId();
      untracked(() => {
        const map = this.store.activeMap();
        this.tool.set('pan');
        if (!map || !id) {
          this.mapStore.clear();
          return;
        }
        void this.mapStore.load(map, this.store.takeLocalImage(id));
        this.syncUrl(id);
      });
    });
    // Nome, escala e dimensões atualizados chegam à cena sem recarregar.
    effect(() => {
      const map = this.store.activeMap();
      if (map) untracked(() => this.mapStore.syncMap(map));
    });
    // Envio que falhou: aviso com "Tentar de novo".
    effect(() => {
      if (this.store.upload()?.state !== 'failed') return;
      untracked(() =>
        this.toasts.show({
          message: this.mapText.upload.failed,
          kind: 'error',
          action: { label: this.mapText.upload.retry, run: () => this.retryUpload() },
        }),
      );
    });

    inject(DestroyRef).onDestroy(() => {
      this.store.dispose();
      void this.prefs.flush();
    });
  }

  /** Ícone do livro: o mapa encolhe de volta à página e a página desvira (docs/05 › 4). */
  protected backToLibrary(): void {
    this.transitions.expect({ kind: 'zoom-out', worldId: this.worldId() });
    void this.router.navigateByUrl('/biblioteca');
  }

  protected setTool(tool: ToolId): void {
    this.toolPoints.set(0);
    this.tool.set(tool);
  }

  protected zoom(action: 'in' | 'out' | 'fit'): void {
    const canvas = this.canvas();
    if (action === 'fit') canvas?.fit();
    else canvas?.zoomBy(action === 'in' ? 1.25 : 0.8);
  }

  protected toggleLayer(layer: ToggleableLayer): void {
    const hidden = this.hiddenLayers();
    this.hiddenLayers.set(
      hidden.includes(layer) ? hidden.filter((l) => l !== layer) : [...hidden, layer],
    );
  }

  protected setBars(change: Partial<BarPrefs>): void {
    this.prefs.set('bars', writeBarPrefs({ ...this.bars(), ...change }));
  }

  protected saveCamera({ mapId, camera }: CameraChange): void {
    const saved = { x: camera.center.x, y: camera.center.y, zoom: camera.zoom };
    this.prefs.set('cameras', writeCamera(this.prefs.prefs(), mapId, saved));
  }

  protected openMap(id: Uuid): void {
    this.store.selectMap(id);
    const map = this.store.activeMap();
    if (map) void this.announcer.announce(this.text.announce(map.name));
  }

  protected async retryUpload(): Promise<void> {
    try {
      await this.store.retryUpload();
      this.toasts.show({ message: this.mapText.upload.done, kind: 'success' });
    } catch {
      // O efeito do estado `failed` avisa de novo.
    }
  }

  /** Arquivo solto, colado ou escolhido (docs/06 §0). */
  protected async importFile(file: File): Promise<void> {
    if (this.busy()) return;
    const current = this.store.activeMap();
    let choice: ImportChoice | 'root' = 'root';
    if (current) {
      const ref = this.dialogs.open<ImportChoiceDialogComponent, string, ImportChoice>(
        ImportChoiceDialogComponent,
        { data: current.name },
      );
      const picked = await firstValueFrom(ref.closed);
      if (!picked) return;
      choice = picked;
    }
    this.busy.set(true);
    let processed: ProcessedMapImage;
    try {
      processed = await readMapImage(file);
    } catch (error) {
      this.busy.set(false);
      const reason = error instanceof MapImageError ? error.reason : 'decode_failed';
      this.toasts.show({ message: this.mapText.import.errors[reason], kind: 'error' });
      return;
    }
    try {
      if (choice === 'replace' && current) {
        const updated = await this.store.replaceImage(current.id, processed);
        await this.mapStore.load(updated, this.store.takeLocalImage(updated.id));
        this.notifyImported(this.mapText.import.replaced, processed.reduced, false);
      } else {
        const name = mapNameFromFile(file.name, this.mapText.import.defaultName);
        const parent = choice === 'child' && current ? current.id : null;
        await this.store.createMap(processed, name, parent);
        this.notifyImported(this.mapText.import.created(name), processed.reduced, true);
      }
    } catch {
      processed.bitmap.close();
      this.toasts.show({ message: this.mapText.import.errors.save_failed, kind: 'error' });
    } finally {
      this.busy.set(false);
    }
  }

  protected onTitleAction(action: MapTitleAction): void {
    const map = this.store.activeMap();
    if (!map) return;
    switch (action) {
      case 'rename':
        void this.rename(map.id, map.name);
        break;
      case 'move-to-root':
        void this.store.moveMap(map.id, null);
        break;
      case 'scale':
        this.setTool('calibrate');
        break;
      case 'import':
        void pickImageFile(this.document).then((file) => file && this.importFile(file));
        break;
    }
  }

  /** Linha desenhada sobre a escala gráfica: pergunta o comprimento real. */
  protected async onMeasure({ distance }: { points: Point[]; distance: number }): Promise<void> {
    const map = this.store.activeMap();
    if (!map || this.tool() !== 'calibrate') return;
    const ref = this.dialogs.open<ScaleDialogComponent, ScaleDialogData, ScaleDialogResult>(
      ScaleDialogComponent,
      {
        data: { pixelLength: distance, unit: map.scaleUnit, label: map.scaleLabel },
        autoFocus: 'first-tabbable',
      },
    );
    const result = await firstValueFrom(ref.closed);
    this.setTool('pan');
    if (!result) return;
    try {
      await this.store.setScale(map.id, { pixelLength: distance, ...result });
      const value = (result.realLength / distance).toLocaleString('pt-BR', {
        maximumSignificantDigits: 3,
      });
      const unit = this.mapText.scale.units[result.unit];
      this.toasts.show({
        message: this.mapText.scale.saved(this.mapText.scale.perPixel(value, unit)),
        kind: 'success',
      });
    } catch {
      this.toasts.show({ message: this.mapText.scale.failed, kind: 'error' });
    }
  }

  /** Região desenhada com a ferramenta de link: escolhe o mapa de destino. */
  protected async onRegionDrawn(polygon: PolygonVertex[]): Promise<void> {
    const map = this.store.activeMap();
    if (!map) return;
    const ref = this.dialogs.open<LinkTargetDialogComponent, LinkTargetData, Uuid>(
      LinkTargetDialogComponent,
      { data: { currentMapId: map.id, maps: this.store.tree() }, autoFocus: 'first-tabbable' },
    );
    const target = await firstValueFrom(ref.closed);
    this.setTool('pan');
    if (!target) return;
    try {
      await this.mapStore.addLink(polygon, target);
      const name = this.mapNames()[target] ?? '';
      this.toasts.show({ message: this.mapText.link.created(name), kind: 'success' });
    } catch {
      this.toasts.show({ message: this.mapText.link.failed, kind: 'error' });
    }
  }

  protected async removeLink(id: Uuid): Promise<void> {
    try {
      await this.mapStore.removeLink(id);
      void this.announcer.announce(this.mapText.link.removed);
    } catch {
      this.toasts.show({ message: this.mapText.link.failed, kind: 'error' });
    }
  }

  private notifyImported(message: string, reduced: boolean, offerScale: boolean): void {
    this.toasts.show({
      message: reduced ? `${message} ${this.mapText.import.reduced}` : message,
      kind: 'success',
      action: offerScale
        ? { label: this.mapText.import.setScale, run: () => this.setTool('calibrate') }
        : undefined,
    });
  }

  private async rename(id: Uuid, name: string): Promise<void> {
    const ref = this.dialogs.open<RenameMapDialogComponent, string, string>(
      RenameMapDialogComponent,
      { data: name, autoFocus: 'first-tabbable' },
    );
    const next = await firstValueFrom(ref.closed);
    if (!next || next === name) return;
    try {
      await this.store.renameMap(id, next);
    } catch {
      this.toasts.show({ message: this.mapText.rename.failed, kind: 'error' });
    }
  }

  /** `?map=` sem navegação do Router (que dispararia uma View Transition). */
  private syncUrl(mapId: Uuid): void {
    const path = this.location.path().split('?')[0] ?? '';
    const params = new URLSearchParams(this.location.path().split('?')[1] ?? '');
    if (params.get('map') === mapId) return;
    params.set('map', mapId);
    this.location.replaceState(path, params.toString());
  }

  private registerShortcuts(): void {
    const drawing = () => this.tool() === 'calibrate' || this.tool() === 'link';
    const notOnControl = (event: KeyboardEvent) =>
      !(event.target instanceof Element && event.target.closest(INTERACTIVE));
    const hasMap = () => this.store.activeMap() !== null;
    const remove = inject(ShortcutService).register([
      { key: 'v', when: hasMap, down: () => this.setTool('select') },
      { key: 'h', when: hasMap, down: () => this.setTool('pan') },
      {
        key: 'space',
        when: (event) => hasMap() && notOnControl(event),
        down: () => this.spaceHeld.set(true),
        up: () => this.spaceHeld.set(false),
      },
      {
        key: '[',
        when: hasMap,
        down: () => this.setBars({ leftCollapsed: !this.bars().leftCollapsed }),
      },
      {
        key: ']',
        when: hasMap,
        down: () => this.setBars({ rightCollapsed: !this.bars().rightCollapsed }),
      },
      {
        key: 'escape',
        when: drawing,
        down: () => {
          this.canvas()?.cancelTool();
          this.setTool('pan');
        },
      },
      {
        key: 'enter',
        when: (event) => this.tool() === 'link' && notOnControl(event),
        down: () => this.canvas()?.commitTool(),
      },
    ]);
    inject(DestroyRef).onDestroy(remove);
  }

  private async load(): Promise<void> {
    const status = await this.store.load(this.worldId(), this.map() ?? null);
    if (status !== 'ready') {
      this.leave(status === 'not_found' ? this.text.notFound : this.text.loadFailed);
      return;
    }
    await this.transitions.viewTransition()?.finished.catch(() => undefined);
    // Fim da transição: foco no título e anúncio (docs/05 › Regras).
    const name = this.store.activeMap()?.name ?? this.store.world()?.name ?? '';
    void this.announcer.announce(this.text.announce(name));
    afterNextRender(() => this.title().nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }

  private leave(message: string): void {
    this.toasts.show({ message, kind: 'error' });
    void this.router.navigateByUrl('/biblioteca');
  }
}
