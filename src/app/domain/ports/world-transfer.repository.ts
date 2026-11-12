import type { Uuid } from '../models/common';
import type { World } from '../models/world';
import type { WorldBundle } from '../transfer/world-bundle';

/**
 * Porta da exportação e importação de mundos (docs/07 › Exportar e importar). No
 * Supabase, a exportação é a Edge Function `export-world`; no modo local, o IndexedDB.
 */
export abstract class WorldTransferRepository {
  /**
   * O mundo inteiro, com as linhas que estão na lixeira dele e os bytes das imagens.
   * Mundo inexistente ou na lixeira: `AppError('not_found')`.
   */
  abstract exportWorld(worldId: Uuid): Promise<WorldBundle>;
  /**
   * Grava o pacote como um mundo novo do usuário atual, que vira o dono, numa só
   * transação. Os ids devem ser novos (`asWorldCopy`); um id que já existe rejeita com
   * `AppError('conflict')` e nada é gravado.
   */
  abstract importWorld(bundle: WorldBundle): Promise<World>;
}
