import { MAP_IMAGE_TYPES } from '@domain/maps';
import { pickFile } from '@shared/utils/files';

/**
 * Abre o seletor de arquivos do sistema para uma imagem de mapa (menu "Importar outro
 * mapa"). Resolve com `null` se o usuário cancelar.
 */
export function pickImageFile(document: Document): Promise<File | null> {
  return pickFile(document, MAP_IMAGE_TYPES.join(','));
}
