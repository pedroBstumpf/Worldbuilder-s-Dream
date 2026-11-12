import { DOCUMENT, inject, Injectable } from '@angular/core';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import type { World } from '@domain/models';
import { isAppError } from '@domain/ports';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { ToastService } from '@shared/ui/toast/toast.service';
import { downloadFile, pickFile } from '@shared/utils/files';
import { CreateWorldDialogComponent } from './create-world-dialog.component';
import { DeleteWorldDialogComponent } from './delete-world-dialog.component';
import { LibraryStore, type WorldDraftInput } from './library.store';

/** Ações do menu "⋯" do frontispício e dos botões da lixeira. */
export type WorldAction =
  'rename' | 'duplicate' | 'export' | 'archive' | 'unarchive' | 'trash' | 'restore' | 'delete';

/**
 * Executa as ações da biblioteca (docs/05 › Biblioteca, RF-02, RF-16): abre os diálogos,
 * chama o `LibraryStore` e avisa o resultado. Arquivar e mover para a lixeira oferecem
 * "Desfazer"; excluir para sempre pede confirmação. Fornecido pelo `BookShell`.
 */
@Injectable()
export class LibraryActions {
  private readonly library = inject(LibraryStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly text = BOOK_STRINGS.libraryToasts;

  async run(action: WorldAction, world: World): Promise<void> {
    try {
      await this.perform(action, world);
    } catch {
      this.toasts.show({ message: this.text.failed, kind: 'error' });
    }
  }

  /** "Importar mundo": escolhe o `.json` e importa como mundo novo. */
  async importWorld(): Promise<World | null> {
    const file = await pickFile(this.document, 'application/json,.json');
    if (!file) return null;
    try {
      const world = await this.library.importFile(await file.text());
      this.toasts.show({ message: this.text.imported(world.name), kind: 'success' });
      return world;
    } catch (error) {
      const message = isAppError(error, 'validation') ? this.text.invalidFile : this.text.failed;
      this.toasts.show({ message, kind: 'error' });
      return null;
    }
  }

  private async perform(action: WorldAction, world: World): Promise<void> {
    const { id, name } = world;
    switch (action) {
      case 'rename': {
        const draft = await this.ask<WorldDraftInput>(CreateWorldDialogComponent, {
          name,
          description: world.description,
        });
        if (!draft) return;
        const renamed = await this.library.rename(id, draft);
        this.toasts.show({ message: this.text.renamed(renamed.name), kind: 'success' });
        return;
      }
      case 'duplicate': {
        const copy = await this.library.duplicate(id, BOOK_STRINGS.copyName(name));
        this.toasts.show({ message: this.text.duplicated(copy.name), kind: 'success' });
        return;
      }
      case 'export': {
        const file = await this.library.exportFile(id);
        downloadFile(this.document, file.name, new Blob([file.text], { type: 'application/json' }));
        this.toasts.show({ message: this.text.exported(file.name), kind: 'success' });
        return;
      }
      case 'archive':
      case 'unarchive': {
        const archive = action === 'archive';
        await this.library.setArchived(id, archive);
        this.toasts.show({
          message: archive ? this.text.archived(name) : this.text.unarchived(name),
          action: {
            label: this.text.undo,
            run: () => void this.run(archive ? 'unarchive' : 'archive', world),
          },
        });
        return;
      }
      case 'trash':
        await this.library.moveToTrash(id);
        this.toasts.show({
          message: this.text.trashed(name),
          action: { label: this.text.undo, run: () => void this.undoTrash(world) },
        });
        return;
      case 'restore':
        await this.library.restore(id);
        this.toasts.show({ message: this.text.restored(name), kind: 'success' });
        return;
      case 'delete':
        if (!(await this.ask<boolean>(DeleteWorldDialogComponent, name))) return;
        await this.library.deleteForever(id);
        this.toasts.show({ message: this.text.deleted(name) });
        return;
    }
  }

  private async undoTrash(world: World): Promise<void> {
    try {
      await this.library.restore(world.id);
    } catch {
      this.toasts.show({ message: this.text.failed, kind: 'error' });
    }
  }

  private ask<R>(
    component: typeof CreateWorldDialogComponent | typeof DeleteWorldDialogComponent,
    data: unknown,
  ): Promise<R | undefined> {
    const ref = this.dialogs.open<unknown, unknown, R>(component, {
      data,
      autoFocus: 'first-tabbable',
    });
    return new Promise((resolve) => ref.closed.subscribe(resolve));
  }
}
