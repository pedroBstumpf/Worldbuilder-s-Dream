import {
  CdkContextMenuTrigger,
  CdkMenu,
  CdkMenuGroup,
  CdkMenuItem,
  CdkMenuItemRadio,
} from '@angular/cdk/menu';
import {
  Component,
  computed,
  DOCUMENT,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import type { Point } from '@domain/geometry';
import { INTERPOLATION_MODES, type InterpolationMode, type Uuid } from '@domain/models';
import { adjacentKeyframeTick, keyframeInEffect } from '@domain/timeline';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { MapStore } from '../state/map.store';
import { TimelineStore } from '../state/timeline.store';
import { TokenActions } from './token-actions';

const MODE_ICONS: Record<InterpolationMode, string> = {
  linear: 'trending_flat',
  step: 'stairs',
  ease: 'line_curve',
};

/**
 * Menu do token (docs/06 §3 › Interações): abre no ponto do clique com o botão direito ou
 * a partir da lista acessível. Abre a ficha, passa para a posição anterior ou seguinte,
 * escolhe o movimento a partir da posição em vigor, mostra o caminho, tira o token do mapa
 * no instante, remove a posição ou o token inteiro.
 */
@Component({
  selector: 'wd-token-menu',
  imports: [
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuGroup,
    CdkMenuItem,
    CdkMenuItemRadio,
    IconComponent,
  ],
  template: `
    <div class="anchor" [cdkContextMenuTriggerFor]="menu" (cdkContextMenuClosed)="onClosed()"></div>
    <ng-template #menu>
      @if (info(); as i) {
        <div class="wd-menu" cdkMenu [attr.aria-label]="text.label(i.name)">
          <p class="wd-menu-heading wd-inscription" aria-hidden="true">{{ i.name }}</p>
          <div cdkMenuGroup role="group">
            @if (i.entityId; as entityId) {
              <button
                type="button"
                class="wd-menu-item"
                cdkMenuItem
                (cdkMenuItemTriggered)="openSheet.emit(entityId)"
              >
                <wd-icon name="article" size="sm" />{{ text.openSheet }}
              </button>
            }
            <button
              type="button"
              class="wd-menu-item"
              cdkMenuItem
              [cdkMenuItemDisabled]="i.previous === null"
              (cdkMenuItemTriggered)="actions.goToKeyframe(i.tokenId, -1)"
            >
              <wd-icon name="skip_previous" size="sm" />{{ text.previous }}
            </button>
            <button
              type="button"
              class="wd-menu-item"
              cdkMenuItem
              [cdkMenuItemDisabled]="i.next === null"
              (cdkMenuItemTriggered)="actions.goToKeyframe(i.tokenId, 1)"
            >
              <wd-icon name="skip_next" size="sm" />{{ text.next }}
            </button>
            <button
              type="button"
              class="wd-menu-item"
              cdkMenuItem
              (cdkMenuItemTriggered)="togglePath.emit(i.tokenId)"
            >
              <wd-icon name="route" size="sm" />{{ i.pathShown ? text.hidePath : text.showPath }}
            </button>
          </div>
          @if (i.current; as current) {
            <div cdkMenuGroup role="group" [attr.aria-label]="text.movement(i.currentDate)">
              <p class="wd-menu-heading wd-inscription" aria-hidden="true">
                {{ text.movement(i.currentDate) }}
              </p>
              @for (mode of modes; track mode) {
                <button
                  type="button"
                  class="wd-menu-item"
                  cdkMenuItemRadio
                  [cdkMenuItemChecked]="current.interpolation === mode"
                  [title]="tokenText.interpolationHints[mode]"
                  (cdkMenuItemTriggered)="setMode(current.id, mode)"
                >
                  <wd-icon
                    [name]="
                      current.interpolation === mode ? 'radio_button_checked' : modeIcons[mode]
                    "
                    size="sm"
                  />{{ tokenText.interpolationNames[mode] }}
                </button>
              }
            </div>
          }
          <div cdkMenuGroup role="group">
            <button
              type="button"
              class="wd-menu-item"
              cdkMenuItem
              [cdkMenuItemDisabled]="!i.visible"
              (cdkMenuItemTriggered)="actions.hide(i.tokenId)"
            >
              <wd-icon name="logout" size="sm" />{{ text.hide }}
            </button>
            @if (i.current; as current) {
              <button
                type="button"
                class="wd-menu-item"
                cdkMenuItem
                (cdkMenuItemTriggered)="actions.removeKeyframe(current.id)"
              >
                <wd-icon name="remove_circle" size="sm" />{{ text.removeKeyframe(i.currentDate) }}
              </button>
            }
            <button
              type="button"
              class="wd-menu-item danger"
              cdkMenuItem
              (cdkMenuItemTriggered)="actions.remove(i.tokenId)"
            >
              <wd-icon name="delete" size="sm" />{{ text.remove }}
            </button>
          </div>
        </div>
      }
    </ng-template>
  `,
  styles: `
    .anchor {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    .danger {
      color: var(--wd-danger);
    }
  `,
})
export class TokenMenuComponent {
  /** "Abrir ficha". */
  readonly openSheet = output<Uuid>();
  /** "Mostrar/Esconder caminho". */
  readonly togglePath = output<Uuid>();
  /** O menu fechou (quem abriu devolve o foco ao mapa). */
  readonly closed = output();
  /** Tokens com o caminho à mostra (para o texto do item). */
  readonly pathTokens = input<readonly Uuid[]>([]);

  protected readonly actions = inject(TokenActions);
  protected readonly text = MAP_STRINGS.tokens.menu;
  protected readonly tokenText = MAP_STRINGS.tokens;
  protected readonly modes = INTERPOLATION_MODES;
  protected readonly modeIcons = MODE_ICONS;

  private readonly map = inject(MapStore);
  private readonly document = inject(DOCUMENT);
  private readonly timeline = inject(TimelineStore);
  private readonly trigger = viewChild.required(CdkContextMenuTrigger);
  private readonly tokenId = signal<Uuid | null>(null);

  protected readonly info = computed(() => {
    const tokenId = this.tokenId();
    const token = this.map.scene()?.tokens.find((t) => t.id === tokenId);
    if (!tokenId || !token) return null;
    const keyframes = this.map.keyframesOf(tokenId);
    const tick = this.timeline.currentTick();
    const current = keyframeInEffect(keyframes, tick);
    return {
      tokenId,
      entityId: token.entityId,
      name: this.actions.tokenName(tokenId),
      current: current?.visible ? current : null,
      currentDate: current
        ? this.timeline.calendar().format(current.tick, this.timeline.precision())
        : '',
      visible: current?.visible ?? false,
      previous: adjacentKeyframeTick(keyframes, tick, -1),
      next: adjacentKeyframeTick(keyframes, tick, 1),
      pathShown: this.pathTokens().includes(tokenId),
    };
  });

  /** Abre o menu do token no ponto (coordenadas da janela). */
  open(tokenId: Uuid, anchor: Point): void {
    this.tokenId.set(tokenId);
    const trigger = this.trigger();
    trigger.close();
    trigger.open({ x: anchor.x, y: anchor.y });
    // O menu aberto por código não recebe o foco sozinho: o primeiro item recebe.
    requestAnimationFrame(() =>
      this.document
        .querySelector<HTMLElement>('.wd-menu [role^="menuitem"]:not([disabled])')
        ?.focus(),
    );
  }

  protected setMode(keyframeId: Uuid, mode: InterpolationMode): void {
    void this.actions.setInterpolation(keyframeId, mode, this.tokenText.interpolationNames[mode]);
  }

  protected onClosed(): void {
    this.closed.emit();
  }
}
