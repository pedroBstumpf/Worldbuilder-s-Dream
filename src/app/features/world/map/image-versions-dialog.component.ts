import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DialogRef } from '@angular/cdk/dialog';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import type { MapImageVersion, Tick, Uuid } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { ToastService } from '@shared/ui/toast/toast.service';
import { MapStore } from '../state/map.store';
import { TimelineStore } from '../state/timeline.store';
import { DateInputComponent } from '../timeline/date-input.component';

/** O que o painel pede a quem o abriu (escolher um arquivo fica com a tela do mundo). */
export type ImageVersionsAction =
  | { readonly action: 'add' }
  | { readonly action: 'replace-base' }
  | { readonly action: 'replace'; readonly versionId: Uuid };

/**
 * Painel "Versões da imagem" (docs/06 › Versões da imagem no tempo), aberto pelo seletor
 * no título: a imagem inicial e as versões em ordem, com miniatura e data; muda a data,
 * substitui a imagem e remove a versão (com "Desfazer"). Abra com o injetor da tela do
 * mundo, que fornece as stores.
 */
@Component({
  selector: 'wd-image-versions-dialog',
  imports: [ButtonComponent, DateInputComponent, DialogComponent],
  template: `
    <wd-dialog [title]="text.title">
      <p class="mb-4 font-sans text-sm text-pergaminho-400">{{ text.intro }}</p>
      <ol class="flex flex-col gap-3" [attr.aria-label]="text.title">
        <li class="row">
          <div class="thumb" aria-hidden="true">
            @if (map.baseImageUrl(); as url) {
              <img [src]="url" alt="" decoding="async" />
            }
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <p class="font-book text-lg">{{ text.base }}</p>
            <p class="font-sans text-sm text-pergaminho-400">{{ baseValidity() }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                wd-button
                type="button"
                size="sm"
                [attr.aria-label]="text.replaceOf(text.base)"
                (click)="ref.close({ action: 'replace-base' })"
              >
                {{ text.replace }}
              </button>
            </div>
          </div>
        </li>
        @for (version of versions(); track version.id) {
          <li class="row" [attr.data-version-id]="version.id">
            <div class="thumb" aria-hidden="true">
              @if (urlOf(version.id); as url) {
                <img [src]="url" alt="" decoding="async" />
              }
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <wd-date-input
                tone="surface"
                [idPrefix]="'wd-version-' + version.id"
                [label]="text.from"
                [calendar]="timeline.calendar()"
                [value]="version.tickStart"
                (valueChange)="setPending(version.id, $event)"
              />
              @if (pendingOf(version); as tick) {
                @if (isTaken(version.id, tick)) {
                  <p class="font-sans text-sm text-lacre-claro" role="alert">
                    {{ text.dateTaken }}
                  </p>
                } @else {
                  <button
                    wd-button
                    type="button"
                    size="sm"
                    variant="primary"
                    class="self-start"
                    (click)="move(version, tick)"
                  >
                    {{ text.applyDate }}
                  </button>
                }
              }
              <div class="flex flex-wrap gap-2">
                <button
                  wd-button
                  type="button"
                  size="sm"
                  [attr.aria-label]="text.replaceOf(text.versionFrom(format(version.tickStart)))"
                  (click)="ref.close({ action: 'replace', versionId: version.id })"
                >
                  {{ text.replace }}
                </button>
                <button
                  wd-button
                  type="button"
                  size="sm"
                  variant="ghost"
                  [attr.aria-label]="text.removeOf(format(version.tickStart))"
                  (click)="remove(version)"
                >
                  {{ text.remove }}
                </button>
              </div>
            </div>
          </li>
        }
        @for (version of removed(); track version.id) {
          <li class="row removed">
            <p class="flex-1 font-sans text-sm text-pergaminho-400" role="status">
              {{ text.removed(format(version.tickStart)) }}
            </p>
            <button
              wd-button
              type="button"
              size="sm"
              [attr.data-undo-id]="version.id"
              (click)="restore(version)"
            >
              {{ text.undo }}
            </button>
          </li>
        }
      </ol>
      <button
        wd-button
        wdDialogAction
        variant="primary"
        type="button"
        (click)="ref.close({ action: 'add' })"
      >
        {{ text.add }}
      </button>
    </wd-dialog>
  `,
  styles: `
    .row {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 10px;
      border: 1px solid var(--wd-rule);
      border-radius: var(--wd-radius-control);
    }

    .removed {
      align-items: center;
      border-style: dashed;
    }

    .thumb {
      flex-shrink: 0;
      inline-size: 112px;
      aspect-ratio: 3 / 2;
      overflow: hidden;
      background-color: var(--couro-800);
      border: 1px solid var(--ouro-500);
    }

    .thumb img {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
    }

    @media (width < 560px) {
      .row {
        flex-direction: column;
      }
    }
  `,
})
export class ImageVersionsDialogComponent {
  protected readonly ref = inject<DialogRef<ImageVersionsAction>>(DialogRef);
  protected readonly map = inject(MapStore);
  protected readonly timeline = inject(TimelineStore);
  protected readonly text = MAP_STRINGS.versions;
  private readonly toasts = inject(ToastService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly versions = computed(() => this.map.scene()?.imageVersions ?? []);
  /** Removidas enquanto o painel está aberto: cada uma com o seu "Desfazer". */
  protected readonly removed = signal<readonly MapImageVersion[]>([]);
  /** Data digitada e ainda não aplicada, por versão. */
  private readonly pending = signal<Readonly<Record<Uuid, Tick>>>({});

  protected readonly baseValidity = computed(() => {
    const first = this.versions()[0];
    return first ? this.text.baseUntil(this.format(first.tickStart)) : this.text.baseAlways;
  });

  protected format(tick: Tick): string {
    return this.timeline.calendar().format(tick);
  }

  protected urlOf(id: Uuid): string | null {
    return this.map.imageVersionInputs().find((v) => v.id === id)?.url ?? null;
  }

  protected setPending(id: Uuid, tick: Tick): void {
    this.pending.update((all) => ({ ...all, [id]: tick }));
  }

  /** A data digitada, se diferente da gravada. */
  protected pendingOf(version: MapImageVersion): Tick | null {
    const tick = this.pending()[version.id];
    return tick === undefined || tick === version.tickStart ? null : tick;
  }

  protected isTaken(id: Uuid, tick: Tick): boolean {
    return this.versions().some((v) => v.id !== id && v.tickStart === tick);
  }

  protected async move(version: MapImageVersion, tick: Tick): Promise<void> {
    try {
      await this.map.moveImageVersion(version.id, tick);
      void this.announcer.announce(this.text.moved(this.format(tick)));
    } catch {
      this.toasts.show({ message: this.text.failed, kind: 'error' });
    }
  }

  /**
   * Manda para a lixeira; a linha vira "Versão removida" com "Desfazer" aqui mesmo (um
   * aviso não serviria: o foco fica preso no diálogo).
   */
  protected async remove(version: MapImageVersion): Promise<void> {
    try {
      await this.map.removeImageVersion(version.id);
    } catch {
      this.toasts.show({ message: this.text.failed, kind: 'error' });
      return;
    }
    this.removed.update((list) => [...list, version]);
    // A linha removida levou o foco junto: ele vai para o "Desfazer".
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-undo-id="${version.id}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected async restore(version: MapImageVersion): Promise<void> {
    try {
      await this.map.restoreImageVersion(version.id);
    } catch {
      this.toasts.show({ message: this.text.restoreFailed, kind: 'error' });
      return;
    }
    this.removed.update((list) => list.filter((v) => v.id !== version.id));
    void this.announcer.announce(this.text.restored(this.format(version.tickStart)));
  }
}
