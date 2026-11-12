import { LiveAnnouncer } from '@angular/cdk/a11y';
import { inject, Injectable } from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import type { Point } from '@domain/geometry';
import type { InterpolationMode, Tick, Uuid } from '@domain/models';
import { adjacentKeyframeTick, snapTick } from '@domain/timeline';
import { ToastService } from '@shared/ui/toast/toast.service';
import { EntityStore } from '../state/entity.store';
import { MapStore } from '../state/map.store';
import { TimelineStore } from '../state/timeline.store';

/**
 * Ações sobre tokens de entidade vindas do mapa, do menu do token e da ficha (docs/06 §3):
 * escolhem o instante (o cursor arredondado à precisão da linha do tempo), chamam a
 * `MapStore`, anunciam o resultado para leitores de tela e avisam se a gravação falhar.
 * Fornecida pela tela do mundo.
 */
@Injectable()
export class TokenActions {
  private readonly map = inject(MapStore);
  private readonly timeline = inject(TimelineStore);
  private readonly entities = inject(EntityStore);
  private readonly toasts = inject(ToastService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly text = MAP_STRINGS.tokens;

  /** Snap temporal (docs/06 §3): o keyframe nasce no início da unidade do zoom. */
  keyframeTick(): Tick {
    const timeline = this.timeline;
    return snapTick(timeline.calendar(), timeline.currentTick(), timeline.precision());
  }

  /** Entidade solta no mapa (Explorar) ou marcada pela ficha. */
  place(entityId: Uuid, point: Point): Promise<void> {
    const tick = this.keyframeTick();
    return this.run(
      () => this.map.placeEntity(entityId, point, tick),
      () => this.text.placed(this.entityName(entityId), this.date(tick)),
    );
  }

  move(tokenId: Uuid, to: Point, correctPrevious = false): Promise<void> {
    const tick = this.keyframeTick();
    return this.run(
      () => this.map.moveToken(tokenId, to, tick, { correctPrevious }),
      () => this.text.moved(this.tokenName(tokenId), this.date(tick)),
    );
  }

  moveKeyframe(keyframeId: Uuid, to: Point): Promise<void> {
    return this.run(() => this.map.moveKeyframe(keyframeId, to), null);
  }

  /** "Sair do mapa aqui". */
  hide(tokenId: Uuid): Promise<void> {
    const tick = this.keyframeTick();
    return this.run(
      () => this.map.hideToken(tokenId, tick),
      () => this.text.hidden(this.tokenName(tokenId), this.date(tick)),
    );
  }

  setInterpolation(keyframeId: Uuid, mode: InterpolationMode, label: string): Promise<void> {
    return this.run(
      () => this.map.setInterpolation(keyframeId, mode),
      () => this.text.interpolation(label),
    );
  }

  removeKeyframe(keyframeId: Uuid): Promise<void> {
    const keyframe = this.map.scene()?.keyframes.find((k) => k.id === keyframeId);
    return this.run(
      () => this.map.removeKeyframe(keyframeId),
      () => this.text.keyframeRemoved(keyframe ? this.date(keyframe.tick) : ''),
    );
  }

  remove(tokenId: Uuid): Promise<void> {
    const name = this.tokenName(tokenId);
    this.map.select(this.map.selection().filter((id) => id !== tokenId));
    return this.run(
      () => this.map.removeToken(tokenId),
      () => this.text.removed(name),
    );
  }

  /** Move o cursor para o keyframe seguinte (`1`) ou anterior (`-1`) do token. */
  goToKeyframe(tokenId: Uuid, direction: 1 | -1): void {
    const tick = adjacentKeyframeTick(
      this.map.keyframesOf(tokenId),
      this.timeline.currentTick(),
      direction,
    );
    if (tick !== null) this.timeline.seek(tick);
  }

  tokenName(tokenId: Uuid): string {
    const token = this.map.scene()?.tokens.find((t) => t.id === tokenId);
    return token?.entityId ? this.entityName(token.entityId) : this.text.unnamed;
  }

  private entityName(entityId: Uuid): string {
    return this.entities.byId().get(entityId)?.name ?? this.text.unnamed;
  }

  private date(tick: Tick): string {
    return this.timeline.calendar().format(tick, this.timeline.precision());
  }

  private async run(work: () => Promise<void>, announce: (() => string) | null): Promise<void> {
    try {
      await work();
      if (announce) void this.announcer.announce(announce());
    } catch {
      this.toasts.show({ message: this.text.failed, kind: 'error' });
    }
  }
}
