import { Component, computed, inject, input, output } from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { INTERPOLATION_MODES, type InterpolationMode, type Uuid } from '@domain/models';
import { evaluateKeyframes, keyframeInEffect } from '@domain/timeline';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TokenActions } from '../map/token-actions';
import { MapStore } from '../state/map.store';
import { TimelineStore } from '../state/timeline.store';
import { WorldStore } from '../state/world.store';

/**
 * Seção "No mapa" da ficha (docs/06 §3): as posições (keyframes) da entidade no mapa
 * aberto, com data, movimento e remoção, e as ações de marcar, mostrar, sair do mapa e
 * tirar do mapa. É a alternativa por teclado ao arraste e ao menu do token.
 */
@Component({
  selector: 'wd-entity-map-section',
  imports: [IconComponent],
  template: `
    <section class="field" [attr.aria-labelledby]="prefix() + '-map'">
      <h3 class="field-label" [id]="prefix() + '-map'">{{ text.title }}</h3>
      @if (state(); as s) {
        <p class="hint">
          {{ s.token ? text.present(s.mapName, s.keyframes.length) : text.absent(s.mapName) }}
        </p>
        @if (s.keyframes.length > 0) {
          <ol class="keyframes" [attr.aria-label]="text.positions">
            @for (k of s.keyframes; track k.id) {
              <li [class.current]="k.id === s.currentId">
                <button
                  type="button"
                  class="date wd-focus"
                  [attr.aria-current]="k.id === s.currentId ? 'time' : null"
                  [attr.aria-label]="text.goTo(k.date)"
                  (click)="timeline.seek(k.tick)"
                >
                  {{ k.date }}
                  @if (k.id === s.currentId) {
                    <span class="badge">{{ text.current }}</span>
                  }
                </button>
                @if (k.visible) {
                  <select
                    class="mode wd-focus"
                    [attr.aria-label]="text.movement(k.date)"
                    [value]="k.interpolation"
                    (change)="setMode(k.id, $event)"
                  >
                    @for (mode of modes; track mode) {
                      <option [value]="mode" [selected]="mode === k.interpolation">
                        {{ names[mode] }}
                      </option>
                    }
                  </select>
                } @else {
                  <span class="leaves">{{ text.leaves }}</span>
                }
                <button
                  type="button"
                  class="remove wd-focus"
                  [attr.aria-label]="text.remove(k.date)"
                  [title]="text.remove(k.date)"
                  (click)="actions.removeKeyframe(k.id)"
                >
                  <wd-icon name="close" size="sm" />
                </button>
              </li>
            }
          </ol>
        }
        <div class="actions">
          <button type="button" class="action wd-focus" (click)="place.emit(entityId())">
            <wd-icon name="add_location_alt" size="sm" />{{ text.place(s.now) }}
          </button>
          @if (s.token; as token) {
            @if (s.visibleNow) {
              <button type="button" class="action wd-focus" (click)="show.emit(token.id)">
                <wd-icon name="my_location" size="sm" />{{ text.show }}
              </button>
              <button type="button" class="action wd-focus" (click)="actions.hide(token.id)">
                <wd-icon name="logout" size="sm" />{{ text.hide }}
              </button>
            }
            <button type="button" class="action wd-focus" (click)="actions.remove(token.id)">
              <wd-icon name="wrong_location" size="sm" />{{ text.removeToken }}
            </button>
          }
        </div>
      } @else {
        <p class="hint">{{ text.noMap }}</p>
      }
    </section>
  `,
  host: { class: 'block' },
  styles: `
    /* Mesmos campos da ficha (sheet.css), sem os estilos do painel. */
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .field-label {
      font-family: var(--font-sans);
      font-size: 0.875rem;
      font-weight: 600;
    }

    .hint {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-on-page-muted);
    }

    .keyframes {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-block: 4px;
    }

    .keyframes li {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 2px 4px;
      border-radius: var(--wd-radius-control);
    }

    .keyframes li.current {
      background: var(--wd-control-bg-hover);
    }

    .date {
      flex: 1;
      font-family: var(--font-book);
      font-size: 1rem;
      color: var(--wd-text-on-page);
      text-align: start;
      cursor: pointer;
      background: transparent;
      border: 0;
    }

    .badge {
      margin-inline-start: 6px;
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-control-muted);
    }

    .mode {
      padding: 2px 6px;
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      color: var(--wd-text-on-page);
      background: transparent;
      border: 1px solid var(--wd-rule);
      border-radius: var(--wd-radius-control);
    }

    .leaves {
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      font-style: italic;
      color: var(--wd-control-muted);
    }

    .remove {
      display: inline-grid;
      place-items: center;
      inline-size: 28px;
      block-size: 28px;
      color: var(--wd-control-muted);
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: var(--wd-radius-control);
    }

    .remove:hover {
      color: var(--wd-danger-on-page);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .action {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 5px 10px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-on-page);
      cursor: pointer;
      background: transparent;
      border: 1px solid var(--wd-rule);
      border-radius: var(--wd-radius-control);
    }

    .action:hover {
      border-color: var(--couro-600);
    }
  `,
})
export class EntityMapSectionComponent {
  readonly entityId = input.required<Uuid>();
  /** Prefixo dos ids da ficha. */
  readonly prefix = input.required<string>();
  /** "Marcar posição": o próximo clique no mapa escolhe o ponto. */
  readonly place = output<Uuid>();
  /** "Mostrar no mapa": centraliza no token. */
  readonly show = output<Uuid>();

  protected readonly actions = inject(TokenActions);
  protected readonly timeline = inject(TimelineStore);
  protected readonly text = MAP_STRINGS.tokens.sheet;
  protected readonly names = MAP_STRINGS.tokens.interpolationNames;
  protected readonly modes = INTERPOLATION_MODES;

  private readonly map = inject(MapStore);
  private readonly world = inject(WorldStore);

  protected readonly state = computed(() => {
    const activeMap = this.world.activeMap();
    if (!activeMap || !this.map.scene()) return null;
    const calendar = this.timeline.calendar();
    const precision = this.timeline.precision();
    const tick = this.timeline.currentTick();
    const token = this.map.tokenOfEntity(this.entityId());
    const keyframes = token ? this.map.keyframesOf(token.id) : [];
    return {
      mapName: activeMap.name,
      token,
      currentId: keyframeInEffect(keyframes, tick)?.id ?? null,
      visibleNow: evaluateKeyframes(keyframes, tick) !== null,
      now: calendar.format(this.actions.keyframeTick(), precision),
      keyframes: keyframes.map((k) => ({
        id: k.id,
        tick: k.tick,
        visible: k.visible,
        interpolation: k.interpolation,
        date: calendar.format(k.tick, 'day'),
      })),
    };
  });

  protected setMode(keyframeId: Uuid, event: Event): void {
    const mode = (event.target as HTMLSelectElement).value as InterpolationMode;
    void this.actions.setInterpolation(keyframeId, mode, this.names[mode]);
  }
}
